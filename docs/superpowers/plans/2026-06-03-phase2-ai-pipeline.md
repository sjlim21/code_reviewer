# Phase 2 — AI Pipeline Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve issue detection coverage, reduce false positives, add dual-model mode, and speed up analysis via file-hash caching and parallel file processing.

**Architecture:** `src/geminiAnalyzer.ts` and `src/claudeAnalyzer.ts` share a 7-stage pipeline. We add Stage 3.5 (cross-file), parallel file-level processing, confidence-based auto-triage, dual-model routing, and RAG threshold configuration. `src/agents/` holds all prompt files as markdown. `supabase/functions/` holds Edge Function proxies.

**Tech Stack:** TypeScript, Zustand, Supabase Edge Functions (Deno), pgvector, Gemini API, Claude API

---

## File Map

### New files (create)
- `src/agents/cross_file_agent.md` — Stage 3.5 cross-file analysis prompt
- `supabase/functions/gemini-proxy/index.ts` — add embedding + multi-call support (modify existing)

### Modified files
- `src/geminiAnalyzer.ts` — Stage 3.5, parallel file loop, hash caching, dual-model routing, confidence triage
- `src/claudeAnalyzer.ts` — dual-model: expose individual stage functions for cross-use
- `src/agents/verifier_agent.md` — extend context window hint, add dismiss pattern instructions
- `src/agents/reporter_agent.md` — add `output_language` parameter support
- `src/components/Settings.tsx` — dual-model toggle, RAG threshold slider
- `src/stores/uiStore.ts` — add `dualModelMode: boolean`, `ragThreshold: number`
- `setup.sql` — add `trigger_type`, `file_hash` columns to `analysis_runs`

### No DB migration needed for
- `confidence_score` — already exists on `issues` table
- `human_review_required` — already exists on `issues` table

---

## Task 1: DB Schema — Add trigger_type + file_hash to analysis_runs

**Files:**
- Modify: `setup.sql`
- Modify: `src/supabase.ts` (update AnalysisRun type)

- [ ] **Step 1: Read current analysis_runs definition in setup.sql**

```bash
grep -A 20 "CREATE TABLE.*analysis_runs" setup.sql
```

- [ ] **Step 2: Add columns to setup.sql**

After the existing `analysis_runs` columns, add:
```sql
-- In the CREATE TABLE public.analysis_runs block, add these columns:
trigger_type TEXT NOT NULL DEFAULT 'manual'
  CONSTRAINT analysis_runs_trigger_type_check
  CHECK (trigger_type IN ('manual', 'ci', 'api')),
file_hash TEXT,  -- SHA-256 of analyzed file content for cache lookup
```

Also add a partial index for cache lookups:
```sql
CREATE INDEX IF NOT EXISTS idx_analysis_runs_file_hash
  ON public.analysis_runs(file_hash)
  WHERE file_hash IS NOT NULL;
```

- [ ] **Step 3: Update AnalysisRun type in src/supabase.ts**

Read `src/supabase.ts` to find the `AnalysisRun` interface. Add:
```typescript
trigger_type: 'manual' | 'ci' | 'api'
file_hash: string | null
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**
```bash
git add setup.sql src/supabase.ts
git commit -m "feat: add trigger_type and file_hash to analysis_runs schema"
```

---

## Task 2: uiStore — Add dualModelMode + ragThreshold

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `tests/stores/uiStore.test.ts`

- [ ] **Step 1: Read current uiStore.ts**

- [ ] **Step 2: Add to UiState interface**
```typescript
dualModelMode: boolean
ragThreshold: number  // 0.0 - 1.0, default 0.5
setDualModelMode: (value: boolean) => void
setRagThreshold: (value: number) => void
```

- [ ] **Step 3: Add to create() initializer**
```typescript
dualModelMode: localStorage.getItem('dualModelMode') === 'true',
ragThreshold: parseFloat(localStorage.getItem('ragThreshold') ?? '0.5'),
setDualModelMode: (dualModelMode) => {
  localStorage.setItem('dualModelMode', String(dualModelMode))
  set({ dualModelMode })
},
setRagThreshold: (ragThreshold) => {
  localStorage.setItem('ragThreshold', String(ragThreshold))
  set({ ragThreshold })
},
```

- [ ] **Step 4: Add tests to tests/stores/uiStore.test.ts**
```typescript
it('setDualModelMode persists to localStorage', () => {
  act(() => useUiStore.getState().setDualModelMode(true))
  expect(useUiStore.getState().dualModelMode).toBe(true)
  expect(localStorage.getItem('dualModelMode')).toBe('true')
})

it('setRagThreshold clamps correctly in store', () => {
  act(() => useUiStore.getState().setRagThreshold(0.7))
  expect(useUiStore.getState().ragThreshold).toBe(0.7)
})
```

- [ ] **Step 5: Run tests**
```bash
npx vitest run tests/stores/uiStore.test.ts
```
Expected: all tests pass (7 total)

- [ ] **Step 6: Commit**
```bash
git add src/stores/uiStore.ts tests/stores/uiStore.test.ts
git commit -m "feat: add dualModelMode and ragThreshold to uiStore"
```

---

## Task 3: verifier_agent.md — Improve False Positive Reduction

**Files:**
- Modify: `src/agents/verifier_agent.md`

- [ ] **Step 1: Read current verifier_agent.md**

- [ ] **Step 2: Add these instructions to the prompt**

Find the section that describes what the verifier should do, and add:

```markdown
## Confidence Scoring

For each issue, assign a `confidence_score` between 0.0 and 1.0:
- 0.9–1.0: Definite vulnerability, no ambiguity
- 0.7–0.9: High confidence, clear evidence in code
- 0.5–0.7: Moderate confidence, context-dependent
- 0.3–0.5: Low confidence, possible false positive
- 0.0–0.3: Likely false positive, remove unless critical

Issues with confidence_score < 0.6 MUST have `status: "pending_review"` and
`human_review_required: true` in the output.

## Context Window

When evaluating an issue, consider up to 500 lines of surrounding context
(not just the immediate 300-line chunk). Cross-reference imports, function
calls, and data flow when available.

## Dismiss Patterns

If the code shows any of these patterns, lower confidence score significantly:
- The "vulnerability" is inside a test file (path contains test/, spec/, __tests__)
- The code is wrapped in a proper sanitization/validation function
- The "SQL injection" uses an ORM with parameterized queries
- The "XSS" occurs in a server-side template with auto-escaping enabled
```

- [ ] **Step 3: Commit**
```bash
git add src/agents/verifier_agent.md
git commit -m "feat: improve verifier_agent with confidence scoring and dismiss patterns"
```

---

## Task 4: cross_file_agent.md — New Stage 3.5 Agent

**Files:**
- Create: `src/agents/cross_file_agent.md`

- [ ] **Step 1: Create the agent file**

Create `src/agents/cross_file_agent.md`:
```markdown
# Cross-File Security Analyzer

You are a security analyst specializing in vulnerabilities that span multiple files.
Your job is to find issues that individual file analysis MISSES because they require
understanding how data flows between components.

## Input

You will receive:
- A list of issues found by the specialist agents (with file paths and line numbers)
- A summary of all analyzed files (function signatures, imports, exports)

## Your Task

Identify cross-file vulnerabilities:

### 1. Unvalidated Data Flow
Trace data from entry points (HTTP handlers, user input) through the codebase.
Flag paths where untrusted data reaches sensitive sinks (DB queries, shell commands,
file paths, HTML output) WITHOUT passing through a validation/sanitization function.

### 2. Authentication Bypass Chains
Identify sequences of function calls where auth checks in one file can be bypassed
by calling a deeper function directly from another file.

### 3. Privilege Escalation Paths
Find cases where a low-privilege function in file A calls a high-privilege function
in file B without re-checking authorization.

### 4. Secret Exposure
Find secrets or tokens defined in one file that are passed to logging, error messages,
or external calls in another file.

## Output Format

Return a JSON array of additional issues (same schema as specialist agent output).
Each issue MUST include:
- `cross_file: true`
- `data_flow_path`: array of "file:line" strings showing the vulnerability path
- `confidence_score`: 0.7+ only (cross-file analysis is inherently uncertain; don't
  report low-confidence findings)

If no cross-file issues are found, return an empty array `[]`.
```

- [ ] **Step 2: Commit**
```bash
git add src/agents/cross_file_agent.md
git commit -m "feat: add cross_file_agent.md for Stage 3.5 analysis"
```

---

## Task 5: geminiAnalyzer.ts — Parallel File Processing + Hash Caching

**Files:**
- Modify: `src/geminiAnalyzer.ts`

- [ ] **Step 1: Read src/geminiAnalyzer.ts**

Understand:
- How files are currently processed (sequential vs parallel)
- Where analysis results are written to Supabase
- The main entry point function signature

- [ ] **Step 2: Add SHA-256 file hash utility**

Near the top of the file (after imports), add:
```typescript
async function hashFileContent(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

- [ ] **Step 3: Add cache-check function**

```typescript
async function getCachedAnalysis(
  supabase: ReturnType<typeof getSupabaseClient>,
  fileHash: string,
  projectId: string
): Promise<Issue[] | null> {
  const { data } = await supabase
    .from('analysis_runs')
    .select('id')
    .eq('file_hash', fileHash)
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return null

  const { data: issues } = await supabase
    .from('issues')
    .select('*')
    .eq('analysis_run_id', data.id)

  return issues ?? null
}
```

- [ ] **Step 4: Parallelize file-level processing**

Find the section where files are analyzed sequentially (likely a `for...of` loop over files).
Replace sequential processing with parallel batches:

```typescript
// Replace sequential: for (const file of files) { await analyzeFile(file) }
// With parallel batches of 3:
const BATCH_SIZE = 3
for (let i = 0; i < files.length; i += BATCH_SIZE) {
  const batch = files.slice(i, i + BATCH_SIZE)
  await Promise.allSettled(
    batch.map(async (file) => {
      const hash = await hashFileContent(file.content)
      const cached = await getCachedAnalysis(supabase, hash, projectId)
      if (cached) {
        onProgress?.(`Cache hit: ${file.path}`)
        return cached
      }
      return analyzeFile(file, hash)
    })
  )
}
```

Note: Adapt this pattern to the actual structure you find in the file. The key changes are:
1. Compute hash per file
2. Check cache before analyzing
3. Process in parallel batches of 3

- [ ] **Step 5: Auto-triage low-confidence issues**

Find where issues are written to Supabase. Before the insert, add:
```typescript
// Auto-triage: low confidence → pending_review
const triaged = issues.map(issue => ({
  ...issue,
  status: (issue.confidence_score ?? 1) < 0.6 ? 'pending_review' as const : issue.status,
  human_review_required: (issue.confidence_score ?? 1) < 0.6 ? true : issue.human_review_required,
}))
```

- [ ] **Step 6: TypeScript check + build**
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```
Expected: 0 errors, build succeeds

- [ ] **Step 7: Run tests**
```bash
npx vitest run
```
Expected: all tests pass

- [ ] **Step 8: Commit**
```bash
git add src/geminiAnalyzer.ts
git commit -m "feat: add file hash caching and parallel processing to geminiAnalyzer"
```

---

## Task 6: geminiAnalyzer.ts — Stage 3.5 Cross-File Analysis

**Files:**
- Modify: `src/geminiAnalyzer.ts`

- [ ] **Step 1: Read cross_file_agent.md and current Stage 3 → Stage 4 transition**

- [ ] **Step 2: Add FileSummary type + cross-file analysis stage**

Add the type near the top of `src/geminiAnalyzer.ts`:
```typescript
interface FileSummary {
  path: string
  language: string
  functions: string[]   // function/method names exported
  imports: string[]     // imported module paths
  exports: string[]     // exported symbol names
}
```

After Stage 3 (specialist analysis) completes, before Stage 4 (RAG), add Stage 3.5:

```typescript
// Stage 3.5: Cross-file analysis
async function runCrossFileAnalysis(
  allIssues: Issue[],
  fileSummaries: FileSummary[],
  callGeminiOrClaude: (prompt: string, schema: object) => Promise<unknown>
): Promise<Issue[]> {
  const crossFilePrompt = CROSS_FILE_AGENT  // loaded from cross_file_agent.md
  const input = {
    existing_issues: allIssues.map(i => ({
      title: i.title, file_path: i.file_path, line: i.line_start, category: i.category
    })),
    file_summaries: fileSummaries
  }

  const result = await callGeminiOrClaude(
    `${crossFilePrompt}\n\nInput:\n${JSON.stringify(input)}`,
    { type: 'array', items: issueSchema }
  )

  return (result as Issue[]).filter(i => (i.confidence_score ?? 0) >= 0.7)
}
```

Add the call between Stage 3 and Stage 4 in the main pipeline:
```typescript
const crossFileIssues = await runCrossFileAnalysis(stage3Issues, fileSummaries, callGemini)
const allIssuesBeforeRAG = [...stage3Issues, ...crossFileIssues]
```

- [ ] **Step 3: Load cross_file_agent.md as raw string**

Add to the top of the file alongside other agent imports:
```typescript
import CROSS_FILE_AGENT from './agents/cross_file_agent.md?raw'
```

- [ ] **Step 4: Build check**
```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**
```bash
git add src/geminiAnalyzer.ts
git commit -m "feat: add Stage 3.5 cross-file analysis to geminiAnalyzer"
```

---

## Task 7: Dual-Model Mode

**Files:**
- Modify: `src/geminiAnalyzer.ts`
- Modify: `src/claudeAnalyzer.ts`

- [ ] **Step 1: Read both analyzer files to understand stage function exports**

Identify which functions handle which stages in each analyzer.

- [ ] **Step 2: Export stage-specific callers from claudeAnalyzer.ts**

Add to `src/claudeAnalyzer.ts`:
```typescript
// Export stage-specific callers for dual-model use
export async function callClaudeForVerification(prompt: string, schema: object) {
  return callClaude(prompt, schema)  // existing internal function
}

export async function callClaudeForScoring(prompt: string, schema: object) {
  return callClaude(prompt, schema)
}
```

- [ ] **Step 3: Add dual-model routing to geminiAnalyzer.ts**

In the main analysis function, add dual-model support:
```typescript
import { callClaudeForVerification, callClaudeForScoring } from './claudeAnalyzer'

// At the top of the analysis function:
const isDualModel = useUiStore.getState().dualModelMode

// Stage 5 (Verifier): use Claude if dual-model enabled
const verifyFn = isDualModel ? callClaudeForVerification : callGemini
const verifiedIssues = await runVerifier(issuesWithRAG, verifyFn)

// Stage 6 (Scorer): use Claude if dual-model enabled
const scoreFn = isDualModel ? callClaudeForScoring : callGemini
const scoredIssues = await runScorer(verifiedIssues, scoreFn)
```

Note: `useUiStore` cannot be imported in an analyzer (no React context in CLI). Instead, accept `dualModelMode` as a parameter to the main analysis function, and pass it from the component.

- [ ] **Step 4: Pass dualModelMode from Uploader**

In `src/components/Uploader.tsx` or `src/components/uploader/useAnalysis.ts`:
```typescript
const { dualModelMode } = useUiStore()
// Pass to analyzeCode(files, projectId, { dualModelMode })
```

- [ ] **Step 5: Build check**
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Run tests**
```bash
npx vitest run
```

- [ ] **Step 7: Commit**
```bash
git add src/geminiAnalyzer.ts src/claudeAnalyzer.ts src/components/uploader/useAnalysis.ts
git commit -m "feat: add dual-model mode (Gemini stages 1-3, Claude stages 5-6)"
```

---

## Task 8: RAG Threshold Parameterization

**Files:**
- Modify: `src/geminiAnalyzer.ts` (or `src/claudeAnalyzer.ts` — wherever `match_rag_knowledge` is called)

- [ ] **Step 1: Find where match_rag_knowledge is called**

```bash
grep -n "match_rag_knowledge\|ragThreshold\|match_count" src/geminiAnalyzer.ts src/claudeAnalyzer.ts
```

- [ ] **Step 2: Add threshold parameter**

Find the `match_rag_knowledge` RPC call. It currently uses a hardcoded threshold or match_count. Update to accept a threshold parameter:

```typescript
// Accept ragThreshold as function parameter (passed from component)
const ragResults = await supabase.rpc('match_rag_knowledge', {
  query_embedding: embedding,
  match_count: 5,
  target_language: language,
  match_threshold: ragThreshold ?? 0.5,  // new parameter
})
```

- [ ] **Step 3: Update match_rag_knowledge in setup.sql**

Add threshold filtering to the function:
```sql
-- In the match_rag_knowledge function definition, add threshold parameter:
CREATE OR REPLACE FUNCTION match_rag_knowledge(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  target_language text DEFAULT NULL,
  match_threshold float DEFAULT 0.5  -- NEW PARAMETER
)
RETURNS TABLE (...)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM rag_knowledge
  WHERE 1 - (embedding <=> query_embedding) > match_threshold  -- threshold filter
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 4: Pass ragThreshold from component**

In `useAnalysis.ts`:
```typescript
const { ragThreshold } = useUiStore()
// pass to analyzeCode(files, projectId, { dualModelMode, ragThreshold })
```

- [ ] **Step 5: Build + tests**
```bash
npx tsc --noEmit && npx vitest run && npm run build 2>&1 | tail -3
```

- [ ] **Step 6: Commit**
```bash
git add src/geminiAnalyzer.ts src/claudeAnalyzer.ts setup.sql src/components/uploader/useAnalysis.ts
git commit -m "feat: parameterize RAG similarity threshold"
```

---

## Task 9: Settings UI — Dual-Model Toggle + RAG Threshold

**Files:**
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Read Settings.tsx to find the AI provider section**

Look for where `aiProvider` is displayed/configured.

- [ ] **Step 2: Add dual-model toggle**

After the AI provider selector, add:
```tsx
import { useUiStore } from '../stores/uiStore'

const { dualModelMode, setDualModelMode, ragThreshold, setRagThreshold } = useUiStore()

// In JSX, add after aiProvider section:
<div className="flex items-center justify-between py-3 border-b border-white/5">
  <div>
    <p className="text-sm text-white/80">듀얼 모델 모드</p>
    <p className="text-xs text-white/40 mt-0.5">
      Gemini(분석) + Claude(검증/스코어링) — 두 API 키 필요
    </p>
  </div>
  <button
    onClick={() => setDualModelMode(!dualModelMode)}
    className={`w-10 h-5 rounded-full transition-colors ${
      dualModelMode ? 'bg-[var(--theme-accent)]' : 'bg-white/10'
    }`}
    aria-label="toggle dual model mode"
  >
    <span className={`block w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${
      dualModelMode ? 'translate-x-5' : 'translate-x-0'
    }`} />
  </button>
</div>

<div className="py-3">
  <div className="flex justify-between mb-2">
    <p className="text-sm text-white/80">RAG 유사도 임계값</p>
    <span className="text-xs text-white/40">{ragThreshold.toFixed(2)}</span>
  </div>
  <input
    type="range" min="0.3" max="0.9" step="0.05"
    value={ragThreshold}
    onChange={(e) => setRagThreshold(parseFloat(e.target.value))}
    className="w-full accent-[var(--theme-accent)]"
  />
  <p className="text-xs text-white/30 mt-1">
    높을수록 정밀하지만 관련 지식 매칭 수가 줄어듦 (기본값: 0.50)
  </p>
</div>
```

- [ ] **Step 3: Build + smoke test**
```bash
npm run build 2>&1 | tail -3
npm run dev
```
Open Settings tab, verify dual-model toggle and RAG slider render.

- [ ] **Step 4: Commit**
```bash
git add src/components/Settings.tsx
git commit -m "feat: add dual-model toggle and RAG threshold slider to Settings"
```

---

## Task 10: reporter_agent.md — Multilingual Output

**Files:**
- Modify: `src/agents/reporter_agent.md`

- [ ] **Step 1: Read reporter_agent.md**

- [ ] **Step 2: Add language parameter section**

Add to the prompt:
```markdown
## Output Language

The report must be written in the language specified by the `output_language` parameter:
- `"ko"` → Korean (한국어). Use formal Korean (존댓말). Technical terms (SQL Injection,
  XSS, CSRF, etc.) remain in English.
- `"en"` → English (default).

The `output_language` value will be provided in the input JSON.
All `title`, `description`, `suggestion`, and `summary` fields must be in the
specified language. Code snippets and file paths are always in their original form.
```

- [ ] **Step 3: Pass output_language from geminiAnalyzer.ts**

Find Stage 7 (Reporter) call in `geminiAnalyzer.ts`. Add `output_language` to the input:
```typescript
const reportInput = {
  issues: scoredIssues,
  output_language: options?.outputLanguage ?? 'en',
}
```

- [ ] **Step 4: Build**
```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit**
```bash
git add src/agents/reporter_agent.md src/geminiAnalyzer.ts
git commit -m "feat: add output_language parameter to reporter_agent"
```

---

## Task 11: Phase 2 Verification

- [ ] **Step 1: Run full test suite**
```bash
npx vitest run --reporter=verbose
```
Expected: all tests pass

- [ ] **Step 2: TypeScript check**
```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Production build**
```bash
npm run build
```
Expected: build succeeds

- [ ] **Step 4: Smoke test — dual-model toggle**
```bash
npm run dev
```
- Open Settings tab
- Toggle "듀얼 모델 모드" on/off — verify localStorage persists
- Adjust RAG threshold slider — verify value updates

- [ ] **Step 5: Smoke test — confidence triage**

In demo mode, check that issues with low confidence_score show as `pending_review` status in Dashboard.

- [ ] **Step 6: Verify new files exist**
```bash
ls src/agents/
```
Expected: `cross_file_agent.md` present

- [ ] **Step 7: Final commit summary**
```bash
git log --oneline HEAD~15..HEAD
```

---

## Phase 3 Plan

Phase 3 (CI/CD + History + Reports) plan:
`docs/superpowers/plans/2026-06-03-phase3-features.md`
