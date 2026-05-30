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

// severity별 가중치 priority score 계산기
const calculatePriorityScore = (severity: string): number => {
  const base = {
    critical: 90,
    high: 70,
    medium: 40,
    low: 10,
    info: 0
  };
  const offset = Math.floor(Math.random() * 10); // 미세 다양성 가중
  return (base[severity as keyof typeof base] || 0) + offset;
};

export const analyzeCodeWithGemini = async (
  fileName: string,
  codeContent: string,
  projectId: string,
  runId: string,
  providerToken?: string
): Promise<Issue[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  if (!apiKey && !providerToken) {
    throw new Error("분석을 실행하기 위한 시스템 Gemini API Key 또는 Google OAuth 로그인 세션이 부재합니다. 구글 로그인을 확인해 주세요.");
  }

  // Google OAuth Access Token이 있다면 Bearer 헤더를 사용하고, 없다면 전역 API Key 파라미터를 사용합니다.
  const url = providerToken
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (providerToken) {
    headers['Authorization'] = `Bearer ${providerToken}`;
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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error: ${response.statusText} (${response.status}) - ${errText}`);
  }

  const resJson = await response.json();
  const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    return [];
  }

  const parsedIssues: GeminiIssueResponse[] = JSON.parse(rawText);

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
    priority_score: calculatePriorityScore(issue.severity),
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
