import { type Issue } from './supabase';
import agentPrompt from './agents/code-reviewer-agent.md?raw';

interface GeminiIssueResponse {
  title: string;
  description: string;
  suggestion: string;
  rule_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'bug' | 'performance' | 'code_smell' | 'maintainability' | 'style' | 'documentation' | 'dependency' | 'test_coverage' | 'other';
  line_start: number;
  line_end: number;
  code_snippet: string;
}

// severity별 가중치 및 결정론적 priority score 계산기 (W1, W2, W3 연구 논문 가중치 모델 차용)
const calculatePriorityScore = (severity: string, title = '', category = ''): number => {
  const base = {
    critical: 90,
    high: 70,
    medium: 40,
    low: 10,
    info: 0
  };
  const categoryBonus = {
    security: 8,
    bug: 6,
    performance: 4,
    code_smell: 2,
    maintainability: 2,
    style: 0,
    documentation: 0,
    dependency: 0,
    test_coverage: 0,
    other: 0
  };
  const baseVal = base[severity as keyof typeof base] || 0;
  const bonus = categoryBonus[category as keyof typeof categoryBonus] || 0;
  
  // 타이틀 해싱을 통해 0~2 사이의 결정론적(deterministic) 오프셋 가중치 부여
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash + title.charCodeAt(i)) % 3;
  }
  return Math.min(100, baseVal + bonus + hash);
};

export const analyzeCodeWithGemini = async (
  fileName: string,
  codeContent: string,
  projectId: string,
  runId: string,
  providerToken?: string
): Promise<Issue[]> => {
  // 1. 입력 데이터 검증 (API 한도 방지 및 토큰 낭비 차단)
  if (!codeContent || codeContent.trim().length === 0) {
    return [];
  }
  if (codeContent.length > 1024 * 1024) {
    console.warn(`[Warning] 파일 ${fileName} 크기가 너무 커 (>1MB) AI 분석을 건너뜁니다.`);
    return [];
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash';

  let url: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  } else if (providerToken) {
    // Google OAuth Access Token을 베어러 토큰으로 헤더에 탑재
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    headers['Authorization'] = `Bearer ${providerToken}`;
    const gcpProjectId = import.meta.env.VITE_GCP_PROJECT_ID || '';
    if (gcpProjectId) {
      headers['x-goog-user-project'] = gcpProjectId;
    }
  } else {
    throw new Error("분석을 실행하기 위한 구글 인증 세션(OAuth) 또는 시스템 API Key(VITE_GEMINI_API_KEY)가 부재합니다.");
  }

  const systemPrompt = agentPrompt;

  const userPrompt = `File Name: ${fileName}
Content:
\`\`\`
${codeContent}
\`\`\``;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n${userPrompt}`
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          description: "List of code review issues detected in the source code.",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              description: { type: "STRING" },
              suggestion: { type: "STRING" },
              rule_id: { type: "STRING" },
              severity: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
              category: { type: "STRING", enum: ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "other"] },
              line_start: { type: "INTEGER" },
              line_end: { type: "INTEGER" },
              code_snippet: { type: "STRING" }
            },
            required: ["title", "description", "suggestion", "rule_id", "severity", "category", "line_start", "line_end", "code_snippet"]
          }
        }
      }
    })
  });

  // 2. 구체적인 HTTP 에러 구별 핸들링
  if (!response.ok) {
    const errText = await response.text();
    let detail: string;
    if (response.status === 429) {
      detail = 'Gemini API 호출 한도(Rate Limit) 초과. 잠시 후 다시 시도해 주세요.';
    } else if (response.status === 401 || response.status === 403) {
      detail = '인증 오류. API 키 혹은 Google OAuth 토큰을 확인해 주세요.';
    } else {
      detail = `HTTP ${response.status} (${response.statusText})`;
    }
    throw new Error(`Gemini API Error: ${detail} - ${errText}`);
  }

  const resJson = await response.json();
  const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    return [];
  }

  // 3. JSON.parse 방어적 파싱 복구 로직 구현
  let parsedIssues: GeminiIssueResponse[];
  try {
    parsedIssues = JSON.parse(rawText);
  } catch (e: unknown) {
    const error = e as Error;
    console.error("Gemini response is not valid JSON, trying fallback extraction...", error.message);
    const jsonMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        parsedIssues = JSON.parse(jsonMatch[0]);
      } catch (innerErr: unknown) {
        const innerError = innerErr as Error;
        throw new Error(`Failed to parse Gemini JSON output (fallback failed): ${innerError.message}`, { cause: innerErr });
      }
    } else {
      throw new Error(`Failed to parse Gemini JSON output: ${error.message}`, { cause: e });
    }
  }

  // Gemini 응답 구조를 Supabase용 Issue 타입으로 매핑
  return parsedIssues.map((issue, idx) => ({
    id: `iss-gemini-${Date.now()}-${idx}`,
    project_id: projectId,
    analysis_run_id: runId,
    title: issue.title,
    description: issue.description,
    suggestion: issue.suggestion,
    rule_id: issue.rule_id,
    severity: issue.severity,
    category: issue.category === 'other' ? 'other' : issue.category,
    priority_score: calculatePriorityScore(issue.severity, issue.title, issue.category),
    file_path: fileName,
    line_start: issue.line_start,
    line_end: issue.line_end,
    code_snippet: issue.code_snippet,
    status: 'open',
    assignee_id: null,
    resolved_by: null,
    resolved_at: null,
    created_at: new Date().toISOString()
  }));
};
