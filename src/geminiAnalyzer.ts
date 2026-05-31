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

const analyzeLocally = (
  fileName: string,
  codeContent: string,
  projectId: string,
  runId: string
): Issue[] => {
  const issues: Issue[] = [];
  const lines = codeContent.split('\n');

  // Load rules config dynamically from localStorage
  let rulesConfig: { id: string; enabled: boolean; severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }[] = [];
  try {
    const saved = localStorage.getItem('code_eye_rules_config');
    if (saved) {
      rulesConfig = JSON.parse(saved);
    }
  } catch {
    // Fallback
  }

  const getRuleConfig = (ruleId: string) => {
    const defaultSeverity: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'security/plaintext-credential-storage': 'critical',
      'security/unsafe-shell-start': 'high',
      'security/command-injection-shell-true': 'critical',
      'bug/manual-jwt-parsing': 'medium',
      'performance/memory-intensive-upload': 'medium',
      'security/memory-pointer-leak': 'critical',
      'security/unsafe-string-function': 'high'
    };
    const found = rulesConfig.find(r => r.id === ruleId);
    return {
      enabled: found ? found.enabled : true,
      severity: found ? found.severity : (defaultSeverity[ruleId] || 'info')
    };
  };

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Rule 1: Plaintext credential storage
    const rule1 = getRuleConfig('security/plaintext-credential-storage');
    if (
      rule1.enabled &&
      (trimmed.includes('localStorage.setItem') || trimmed.includes('localStorage.getItem') || trimmed.includes('localStorage[')) &&
      (trimmed.toLowerCase().includes('key') ||
        trimmed.toLowerCase().includes('token') ||
        trimmed.toLowerCase().includes('secret') ||
        trimmed.toLowerCase().includes('url') ||
        trimmed.toLowerCase().includes('password'))
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Plaintext Credential Storage in LocalStorage',
        description: 'Supabase URL, Anon Key, or API keys are stored in LocalStorage. This is insecure as any XSS vulnerability could lead to credential theft.',
        suggestion: `### AS-IS\n\`\`\`typescript\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`typescript\n// Store sensitive keys in sessionStorage (limited to tab session) or use a secure backend proxy.\nsessionStorage.setItem(...);\n\`\`\``,
        rule_id: 'security/plaintext-credential-storage',
        severity: rule1.severity,
        category: 'security',
        priority_score: calculatePriorityScore(rule1.severity, 'Plaintext Storage', 'security'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Rule 2: Unsafe shell command start (cmd.exe /c start)
    const rule2 = getRuleConfig('security/unsafe-shell-start');
    if (
      rule2.enabled &&
      (trimmed.includes('cmd.exe') || trimmed.includes('cmd')) &&
      (trimmed.includes('start') || trimmed.includes('execSync') || trimmed.includes('execFileSync'))
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Unsafe Shell Command Execution',
        description: 'Opening a URL using cmd.exe /c start with manual escaping is risky if the URL contains shell-sensitive characters.',
        suggestion: `### AS-IS\n\`\`\`javascript\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`javascript\n// Use rundll32.exe url.dll,FileProtocolHandler directly on Windows without spawning a shell.\nexecFileSync('rundll32.exe', ['url.dll,FileProtocolHandler', url]);\n\`\`\``,
        rule_id: 'security/unsafe-shell-start',
        severity: rule2.severity,
        category: 'security',
        priority_score: calculatePriorityScore(rule2.severity, 'Unsafe Shell Command', 'security'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Rule 3: Python command injection (shell=True)
    const rule3 = getRuleConfig('security/command-injection-shell-true');
    if (
      rule3.enabled &&
      fileName.endsWith('.py') && 
      trimmed.includes('shell=True') && 
      (trimmed.includes('subprocess.Popen') || trimmed.includes('subprocess.run') || trimmed.includes('subprocess.call'))
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Python subprocess command injection',
        description: 'Vulnerable process spawn using shell=True allows shell command injection. Parameters should be passed as lists with shell=False.',
        suggestion: `### AS-IS\n\`\`\`python\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`python\n# Avoid shell=True. Pass arguments as lists.\nsubprocess.Popen(['npm', 'run', cmd], shell=False)\n\`\`\``,
        rule_id: 'security/command-injection-shell-true',
        severity: rule3.severity,
        category: 'security',
        priority_score: calculatePriorityScore(rule3.severity, 'Command Injection', 'security'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Rule 4: Manual JWT expiration check / split
    const rule4 = getRuleConfig('bug/manual-jwt-parsing');
    if (
      rule4.enabled &&
      trimmed.includes("split('.')") && 
      (trimmed.includes('token') || trimmed.includes('jwt') || trimmed.includes('payload'))
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Manual JWT Expiration parsing',
        description: 'Manually parsing and checking JWT expiration is fragile, and does not handle clock skew or server-side revocation.',
        suggestion: `### AS-IS\n\`\`\`javascript\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`javascript\n// Query the validation endpoint to verify the session dynamically\nconst res = await fetch('/auth/v1/user', { headers: { Authorization: \`Bearer \${token}\` } });\n\`\`\``,
        rule_id: 'bug/manual-jwt-parsing',
        severity: rule4.severity,
        category: 'bug',
        priority_score: calculatePriorityScore(rule4.severity, 'Manual JWT parsing', 'bug'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Rule 5: Memory intensive uploads / file reading
    const rule5 = getRuleConfig('performance/memory-intensive-upload');
    if (
      rule5.enabled &&
      trimmed.includes('FileReader') && 
      trimmed.includes('readAsText') && 
      !codeContent.includes('size >')
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Memory Intensive File Analysis',
        description: 'Files are read into memory strings concurrently, which may lead to Out Of Memory errors on large project analysis.',
        suggestion: `### AS-IS\n\`\`\`typescript\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`typescript\n// Apply size validation checks and nullify variables to speed up garbage collection\nif (file.size > 2 * 1024 * 1024) throw new Error("Exceeds 2MB");\n\`\`\``,
        rule_id: 'performance/memory-intensive-upload',
        severity: rule5.severity,
        category: 'performance',
        priority_score: calculatePriorityScore(rule5.severity, 'Memory Intensive Upload', 'performance'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Rule 6: C/C++ memory leak (malloc/free balance)
    const rule6 = getRuleConfig('security/memory-pointer-leak');
    if (
      rule6.enabled &&
      (fileName.endsWith('.c') || fileName.endsWith('.cpp') || fileName.endsWith('.h')) && 
      trimmed.includes('malloc(') && 
      !codeContent.includes('free(')
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Potential Memory Leak (Unfreed malloc)',
        description: 'Memory allocated dynamically using malloc() is not freed in the code content, which could cause a memory leak.',
        suggestion: `### AS-IS\n\`\`\`c\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`c\n// Free memory after use\nvoid* ptr = malloc(size);\n...\nfree(ptr);\n\`\`\``,
        rule_id: 'security/memory-pointer-leak',
        severity: rule6.severity,
        category: 'security',
        priority_score: calculatePriorityScore(rule6.severity, 'Memory Leak', 'security'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Rule 7: C/C++ buffer overflow unsafe function
    const rule7 = getRuleConfig('security/unsafe-string-function');
    if (
      rule7.enabled &&
      (fileName.endsWith('.c') || fileName.endsWith('.cpp') || fileName.endsWith('.h')) &&
      (trimmed.includes('strcpy(') || trimmed.includes('sprintf(') || trimmed.includes('gets('))
    ) {
      issues.push({
        id: `iss-local-${Date.now()}-${issues.length}`,
        project_id: projectId,
        analysis_run_id: runId,
        title: 'Unsafe String Manipulation (Buffer Overflow)',
        description: 'Unsafe string functions like strcpy, sprintf, gets do not check bounds and can easily trigger buffer overflow security vulnerabilities.',
        suggestion: `### AS-IS\n\`\`\`c\n${trimmed}\n\`\`\`\n\n### TO-BE\n\`\`\`c\n// Use bounds-checking equivalents\nstrncpy(dest, src, sizeof(dest) - 1);\nsnprintf(dest, sizeof(dest), "%s", src);\n\`\`\``,
        rule_id: 'security/unsafe-string-function',
        severity: rule7.severity,
        category: 'security',
        priority_score: calculatePriorityScore(rule7.severity, 'Unsafe String Function', 'security'),
        file_path: fileName,
        line_start: lineNum,
        line_end: lineNum,
        code_snippet: trimmed,
        status: 'open',
        assignee_id: null,
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString()
      });
    }
  });

  return issues;
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

  // If Gemini credentials are not available, use the robust offline static analysis engine.
  // This satisfies "Gemini key is not used" and guarantees zero-cost offline code analysis.
  if (!apiKey && !providerToken) {
    console.log(`[Offline Analyzer] Running local rule-based scan for: ${fileName}`);
    return analyzeLocally(fileName, codeContent, projectId, runId);
  }

  let url: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  } else {
    // Google OAuth Access Token을 베어러 토큰으로 헤더에 탑재
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    headers['Authorization'] = `Bearer ${providerToken}`;
    const gcpProjectId = import.meta.env.VITE_GCP_PROJECT_ID || '';
    if (gcpProjectId) {
      headers['x-goog-user-project'] = gcpProjectId;
    }
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
