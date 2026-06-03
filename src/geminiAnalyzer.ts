import { getSupabaseClient, type Issue } from './supabase';
import { callClaudeForVerification, callClaudeForScoring } from './claudeAnalyzer';
import generalPrompt from './agents/code-reviewer-agent.md?raw';
import parserPrompt from './agents/parser_agent.md?raw';
import specialistCppPrompt from './agents/specialist_cpp.md?raw';
import specialistPythonGoPrompt from './agents/specialist_python_go.md?raw';
import specialistJsTsPrompt from './agents/specialist_jsts.md?raw';
import specialistJvmClrPrompt from './agents/specialist_jvm_clr.md?raw';
import verifierPrompt from './agents/verifier_agent.md?raw';
import scorerPrompt from './agents/scorer_agent.md?raw';
import reporterPrompt from './agents/reporter_agent.md?raw';
import CROSS_FILE_AGENT from './agents/cross_file_agent.md?raw';

// ---------------------------------------------------------------------------
// SHA-256 file hash utility
// ---------------------------------------------------------------------------
async function hashFileContent(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Cache-check: look up a completed analysis_run for this hash+project and
// return its issues, or null when no cache entry exists.
// ---------------------------------------------------------------------------
async function getCachedIssues(
  supabase: ReturnType<typeof getSupabaseClient>,
  fileHash: string,
  projectId: string
): Promise<Issue[] | null> {
  if (!supabase) return null;
  const { data: run } = await supabase
    .from('analysis_runs')
    .select('id')
    .eq('file_hash', fileHash)
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return null;

  const { data: issues } = await supabase
    .from('issues')
    .select('*')
    .eq('analysis_run_id', run.id);

  return (issues as Issue[]) ?? null;
}

// ---------------------------------------------------------------------------
// Auto-triage: issues with confidence_score < 0.6 get flagged for human review
// ---------------------------------------------------------------------------
export function triageByConfidence(issues: Issue[]): Issue[] {
  return issues.map(issue => {
    const score = issue.confidence_score ?? 1;
    if (score < 0.6) {
      return { ...issue, status: 'pending_review' as const, human_review_required: true };
    }
    return issue;
  });
}

// ---------------------------------------------------------------------------
// Cross-file analysis types and helpers
// ---------------------------------------------------------------------------
interface FileSummary {
  path: string
  language: string
  functions: string[]
  imports: string[]
  exports: string[]
}

function buildFileSummaries(files: Array<{ path?: string; file_name?: string; content?: string; code?: string; language?: string }>): FileSummary[] {
  return files.map(file => {
    const content = file.content ?? file.code ?? ''
    const path = file.path ?? file.file_name ?? 'unknown'

    // Extract function names (simple regex — good enough for summary)
    const functionMatches = content.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>|(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{)/g) ?? []
    const functions = functionMatches.slice(0, 20).map(m => m.split(/[\s(]/)[1] ?? m).filter(Boolean)

    // Extract imports
    const importMatches = content.match(/(?:import|require)\s*(?:\(['"](.*?)['"]\)|[^'"]*['"](.*?)['"])/g) ?? []
    const imports = importMatches.slice(0, 15).map(m => {
      const match = m.match(/['"](.*?)['"]/)
      return match?.[1] ?? ''
    }).filter(Boolean)

    // Extract exports
    const exportMatches = content.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g) ?? []
    const exports = exportMatches.slice(0, 15).map(m => m.split(/\s+/).pop() ?? '').filter(Boolean)

    return {
      path,
      language: file.language ?? 'unknown',
      functions,
      imports,
      exports,
    }
  })
}

async function runCrossFileAnalysis(
  allIssues: Issue[],
  fileSummaries: FileSummary[],
  providerToken?: string
): Promise<Issue[]> {
  if (fileSummaries.length < 2) return []  // no point on single file

  const input = {
    existing_issues: allIssues.map(i => ({
      title: i.title,
      file_path: i.file_path,
      line: i.line_start,
      category: i.category,
    })),
    file_summaries: fileSummaries,
  }

  try {
    const resultText = await callGemini(
      CROSS_FILE_AGENT,
      `Input:\n${JSON.stringify(input)}`,
      '',
      providerToken
    )

    let parsed: unknown
    try {
      parsed = JSON.parse(resultText)
    } catch {
      const jsonMatch = resultText.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        return []
      }
    }

    const crossIssues = (Array.isArray(parsed) ? parsed : []) as Issue[]
    // Only keep high-confidence cross-file findings
    return crossIssues.filter(i => ((i as unknown as { confidence_score?: number }).confidence_score ?? 0) >= 0.7)
  } catch {
    // Cross-file analysis is best-effort — never fail the whole pipeline
    return []
  }
}

// ---------------------------------------------------------------------------
// Parallel batch analysis entry point
// Processes files in batches of PARALLEL_BATCH, with per-file hash caching.
// ---------------------------------------------------------------------------
const PARALLEL_BATCH = 3;

export interface FileEntry {
  name: string;
  content: string;
}

export const analyzeFilesInParallel = async (
  files: FileEntry[],
  projectId: string,
  runId: string,
  providerToken?: string,
  onProgress?: (msg: string) => void,
  dualModelMode?: boolean,
  options?: { ragThreshold?: number; outputLanguage?: 'ko' | 'en' }
): Promise<Issue[]> => {
  const supabase = getSupabaseClient();
  const allIssues: Issue[] = [];

  for (let i = 0; i < files.length; i += PARALLEL_BATCH) {
    const batch = files.slice(i, i + PARALLEL_BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        const fileHash = await hashFileContent(file.content);

        // Cache hit: reuse issues from a prior completed run
        const cached = await getCachedIssues(supabase, fileHash, projectId);
        if (cached) {
          onProgress?.(`Cache hit: ${file.name}`);
          return triageByConfidence(cached);
        }

        onProgress?.(`Analyzing: ${file.name}`);
        const issues = await analyzeCodeWithGemini(
          file.name,
          file.content,
          projectId,
          runId,
          providerToken,
          dualModelMode,
          options
        );
        return triageByConfidence(issues);
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        allIssues.push(...result.value);
      } else if (result.status === 'rejected') {
        console.error('[analyzeFilesInParallel] batch item failed:', result.reason);
      }
    }
  }

  // Stage 3.5: Cross-file analysis
  const fileSummaries = buildFileSummaries(files.map(f => ({ path: f.name, file_name: f.name, content: f.content })))
  const crossFileIssues = await runCrossFileAnalysis(allIssues, fileSummaries, providerToken)
  if (crossFileIssues.length > 0) {
    allIssues.push(...crossFileIssues)
    onProgress?.(`Cross-file analysis found ${crossFileIssues.length} additional issues`)
  }

  return allIssues;
};

interface Chunk {
  chunk_id: string;
  line_start: number;
  line_end: number;
  context_summary: string;
  content: string;
}

interface ParserResult {
  file_name: string;
  language: string;
  complexity_hint: 'low' | 'medium' | 'high';
  dependencies: string[];
  chunks: Chunk[];
}

interface SpecialistIssue {
  analyst_issue_id: string;
  title: string;
  description: string;
  severity_suggestion: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'bug' | 'performance' | 'code_smell' | 'maintainability' | 'style' | 'documentation' | 'dependency' | 'test_coverage' | 'other';
  file_path: string;
  line_start: number;
  line_end: number;
  code_snippet: string;
  as_is: string;
  to_be: string;
  confidence_raw: number;
  rag_references?: { source: string; id: string; title: string }[];
}

interface VerifierIssue {
  analyst_issue_id: string;
  is_false_positive: boolean;
  severity_original: 'critical' | 'high' | 'medium' | 'low' | 'info';
  severity_verified: 'critical' | 'high' | 'medium' | 'low' | 'info';
  severity_changed: boolean;
  severity_change_reason: string | null;
  duplicate_of: string | null;
  affected_lines: number[];
  confidence_verified: number;
  human_review_required: boolean;
  rag_references: { source: string; id: string; title: string }[];
  verifier_note: string;
}

interface VerifierResult {
  verified_issues: VerifierIssue[];
  summary: {
    total_raw: number;
    false_positives_removed: number;
    severity_downgraded: number;
    duplicates_merged: number;
    human_review_required: number;
    passed: number;
  };
}

interface ScorerIssue {
  analyst_issue_id: string;
  priority_score: number;
  score_breakdown: {
    severity_base: number;
    impact_factor: number;
    complexity_inv: number;
    attack_surface: number;
  };
  effort_minutes: number;
}

interface ScorerResult {
  scored_issues: ScorerIssue[];
}

interface ReporterIssue {
  title: string;
  description: string;
  suggestion: string;
  rule_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'bug' | 'performance' | 'code_smell' | 'maintainability' | 'style' | 'documentation' | 'dependency' | 'test_coverage' | 'other';
  priority_score: number;
  file_path: string;
  line_start: number;
  line_end: number;
  code_snippet: string;
  status: 'open' | 'pending_review';
  is_false_positive: boolean;
  effort_minutes: number;
  confidence_score: number;
  human_review_required: boolean;
  rag_references: { source: string; id: string; title: string }[];
  score_breakdown: {
    severity_base: number;
    impact_factor: number;
    complexity_inv: number;
    attack_surface: number;
  };
}

interface RagKnowledgeRow {
  ref_id: string;
  title: string;
  description: string;
  source: string;
  severity: string;
  similarity: number;
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
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        rulesConfig = parsed.filter(
          (r) => typeof r === 'object' && r !== null && typeof r.id === 'string' && typeof r.enabled === 'boolean'
        );
      }
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

const callGemini = async (
  systemPrompt: string,
  userPrompt: string,
  _apiKey: string,
  providerToken?: string,
  responseSchema?: object,
  responseMimeType?: string
): Promise<string> => {
  // OAuth provider token: call Gemini directly (token not stored in bundle)
  if (providerToken) {
    const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${providerToken}`,
    };
    const gcpProjectId = import.meta.env.VITE_GCP_PROJECT_ID || '';
    if (gcpProjectId) headers['x-goog-user-project'] = gcpProjectId;

    const requestBody: { contents: { parts: { text: string }[] }[]; generationConfig?: { responseMimeType?: string; responseSchema?: object } } = {
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
    };
    if (responseMimeType || responseSchema) {
      requestBody.generationConfig = {};
      if (responseMimeType) requestBody.generationConfig.responseMimeType = responseMimeType;
      if (responseSchema) requestBody.generationConfig.responseSchema = responseSchema;
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(requestBody) });
    if (!response.ok) {
      const errText = await response.text();
      let detail = `HTTP ${response.status} (${response.statusText})`;
      if (response.status === 429) detail = 'Gemini API 호출 한도(Rate Limit) 초과. 잠시 후 다시 시도해 주세요.';
      else if (response.status === 401 || response.status === 403) detail = '인증 오류. Google OAuth 토큰을 확인해 주세요.';
      throw new Error(`Gemini API Error: ${detail} - ${errText}`);
    }
    const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Gemini 빈 응답');
    return rawText;
  }

  // No OAuth token: route through Supabase Edge Function (GEMINI_API_KEY is a server secret)
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Gemini proxy unavailable — Supabase client not configured');

  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('gemini-proxy', {
    body: { systemPrompt, userPrompt, responseSchema }
  });

  if (error) throw new Error(`Gemini proxy error: ${error.message}`);
  if (!data?.text && data?.error) throw new Error(`Gemini proxy: ${data.error}`);
  if (!data?.text) throw new Error('Gemini 빈 응답 (proxy)');
  return data.text;
};

export const getGeminiEmbeddingForClaude = async (text: string): Promise<number[]> => {
  const result = await getGeminiEmbedding(text, '', undefined);
  return result || [];
};

const getGeminiEmbedding = async (
  text: string,
  _apiKey: string,
  providerToken?: string
): Promise<number[] | null> => {
  try {
    // OAuth provider token: call embedding API directly
    if (providerToken) {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerToken}`,
      };
      const gcpProjectId = import.meta.env.VITE_GCP_PROJECT_ID || '';
      if (gcpProjectId) headers['x-goog-user-project'] = gcpProjectId;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } })
      });
      if (!res.ok) { console.warn("Embedding generation failed:", res.statusText); return null; }
      const json = await res.json() as { embedding?: { values?: number[] } };
      return json.embedding?.values || null;
    }

    // No OAuth token: route through Supabase Edge Function
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.functions.invoke<{ embedding?: number[] | null; error?: string }>('gemini-proxy', {
      body: { type: 'embed', text }
    });
    if (error || !data?.embedding) return null;
    return data.embedding;
  } catch (err) {
    console.error("Embedding error:", err);
    return null;
  }
};

const queryRagKnowledge = async (
  embedding: number[],
  language: string,
  ragThreshold?: number
): Promise<RagKnowledgeRow[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('match_rag_knowledge', {
      query_embedding: embedding,
      match_count: 5,
      target_language: language,
      match_threshold: ragThreshold ?? 0.5
    });
    if (error) {
      console.warn("RAG query failed via RPC:", error);
      return [];
    }
    return (data || []) as RagKnowledgeRow[];
  } catch (err) {
    console.error("RAG query error:", err);
    return [];
  }
};

export const analyzeCodeWithGemini = async (
  fileName: string,
  codeContent: string,
  projectId: string,
  runId: string,
  providerToken?: string,
  dualModelMode?: boolean,
  options?: { ragThreshold?: number; outputLanguage?: 'ko' | 'en' }
): Promise<Issue[]> => {
  // 1. 입력 데이터 검증
  if (!codeContent || codeContent.trim().length === 0) {
    return [];
  }
  if (codeContent.length > 1024 * 1024) {
    console.warn(`[Warning] 파일 ${fileName} 크기가 너무 커 (>1MB) AI 분석을 건너뜁니다.`);
    return [];
  }

  // 오프라인 모드: OAuth 토큰도 없고 Supabase도 미구성이면 로컬 분석기 실행
  if (!providerToken && !getSupabaseClient()) {
    console.log(`[Offline Analyzer] Running local rule-based scan for: ${fileName}`);
    return analyzeLocally(fileName, codeContent, projectId, runId);
  }

  try {
    // ==========================================
    // [1] Parser Agent
    // ==========================================
    console.log(`[Parser Agent] Parsing and chunking: ${fileName}`);
    const parserSchema = {
      type: "OBJECT",
      properties: {
        file_name: { type: "STRING" },
        language: { type: "STRING" },
        complexity_hint: { type: "STRING", enum: ["low", "medium", "high"] },
        dependencies: { type: "ARRAY", items: { type: "STRING" } },
        chunks: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              chunk_id: { type: "STRING" },
              line_start: { type: "INTEGER" },
              line_end: { type: "INTEGER" },
              context_summary: { type: "STRING" },
              content: { type: "STRING" }
            },
            required: ["chunk_id", "line_start", "line_end", "context_summary", "content"]
          }
        }
      },
      required: ["file_name", "language", "complexity_hint", "dependencies", "chunks"]
    };

    const parserUserPrompt = `File Name: ${fileName}\nContent:\n\`\`\`\n${codeContent}\n\`\`\``;
    const parserResponseText = await callGemini(
      parserPrompt,
      parserUserPrompt,
      '',
      providerToken,
      parserSchema,
      "application/json"
    );

    let parsedResult: ParserResult;
    try {
      parsedResult = JSON.parse(parserResponseText) as ParserResult;
    } catch (e) {
      console.error("Parser response failed to parse as JSON, trying fallback extraction...");
      const jsonMatch = parserResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]) as ParserResult;
      } else {
        throw new Error("Parser Agent returned invalid JSON format", { cause: e });
      }
    }

    const chunks = parsedResult.chunks || [];
    const detectedLanguage = (parsedResult.language || '').toLowerCase().trim();

    // ==========================================
    // [2] Language Router & [3] Specialist Analyst
    // ==========================================
    let routingLanguage = detectedLanguage;
    let specialistPrompt = generalPrompt;

    if (routingLanguage === 'cpp' || routingLanguage === 'c' || fileName.endsWith('.cpp') || fileName.endsWith('.c') || fileName.endsWith('.h')) {
      routingLanguage = 'c/cpp';
      specialistPrompt = specialistCppPrompt;
    } else if (routingLanguage === 'typescript' || routingLanguage === 'javascript' || routingLanguage === 'tsx' || routingLanguage === 'jsx' || fileName.endsWith('.ts') || fileName.endsWith('.tsx') || fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
      routingLanguage = 'js/ts';
      specialistPrompt = specialistJsTsPrompt;
    } else if (routingLanguage === 'python' || routingLanguage === 'go' || fileName.endsWith('.py') || fileName.endsWith('.go')) {
      routingLanguage = 'python/go';
      specialistPrompt = specialistPythonGoPrompt;
    } else if (routingLanguage === 'java' || routingLanguage === 'csharp' || routingLanguage === 'cs' || fileName.endsWith('.java') || fileName.endsWith('.cs')) {
      routingLanguage = 'jvm/clr';
      specialistPrompt = specialistJvmClrPrompt;
    }

    console.log(`[Language Router] Routed ${fileName} (${detectedLanguage}) -> ${routingLanguage} Specialist`);

    const specialistSchema = {
      type: "OBJECT",
      properties: {
        chunk_id: { type: "STRING" },
        raw_issues: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              analyst_issue_id: { type: "STRING" },
              title: { type: "STRING" },
              description: { type: "STRING" },
              severity_suggestion: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
              category: { type: "STRING", enum: ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "dependency", "test_coverage", "other"] },
              file_path: { type: "STRING" },
              line_start: { type: "INTEGER" },
              line_end: { type: "INTEGER" },
              code_snippet: { type: "STRING" },
              as_is: { type: "STRING" },
              to_be: { type: "STRING" },
              confidence_raw: { type: "NUMBER" }
            },
            required: ["analyst_issue_id", "title", "description", "severity_suggestion", "category", "file_path", "line_start", "line_end", "code_snippet", "as_is", "to_be", "confidence_raw"]
          }
        }
      },
      required: ["chunk_id", "raw_issues"]
    };

    // Specialist 병렬 처리
    const specialistPromises = chunks.map(async (chunk) => {
      try {
        const specialistUserPrompt = JSON.stringify({
          chunk_id: chunk.chunk_id,
          language: parsedResult.language,
          file_name: fileName,
          line_start: chunk.line_start,
          line_end: chunk.line_end,
          context_summary: chunk.context_summary,
          dependencies: parsedResult.dependencies,
          content: chunk.content
        });

        const resText = await callGemini(
          specialistPrompt,
          specialistUserPrompt,
          '',
          providerToken,
          specialistSchema,
          "application/json"
        );
        return JSON.parse(resText) as { chunk_id: string; raw_issues: SpecialistIssue[] };
      } catch (err) {
        console.error(`[Specialist Error] Failed to scan chunk ${chunk.chunk_id}:`, err);
        return { chunk_id: chunk.chunk_id, raw_issues: [] };
      }
    });

    const specialistResults = await Promise.all(specialistPromises);
    const mergedRawIssues = specialistResults.flatMap((r) => r.raw_issues || []);

    if (mergedRawIssues.length === 0) {
      console.log(`[Specialist Analyst] No issues detected in any chunk of: ${fileName}`);
      return [];
    }

    console.log(`[Specialist Analyst] Detected ${mergedRawIssues.length} raw issues in: ${fileName}`);

    // ==========================================
    // [4] RAG retriever
    // ==========================================
    console.log(`[RAG Retriever] Embedding issues and matching with database RAG knowledge...`);
    const issuesWithRag = await Promise.all(mergedRawIssues.map(async (issue) => {
      try {
        const queryText = `${issue.title}: ${issue.description}`;
        const embedding = await getGeminiEmbedding(queryText, '', providerToken);
        let ragReferences: RagKnowledgeRow[] = [];
        if (embedding) {
          ragReferences = await queryRagKnowledge(embedding, parsedResult.language, options?.ragThreshold);
        }
        return {
          ...issue,
          rag_references: ragReferences.map((r) => ({
            source: r.source,
            id: r.ref_id,
            title: r.title
          }))
        };
      } catch (err) {
        console.warn(`[RAG Error] Failed to fetch references for issue ${issue.analyst_issue_id}:`, err);
        return {
          ...issue,
          rag_references: []
        };
      }
    }));

    // ==========================================
    // [5] Verifier Agent
    // ==========================================
    console.log(`[Verifier Agent] Cross-validating issues & filtering False Positives...`);
    const verifierSchema = {
      type: "OBJECT",
      properties: {
        verified_issues: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              analyst_issue_id: { type: "STRING" },
              is_false_positive: { type: "BOOLEAN" },
              severity_original: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
              severity_verified: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
              severity_changed: { type: "BOOLEAN" },
              severity_change_reason: { type: "STRING", nullable: true },
              duplicate_of: { type: "STRING", nullable: true },
              affected_lines: { type: "ARRAY", items: { type: "INTEGER" } },
              confidence_verified: { type: "NUMBER" },
              human_review_required: { type: "BOOLEAN" },
              rag_references: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    source: { type: "STRING" },
                    id: { type: "STRING" },
                    title: { type: "STRING" }
                  },
                  required: ["source", "id", "title"]
                }
              },
              verifier_note: { type: "STRING" }
            },
            required: ["analyst_issue_id", "is_false_positive", "severity_original", "severity_verified", "severity_changed", "severity_change_reason", "duplicate_of", "affected_lines", "confidence_verified", "human_review_required", "rag_references", "verifier_note"]
          }
        },
        summary: {
          type: "OBJECT",
          properties: {
            total_raw: { type: "INTEGER" },
            false_positives_removed: { type: "INTEGER" },
            severity_downgraded: { type: "INTEGER" },
            duplicates_merged: { type: "INTEGER" },
            human_review_required: { type: "INTEGER" },
            passed: { type: "INTEGER" }
          },
          required: ["total_raw", "false_positives_removed", "severity_downgraded", "duplicates_merged", "human_review_required", "passed"]
        }
      },
      required: ["verified_issues", "summary"]
    };

    const verifierUserPrompt = JSON.stringify({
      file_name: fileName,
      language: parsedResult.language,
      raw_issues: issuesWithRag
    });

    const verifierResponseText = dualModelMode
      ? await callClaudeForVerification(verifierPrompt, verifierUserPrompt, verifierSchema)
      : await callGemini(
          verifierPrompt,
          verifierUserPrompt,
          '',
          providerToken,
          verifierSchema,
          "application/json"
        );

    let verifierResult: VerifierResult;
    try {
      verifierResult = JSON.parse(verifierResponseText) as VerifierResult;
    } catch (e) {
      console.error("Verifier response failed to parse as JSON, trying fallback extraction...");
      const jsonMatch = verifierResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        verifierResult = JSON.parse(jsonMatch[0]) as VerifierResult;
      } else {
        throw new Error("Verifier Agent returned invalid JSON format", { cause: e });
      }
    }

    const verifiedIssues = verifierResult.verified_issues || [];

    // ==========================================
    // [6] Scorer Agent
    // ==========================================
    console.log(`[Scorer Agent] Calculating priority scores...`);
    const scorerSchema = {
      type: "OBJECT",
      properties: {
        scored_issues: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              analyst_issue_id: { type: "STRING" },
              priority_score: { type: "INTEGER" },
              score_breakdown: {
                type: "OBJECT",
                properties: {
                  severity_base: { type: "INTEGER" },
                  impact_factor: { type: "INTEGER" },
                  complexity_inv: { type: "INTEGER" },
                  attack_surface: { type: "INTEGER" }
                },
                required: ["severity_base", "impact_factor", "complexity_inv", "attack_surface"]
              },
              effort_minutes: { type: "INTEGER" }
            },
            required: ["analyst_issue_id", "priority_score", "score_breakdown", "effort_minutes"]
          }
        }
      },
      required: ["scored_issues"]
    };

    const scorerUserPrompt = JSON.stringify({
      verified_issues: verifiedIssues
    });

    const scorerResponseText = dualModelMode
      ? await callClaudeForScoring(scorerPrompt, scorerUserPrompt, scorerSchema)
      : await callGemini(
          scorerPrompt,
          scorerUserPrompt,
          '',
          providerToken,
          scorerSchema,
          "application/json"
        );

    let scorerResult: ScorerResult;
    try {
      scorerResult = JSON.parse(scorerResponseText) as ScorerResult;
    } catch (e) {
      console.error("Scorer response failed to parse as JSON, trying fallback extraction...");
      const jsonMatch = scorerResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scorerResult = JSON.parse(jsonMatch[0]) as ScorerResult;
      } else {
        throw new Error("Scorer Agent returned invalid JSON format", { cause: e });
      }
    }

    // ==========================================
    // [7] Reporter Agent
    // ==========================================
    console.log(`[Reporter Agent] Compiling final report...`);
    const reporterSchema = {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          suggestion: { type: "STRING" },
          rule_id: { type: "STRING" },
          severity: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
          category: { type: "STRING", enum: ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "dependency", "test_coverage", "other"] },
          priority_score: { type: "INTEGER" },
          file_path: { type: "STRING" },
          line_start: { type: "INTEGER" },
          line_end: { type: "INTEGER" },
          code_snippet: { type: "STRING" },
          status: { type: "STRING", enum: ["open", "pending_review"] },
          is_false_positive: { type: "BOOLEAN" },
          effort_minutes: { type: "INTEGER" },
          confidence_score: { type: "NUMBER" },
          human_review_required: { type: "BOOLEAN" },
          rag_references: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                source: { type: "STRING" },
                id: { type: "STRING" },
                title: { type: "STRING" }
              },
              required: ["source", "id", "title"]
            }
          },
          score_breakdown: {
            type: "OBJECT",
            properties: {
              severity_base: { type: "INTEGER" },
              impact_factor: { type: "INTEGER" },
              complexity_inv: { type: "INTEGER" },
              attack_surface: { type: "INTEGER" }
            },
            required: ["severity_base", "impact_factor", "complexity_inv", "attack_surface"]
          }
        },
        required: ["title", "description", "suggestion", "rule_id", "severity", "category", "priority_score", "file_path", "line_start", "line_end", "code_snippet", "status", "is_false_positive", "effort_minutes", "confidence_score", "human_review_required", "rag_references", "score_breakdown"]
      }
    };

    const reporterUserPrompt = JSON.stringify({
      project_id: projectId,
      analysis_run_id: runId,
      raw_issues: issuesWithRag,
      verified_issues: verifiedIssues,
      scored_issues: scorerResult.scored_issues,
      output_language: options?.outputLanguage ?? 'en',
    });

    const reporterResponseText = await callGemini(
      reporterPrompt,
      reporterUserPrompt,
      '',
      providerToken,
      reporterSchema,
      "application/json"
    );

    let finalIssues: ReporterIssue[];
    try {
      finalIssues = JSON.parse(reporterResponseText) as ReporterIssue[];
    } catch (e) {
      console.error("Reporter response failed to parse as JSON, trying fallback extraction...");
      const jsonMatch = reporterResponseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        finalIssues = JSON.parse(jsonMatch[0]) as ReporterIssue[];
      } else {
        throw new Error("Reporter Agent returned invalid JSON format", { cause: e });
      }
    }

    // Map to final Issue objects
    return finalIssues.map((issue) => ({
      id: crypto.randomUUID(),
      project_id: projectId,
      analysis_run_id: runId,
      title: issue.title,
      description: issue.description,
      suggestion: issue.suggestion,
      rule_id: issue.rule_id,
      severity: issue.severity,
      category: issue.category,
      priority_score: issue.priority_score,
      file_path: issue.file_path,
      line_start: issue.line_start,
      line_end: issue.line_end,
      code_snippet: issue.code_snippet,
      status: issue.status === 'pending_review' ? 'open' : issue.status,
      assignee_id: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
      confidence_score: issue.confidence_score,
      human_review_required: issue.human_review_required,
      rag_references: issue.rag_references,
      score_breakdown: issue.score_breakdown,
      effort_minutes: issue.effort_minutes
    }));

  } catch (err: unknown) {
    console.error("Multi-Agent pipeline failed, falling back to local analysis:", err);
    return analyzeLocally(fileName, codeContent, projectId, runId);
  }
};
