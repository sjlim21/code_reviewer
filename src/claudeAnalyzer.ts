import { getSupabaseClient, type Issue } from './supabase';
import generalPrompt from './agents/code-reviewer-agent.md?raw';
import parserPrompt from './agents/parser_agent.md?raw';
import specialistCppPrompt from './agents/specialist_cpp.md?raw';
import specialistPythonGoPrompt from './agents/specialist_python_go.md?raw';
import specialistJsTsPrompt from './agents/specialist_jsts.md?raw';
import specialistJvmClrPrompt from './agents/specialist_jvm_clr.md?raw';
import verifierPrompt from './agents/verifier_agent.md?raw';
import scorerPrompt from './agents/scorer_agent.md?raw';
import reporterPrompt from './agents/reporter_agent.md?raw';

// Re-use RAG embedding from Gemini (Claude has no embedding API)
import { getGeminiEmbeddingForClaude } from './geminiAnalyzer';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Category = 'security' | 'bug' | 'performance' | 'code_smell' | 'maintainability' | 'style' | 'documentation' | 'dependency' | 'test_coverage' | 'other';

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
  severity_suggestion: Severity;
  category: Category;
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
  severity_original: Severity;
  severity_verified: Severity;
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
  severity: Severity;
  category: Category;
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

// All Claude API calls are proxied via Supabase Edge Function (claude-proxy)
// to avoid exposing ANTHROPIC_API_KEY in the browser bundle.
const callClaude = async (
  systemPrompt: string,
  userPrompt: string,
  outputSchema?: object
): Promise<string> => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not initialized — cannot call Claude proxy');

  const { data, error } = await supabase.functions.invoke<{ result: string; error?: string }>('claude-proxy', {
    body: { systemPrompt, userPrompt, outputSchema }
  });

  if (error) throw new Error(`Claude proxy invocation failed: ${error.message}`);
  if (!data) throw new Error('Claude proxy returned no data');
  if (data.error) throw new Error(`Claude proxy error: ${data.error}`);
  return data.result;
};


// ---------------------------------------------------------------------------
// Named exports for dual-model mode: Gemini stages 1-4, Claude stages 5-6
// ---------------------------------------------------------------------------
export async function callClaudeForVerification(
  systemPrompt: string,
  userPrompt: string,
  outputSchema?: object
): Promise<string> {
  return callClaude(systemPrompt, userPrompt, outputSchema);
}

export async function callClaudeForScoring(
  systemPrompt: string,
  userPrompt: string,
  outputSchema?: object
): Promise<string> {
  return callClaude(systemPrompt, userPrompt, outputSchema);
}

const queryRagKnowledgeClaude = async (
  issueText: string,
  language: string
): Promise<{ source: string; id: string; title: string }[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const embedding = await getGeminiEmbeddingForClaude(issueText);
    if (!embedding || embedding.length === 0) return [];
    const { data, error } = await supabase.rpc('match_rag_knowledge', {
      query_embedding: embedding,
      match_count: 5,
      target_language: language
    });
    if (error) return [];
    return (data || []).map((r: { source: string; ref_id: string; title: string }) => ({
      source: r.source,
      id: r.ref_id,
      title: r.title
    }));
  } catch {
    return [];
  }
};

export const analyzeCodeWithClaude = async (
  fileName: string,
  codeContent: string,
  projectId: string,
  runId: string,
): Promise<Issue[]> => {
  if (!codeContent || codeContent.trim().length === 0) return [];
  if (codeContent.length > 1024 * 1024) {
    console.warn(`[Claude] 파일 ${fileName} 크기 초과 (>1MB)`);
    return [];
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[Claude] Supabase 클라이언트 미초기화 — Claude 분석 건너뜀');
    return [];
  }

  console.log(`[Claude Parser] Parsing: ${fileName}`);

  // ==========================================
  // [1] Parser Agent
  // ==========================================
  const parserSchema = {
    type: "OBJECT",
    properties: {
      file_name: { type: "STRING" },
      language: { type: "STRING" },
      complexity_hint: { type: "STRING" },
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

  let parsedResult: ParserResult;
  try {
    const parserText = await callClaude(
      parserPrompt,
      `File Name: ${fileName}\nContent:\n\`\`\`\n${codeContent}\n\`\`\``,
      parserSchema
    );
    parsedResult = JSON.parse(parserText) as ParserResult;
  } catch (e) {
    console.error(`[Claude Parser] ${fileName} 파싱 실패:`, e);
    return [];
  }

  const chunks = parsedResult.chunks || [];
  const detectedLanguage = (parsedResult.language || '').toLowerCase().trim();

  // ==========================================
  // [2] Language Router
  // ==========================================
  let specialistPrompt = generalPrompt;
  let routingLanguage = detectedLanguage;

  if (detectedLanguage === 'cpp' || detectedLanguage === 'c' || fileName.match(/\.(cpp|c|h)$/)) {
    routingLanguage = 'c/cpp'; specialistPrompt = specialistCppPrompt;
  } else if (['typescript', 'javascript', 'tsx', 'jsx'].includes(detectedLanguage) || fileName.match(/\.(ts|tsx|js|jsx)$/)) {
    routingLanguage = 'js/ts'; specialistPrompt = specialistJsTsPrompt;
  } else if (['python', 'go'].includes(detectedLanguage) || fileName.match(/\.(py|go)$/)) {
    routingLanguage = 'python/go'; specialistPrompt = specialistPythonGoPrompt;
  } else if (['java', 'csharp', 'cs', 'kotlin'].includes(detectedLanguage) || fileName.match(/\.(java|cs|kt)$/)) {
    routingLanguage = 'jvm/clr'; specialistPrompt = specialistJvmClrPrompt;
  }

  console.log(`[Claude Router] ${fileName} (${detectedLanguage}) -> ${routingLanguage}`);

  // ==========================================
  // [3] Specialist Analyst (parallel chunks)
  // ==========================================
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
            severity_suggestion: { type: "STRING" },
            category: { type: "STRING" },
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

  const specialistResults = await Promise.all(chunks.map(async (chunk) => {
    try {
      const prompt = JSON.stringify({
        chunk_id: chunk.chunk_id, language: parsedResult.language, file_name: fileName,
        line_start: chunk.line_start, line_end: chunk.line_end,
        context_summary: chunk.context_summary, dependencies: parsedResult.dependencies, content: chunk.content
      });
      const text = await callClaude(specialistPrompt, prompt, specialistSchema);
      return JSON.parse(text) as { chunk_id: string; raw_issues: SpecialistIssue[] };
    } catch (err) {
      console.error(`[Claude Specialist] chunk ${chunk.chunk_id} 실패:`, err);
      return { chunk_id: chunk.chunk_id, raw_issues: [] };
    }
  }));

  const mergedRawIssues = specialistResults.flatMap(r => r.raw_issues || []);
  if (mergedRawIssues.length === 0) {
    console.log(`[Claude Specialist] ${fileName}: 이슈 없음`);
    return [];
  }
  console.log(`[Claude Specialist] ${mergedRawIssues.length}개 원시 이슈`);

  // ==========================================
  // [4] RAG Retriever (Gemini embedding 재사용)
  // ==========================================
  console.log(`[Claude RAG] 지식베이스 매칭 중...`);
  const issuesWithRag = await Promise.all(mergedRawIssues.map(async (issue) => {
    const ragRefs = await queryRagKnowledgeClaude(`${issue.title}: ${issue.description}`, parsedResult.language);
    return { ...issue, rag_references: ragRefs };
  }));

  // ==========================================
  // [5] Verifier Agent
  // ==========================================
  console.log(`[Claude Verifier] 검증 중...`);
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
            severity_original: { type: "STRING" },
            severity_verified: { type: "STRING" },
            severity_changed: { type: "BOOLEAN" },
            severity_change_reason: { type: "STRING" },
            duplicate_of: { type: "STRING" },
            affected_lines: { type: "ARRAY", items: { type: "INTEGER" } },
            confidence_verified: { type: "NUMBER" },
            human_review_required: { type: "BOOLEAN" },
            rag_references: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, id: { type: "STRING" }, title: { type: "STRING" } }, required: ["source", "id", "title"] } },
            verifier_note: { type: "STRING" }
          },
          required: ["analyst_issue_id", "is_false_positive", "severity_original", "severity_verified", "severity_changed", "severity_change_reason", "duplicate_of", "affected_lines", "confidence_verified", "human_review_required", "rag_references", "verifier_note"]
        }
      },
      summary: {
        type: "OBJECT",
        properties: {
          total_raw: { type: "INTEGER" }, false_positives_removed: { type: "INTEGER" },
          severity_downgraded: { type: "INTEGER" }, duplicates_merged: { type: "INTEGER" },
          human_review_required: { type: "INTEGER" }, passed: { type: "INTEGER" }
        },
        required: ["total_raw", "false_positives_removed", "severity_downgraded", "duplicates_merged", "human_review_required", "passed"]
      }
    },
    required: ["verified_issues", "summary"]
  };

  let verifierResult: VerifierResult;
  try {
    const verifierText = await callClaude(verifierPrompt, JSON.stringify({
      file_name: fileName, language: parsedResult.language,
      raw_issues: issuesWithRag
    }), verifierSchema);
    verifierResult = JSON.parse(verifierText) as VerifierResult;
  } catch (e) {
    console.error(`[Claude Verifier] ${fileName} 검증 실패:`, e);
    verifierResult = { verified_issues: [], summary: { total_raw: 0, false_positives_removed: 0, severity_downgraded: 0, duplicates_merged: 0, human_review_required: 0, passed: 0 } };
  }

  const verifiedIssues = verifierResult.verified_issues || [];

  // ==========================================
  // [6] Scorer Agent
  // ==========================================
  console.log(`[Claude Scorer] 우선순위 계산 중...`);
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
                severity_base: { type: "INTEGER" }, impact_factor: { type: "INTEGER" },
                complexity_inv: { type: "INTEGER" }, attack_surface: { type: "INTEGER" }
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

  let scorerResult: ScorerResult;
  try {
    const scorerText = await callClaude(scorerPrompt, JSON.stringify({ verified_issues: verifiedIssues }), scorerSchema);
    scorerResult = JSON.parse(scorerText) as ScorerResult;
  } catch {
    scorerResult = { scored_issues: [] };
  }

  // ==========================================
  // [7] Reporter Agent
  // ==========================================
  console.log(`[Claude Reporter] 최종 보고서 생성 중...`);
  const reporterSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" }, description: { type: "STRING" }, suggestion: { type: "STRING" },
        rule_id: { type: "STRING" },
        severity: { type: "STRING" }, category: { type: "STRING" },
        priority_score: { type: "INTEGER" }, file_path: { type: "STRING" },
        line_start: { type: "INTEGER" }, line_end: { type: "INTEGER" }, code_snippet: { type: "STRING" },
        status: { type: "STRING" }, is_false_positive: { type: "BOOLEAN" },
        effort_minutes: { type: "INTEGER" }, confidence_score: { type: "NUMBER" },
        human_review_required: { type: "BOOLEAN" },
        rag_references: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, id: { type: "STRING" }, title: { type: "STRING" } }, required: ["source", "id", "title"] } },
        score_breakdown: { type: "OBJECT", properties: { severity_base: { type: "INTEGER" }, impact_factor: { type: "INTEGER" }, complexity_inv: { type: "INTEGER" }, attack_surface: { type: "INTEGER" } }, required: ["severity_base", "impact_factor", "complexity_inv", "attack_surface"] }
      },
      required: ["title", "description", "suggestion", "rule_id", "severity", "category", "priority_score", "file_path", "line_start", "line_end", "code_snippet", "status", "is_false_positive", "effort_minutes", "confidence_score", "human_review_required", "rag_references", "score_breakdown"]
    }
  };

  let finalIssues: ReporterIssue[];
  try {
    const reporterText = await callClaude(reporterPrompt, JSON.stringify({
      project_id: projectId, analysis_run_id: runId,
      raw_issues: issuesWithRag, verified_issues: verifiedIssues,
      scored_issues: scorerResult.scored_issues
    }), reporterSchema);
    finalIssues = JSON.parse(reporterText) as ReporterIssue[];
    if (!Array.isArray(finalIssues)) throw new Error('Not an array');
  } catch (e) {
    console.error(`[Claude Reporter] ${fileName} 보고서 생성 실패:`, e);
    return [];
  }

  return finalIssues
    .filter(issue => !issue.is_false_positive)
    .map((issue) => ({
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
      status: issue.status === 'pending_review' ? 'open' as const : (issue.status as 'open'),
      assignee_id: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
      confidence_score: issue.confidence_score,
      human_review_required: issue.human_review_required,
      rag_references: issue.rag_references,
      score_breakdown: issue.score_breakdown,
      effort_minutes: issue.effort_minutes,
      is_false_positive: false,
    }));
};
