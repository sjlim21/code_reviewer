# Phase 3 — New Features (CI/CD + History + Reports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 new features: CI/CD webhook integration (GitHub Actions), History tab (analysis run timeline), and Reports tab (PDF/Markdown in Korean or English).

**Architecture:** New Supabase Edge Function (`webhook-trigger`) handles CI/CD push events. `src/components/History.tsx` renders analysis_runs timeline using recharts. `src/components/Reports.tsx` generates PDF (existing popup pattern) and Markdown downloads. App.tsx placeholder tabs replaced with real components.

**Tech Stack:** React 19, TypeScript, Zustand, Supabase Edge Functions (Deno), recharts, Tailwind CSS 4

---

## File Map

### New files (create)
- `supabase/functions/webhook-trigger/index.ts` — Edge Function: receive GitHub webhook → trigger analysis
- `src/components/History.tsx` — analysis runs timeline + issue diff view
- `src/components/Reports.tsx` — PDF + Markdown report generation

### Modified files
- `setup.sql` — add `webhook_secret TEXT` to projects table
- `src/supabase.ts` — add `webhook_secret` to Project type
- `src/App.tsx` — replace History/Reports placeholders with real components
- `src/components/Settings.tsx` — add webhook URL display + secret rotation UI

---

## Task 1: DB Schema — webhook_secret on projects

**Files:**
- Modify: `setup.sql`
- Modify: `src/supabase.ts`

- [ ] **Step 1: Find projects table in setup.sql**
```bash
grep -n -A 20 "CREATE TABLE.*projects" setup.sql
```

- [ ] **Step 2: Add webhook_secret column**

In the `projects` CREATE TABLE block, add:
```sql
webhook_secret TEXT,  -- HMAC-SHA256 secret for GitHub webhook verification
```

Also add a helper function for generating secrets (place near other utility functions):
```sql
CREATE OR REPLACE FUNCTION generate_webhook_secret()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Update Project type in src/supabase.ts**

Find the `Project` interface. Add:
```typescript
webhook_secret: string | null
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**
```bash
git add setup.sql src/supabase.ts
git commit -m "feat: add webhook_secret to projects schema"
```

---

## Task 2: CI/CD Webhook Edge Function

**Files:**
- Create: `supabase/functions/webhook-trigger/index.ts`

- [ ] **Step 1: Read existing Edge Function for patterns**

Read `supabase/functions/gemini-proxy/index.ts` to understand:
- Deno/Edge Function import pattern
- Supabase client initialization
- CORS headers pattern

- [ ] **Step 2: Create webhook-trigger Edge Function**

Create `supabase/functions/webhook-trigger/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-requested-with, content-type, x-hub-signature-256',
}

async function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  return signature === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('x-hub-signature-256') ?? ''
    const event = req.headers.get('x-github-event') ?? ''

    // Only handle push and pull_request events
    if (!['push', 'pull_request'].includes(event)) {
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.parse(body)
    const projectId = payload.project_id as string | undefined

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'project_id required in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase with service role (server-side)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Look up project and verify webhook secret
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, name, webhook_secret')
      .eq('id', projectId)
      .single()

    if (error || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (project.webhook_secret) {
      const valid = await verifyGitHubSignature(body, signature, project.webhook_secret)
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Create an analysis_run record with trigger_type = 'ci'
    const { data: run, error: runError } = await supabase
      .from('analysis_runs')
      .insert({
        project_id: projectId,
        status: 'pending',
        trigger_type: 'ci',
        source_type: 'github',
        total_files: 0,
        analyzed_files: 0,
        issues_found: 0,
      })
      .select()
      .single()

    if (runError) {
      return new Response(JSON.stringify({ error: 'Failed to create analysis run' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        message: 'Analysis run created',
        run_id: run.id,
        project: project.name,
        commit: payload.after ?? payload.pull_request?.head?.sha ?? 'unknown',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 3: Verify TypeScript compiles (main app — Edge Function is Deno)**
```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/webhook-trigger/
git commit -m "feat: add webhook-trigger Edge Function for CI/CD integration"
```

---

## Task 3: History Tab Component

**Files:**
- Create: `src/components/History.tsx`

- [ ] **Step 1: Read TrendChart.tsx for recharts patterns**

Read `src/components/dashboard/TrendChart.tsx` to understand how recharts is used (imports, data format, custom tooltip pattern).

- [ ] **Step 2: Create History.tsx**

Create `src/components/History.tsx`:

```typescript
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'
import { useProjectStore } from '../stores/projectStore'
import { useIssueStore } from '../stores/issueStore'
import { getSupabaseClient } from '../supabase'
import type { AnalysisRun } from '../supabase'

interface RunDiff {
  newIssues: number
  resolvedIssues: number
}

export default function History() {
  const { selectedProject } = useProjectStore()
  const [runs, setRuns] = useState<AnalysisRun[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRun, setSelectedRun] = useState<AnalysisRun | null>(null)

  useEffect(() => {
    if (!selectedProject) return
    setLoading(true)
    getSupabaseClient()
      .from('analysis_runs')
      .select('*')
      .eq('project_id', selectedProject.id)
      .order('created_at', { ascending: true })
      .limit(30)
      .then(({ data }) => {
        setRuns(data ?? [])
        setLoading(false)
      })
  }, [selectedProject])

  // Build chart data from runs
  const chartData = runs.map((run, i) => {
    const prev = runs[i - 1]
    const diff: RunDiff = {
      newIssues: Math.max(0, run.issues_found - (prev?.issues_found ?? 0)),
      resolvedIssues: Math.max(0, (prev?.issues_found ?? 0) - run.issues_found),
    }
    return {
      date: new Date(run.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      total: run.issues_found,
      critical: run.critical_count,
      high: run.high_count,
      trigger: run.trigger_type,
      runId: run.id,
      ...diff,
    }
  })

  const triggerBadge = (t: string) => {
    const map: Record<string, string> = {
      manual: 'bg-white/10 text-white/40',
      ci: 'bg-blue-500/20 text-blue-300',
      api: 'bg-purple-500/20 text-purple-300',
    }
    return map[t] ?? map.manual
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-white/30">프로젝트를 선택하세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">분석 히스토리</h1>

      {loading ? (
        <div className="text-white/40 text-sm">로딩 중...</div>
      ) : runs.length === 0 ? (
        <div className="text-white/40 text-sm">분석 기록이 없습니다.</div>
      ) : (
        <>
          {/* Issue trend chart */}
          <div className="rounded-xl border border-white/5 bg-white/2 p-4">
            <p className="text-sm text-white/60 mb-4">이슈 추이 (최근 30회)</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="var(--theme-accent)" strokeWidth={2} dot={false} name="전체" />
                <Line type="monotone" dataKey="critical" stroke="#f87171" strokeWidth={1.5} dot={false} name="Critical" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* New vs Resolved bar chart */}
          <div className="rounded-xl border border-white/5 bg-white/2 p-4">
            <p className="text-sm text-white/60 mb-4">신규 / 해결 이슈</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                />
                <Bar dataKey="newIssues" fill="#f87171" name="신규" />
                <Bar dataKey="resolvedIssues" fill="#34d399" name="해결" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Run list */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            {[...runs].reverse().map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run.id === selectedRun?.id ? null : run)}
                className="flex items-center justify-between px-4 py-3 border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${triggerBadge(run.trigger_type)}`}>
                    {run.trigger_type}
                  </span>
                  <span className="text-sm text-white/70">
                    {new Date(run.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/50">
                  <span>이슈 {run.issues_found}</span>
                  <span className="text-red-400">Critical {run.critical_count}</span>
                  <span className={`px-2 py-0.5 rounded-full ${
                    run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-white/10 text-white/40'
                  }`}>{run.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build check**
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -4
```

- [ ] **Step 4: Commit**
```bash
git add src/components/History.tsx
git commit -m "feat: add History tab with analysis run timeline and charts"
```

---

## Task 4: Reports Tab Component

**Files:**
- Create: `src/components/Reports.tsx`

- [ ] **Step 1: Read Dashboard.tsx PDF export section**

Read `src/components/Dashboard.tsx` around the PDF export logic (lines 217-332 per exploration). Understand:
- How the popup window is opened
- How HTML is constructed
- The print trigger

- [ ] **Step 2: Create Reports.tsx**

Create `src/components/Reports.tsx`:

```typescript
import { useState } from 'react'
import { FileText, Download, Printer } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useIssueStore } from '../stores/issueStore'
import { useUiStore } from '../stores/uiStore'
import type { Issue } from '../supabase'

type ReportLang = 'ko' | 'en'
type ReportFormat = 'pdf' | 'markdown'

const LABELS = {
  ko: {
    title: '코드 분석 보고서',
    summary: '요약',
    critical: '치명적',
    high: '높음',
    medium: '중간',
    low: '낮음',
    issueDetail: '이슈 상세',
    recommendation: '권고사항',
    generatedAt: '생성일시',
  },
  en: {
    title: 'Code Analysis Report',
    summary: 'Summary',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    issueDetail: 'Issue Details',
    recommendation: 'Recommendations',
    generatedAt: 'Generated at',
  },
}

function buildMarkdown(
  projectName: string,
  issues: Issue[],
  lang: ReportLang
): string {
  const L = LABELS[lang]
  const critical = issues.filter(i => i.severity === 'critical')
  const high = issues.filter(i => i.severity === 'high')
  const medium = issues.filter(i => i.severity === 'medium')
  const low = issues.filter(i => i.severity === 'low')
  const date = new Date().toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')

  const lines: string[] = [
    `# ${L.title}: ${projectName}`,
    ``,
    `> ${L.generatedAt}: ${date}`,
    ``,
    `## ${L.summary}`,
    ``,
    `| Severity | Count |`,
    `|----------|-------|`,
    `| ${L.critical} | ${critical.length} |`,
    `| ${L.high} | ${high.length} |`,
    `| ${L.medium} | ${medium.length} |`,
    `| ${L.low} | ${low.length} |`,
    `| **Total** | **${issues.length}** |`,
    ``,
    `## ${L.issueDetail}`,
    ``,
  ]

  for (const issue of issues.filter(i => i.status !== 'dismissed')) {
    lines.push(`### [${issue.severity.toUpperCase()}] ${issue.title}`)
    lines.push(``)
    lines.push(`**File:** \`${issue.file_path}:${issue.line_start}\``)
    lines.push(``)
    lines.push(issue.description)
    lines.push(``)
    if (issue.suggestion) {
      lines.push(`**${L.recommendation}:**`)
      lines.push(``)
      lines.push(issue.suggestion)
      lines.push(``)
    }
    lines.push(`---`)
    lines.push(``)
  }

  return lines.join('\n')
}

function openPdfPopup(
  projectName: string,
  issues: Issue[],
  lang: ReportLang
): void {
  const L = LABELS[lang]
  const date = new Date().toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')
  const critical = issues.filter(i => i.severity === 'critical').length
  const high = issues.filter(i => i.severity === 'high').length
  const medium = issues.filter(i => i.severity === 'medium').length
  const low = issues.filter(i => i.severity === 'low').length

  const issueRows = issues
    .filter(i => i.status !== 'dismissed')
    .map(issue => `
      <div class="issue">
        <div class="issue-header sev-${issue.severity}">
          [${issue.severity.toUpperCase()}] ${issue.title}
        </div>
        <div class="issue-meta">${issue.file_path}:${issue.line_start}</div>
        <div class="issue-desc">${issue.description}</div>
        ${issue.suggestion ? `<div class="issue-fix"><strong>${L.recommendation}:</strong><br>${issue.suggestion}</div>` : ''}
      </div>
    `).join('')

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${L.title}: ${projectName}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 40px; color: #111; }
  h1 { color: #1e293b; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
  .meta { color: #64748b; margin-bottom: 24px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .stat { padding: 12px; border-radius: 8px; text-align: center; }
  .stat .num { font-size: 28px; font-weight: 700; }
  .stat-critical { background: #fee2e2; } .stat-critical .num { color: #dc2626; }
  .stat-high { background: #ffedd5; } .stat-high .num { color: #ea580c; }
  .stat-medium { background: #fef9c3; } .stat-medium .num { color: #ca8a04; }
  .stat-low { background: #dbeafe; } .stat-low .num { color: #2563eb; }
  .issue { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .issue-header { padding: 10px 14px; font-weight: 600; font-size: 14px; }
  .sev-critical { background: #fee2e2; color: #dc2626; }
  .sev-high { background: #ffedd5; color: #ea580c; }
  .sev-medium { background: #fef9c3; color: #ca8a04; }
  .sev-low { background: #dbeafe; color: #2563eb; }
  .issue-meta { padding: 6px 14px; font-size: 12px; color: #64748b; background: #f8fafc; }
  .issue-desc, .issue-fix { padding: 10px 14px; font-size: 13px; }
  .issue-fix { background: #f0fdf4; border-top: 1px solid #e2e8f0; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${L.title}</h1>
<div class="meta">${projectName} &nbsp;·&nbsp; ${L.generatedAt}: ${date}</div>
<div class="summary">
  <div class="stat stat-critical"><div class="num">${critical}</div>${L.critical}</div>
  <div class="stat stat-high"><div class="num">${high}</div>${L.high}</div>
  <div class="stat stat-medium"><div class="num">${medium}</div>${L.medium}</div>
  <div class="stat stat-low"><div class="num">${low}</div>${L.low}</div>
</div>
<h2>${L.issueDetail}</h2>
${issueRows}
<script>window.onload = () => { window.print() }<\/script>
</body>
</html>`

  const popup = window.open('', '_blank', 'width=900,height=700')
  popup?.document.write(html)
  popup?.document.close()
}

export default function Reports() {
  const { selectedProject } = useProjectStore()
  const { issues } = useIssueStore()
  const [lang, setLang] = useState<ReportLang>('ko')

  const activeIssues = issues.filter(i => i.status !== 'dismissed')

  const downloadMarkdown = () => {
    if (!selectedProject) return
    const md = buildMarkdown(selectedProject.name, activeIssues, lang)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedProject.name}-report-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-white/30">프로젝트를 선택하세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-white">보고서 생성</h1>

      {/* Language selector */}
      <div className="rounded-xl border border-white/5 bg-white/2 p-4 flex items-center gap-4">
        <span className="text-sm text-white/60">출력 언어</span>
        {(['ko', 'en'] as ReportLang[]).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lang === l
                ? 'bg-[var(--theme-accent)] text-white'
                : 'bg-white/5 text-white/50 hover:text-white'
            }`}
          >
            {l === 'ko' ? '한국어' : 'English'}
          </button>
        ))}
      </div>

      {/* Stats preview */}
      <div className="grid grid-cols-4 gap-3">
        {(['critical','high','medium','low'] as const).map(sev => (
          <div key={sev} className="rounded-xl border border-white/5 p-3 text-center">
            <p className="text-2xl font-bold text-white">
              {activeIssues.filter(i => i.severity === sev).length}
            </p>
            <p className="text-xs text-white/40 mt-1 capitalize">{sev}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => openPdfPopup(selectedProject.name, activeIssues, lang)}
          className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--theme-accent)]/20 border border-[var(--theme-accent)]/30 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/30 transition-colors"
        >
          <Printer size={16} />
          PDF로 저장 (프린트 다이얼로그)
        </button>
        <button
          onClick={downloadMarkdown}
          className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/8 transition-colors"
        >
          <Download size={16} />
          Markdown 다운로드 (.md)
        </button>
      </div>

      <p className="text-xs text-white/30">
        {activeIssues.length}개 이슈 포함 (dismissed 제외) · 현재 프로젝트: {selectedProject.name}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Build check**
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -4
```

- [ ] **Step 4: Commit**
```bash
git add src/components/Reports.tsx
git commit -m "feat: add Reports tab with PDF and Markdown export"
```

---

## Task 5: Wire History + Reports into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read App.tsx placeholder sections**

```bash
grep -n "history\|reports\|coming soon\|History\|Reports" src/App.tsx | head -20
```

- [ ] **Step 2: Replace placeholders with real components**

Add imports at top of App.tsx:
```typescript
import History from './components/History'
import Reports from './components/Reports'
```

Replace the placeholder JSX:
```tsx
// BEFORE:
{activeTab === 'history' && (
  <div className="flex items-center justify-center min-h-[60vh]">
    <p className="text-white/30">History — coming soon</p>
  </div>
)}
{activeTab === 'reports' && (
  <div className="flex items-center justify-center min-h-[60vh]">
    <p className="text-white/30">Reports — coming soon</p>
  </div>
)}

// AFTER:
{activeTab === 'history' && <History />}
{activeTab === 'reports' && <Reports />}
```

- [ ] **Step 3: Build check**
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -4
```

- [ ] **Step 4: Commit**
```bash
git add src/App.tsx
git commit -m "feat: wire History and Reports components into App.tsx"
```

---

## Task 6: Settings — Webhook URL + Secret Management

**Files:**
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Read Settings.tsx**

Find the project section or integration section where webhook UI fits naturally.

- [ ] **Step 2: Add webhook management UI**

```tsx
import { Copy, RefreshCw } from 'lucide-react'
import { getSupabaseClient } from '../supabase'

// In the component body:
const [webhookCopied, setWebhookCopied] = useState(false)
const [rotatingSecret, setRotatingSecret] = useState(false)

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const webhookUrl = selectedProject
  ? `${supabaseUrl}/functions/v1/webhook-trigger`
  : ''

const copyWebhookUrl = () => {
  navigator.clipboard.writeText(webhookUrl)
  setWebhookCopied(true)
  setTimeout(() => setWebhookCopied(false), 2000)
}

const rotateWebhookSecret = async () => {
  if (!selectedProject || isDemoSession) return
  setRotatingSecret(true)
  const newSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  await getSupabaseClient()
    .from('projects')
    .update({ webhook_secret: newSecret })
    .eq('id', selectedProject.id)
  setRotatingSecret(false)
}
```

Add JSX section (match existing styling):
```tsx
{selectedProject && (
  <div className="rounded-xl border border-white/5 p-4 space-y-3">
    <p className="text-sm font-medium text-white/80">CI/CD 웹훅</p>
    <p className="text-xs text-white/40">
      GitHub Actions에서 분석을 자동 트리거합니다.
    </p>

    {/* Webhook URL */}
    <div>
      <p className="text-xs text-white/50 mb-1">Webhook URL</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-white/5 rounded px-3 py-2 text-white/60 truncate">
          {webhookUrl}
        </code>
        <button
          onClick={copyWebhookUrl}
          className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs transition-colors"
        >
          {webhookCopied ? '복사됨!' : <Copy size={12} />}
        </button>
      </div>
    </div>

    {/* Rotate secret */}
    <div>
      <p className="text-xs text-white/50 mb-1">Webhook Secret</p>
      <button
        onClick={rotateWebhookSecret}
        disabled={rotatingSecret || isDemoSession}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs transition-colors disabled:opacity-40"
      >
        <RefreshCw size={12} className={rotatingSecret ? 'animate-spin' : ''} />
        시크릿 재발급
      </button>
    </div>

    {/* GitHub Actions snippet */}
    <details className="group">
      <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">
        GitHub Actions 예시 보기
      </summary>
      <pre className="mt-2 text-xs bg-white/5 rounded p-3 text-white/50 overflow-x-auto">{`# .github/workflows/codeeye.yml
on: [push, pull_request]
jobs:
  codeeye:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: CodeEye Analysis
        run: |
          curl -X POST \\
            -H "Content-Type: application/json" \\
            -H "X-Hub-Signature-256: \${{ secrets.CODEEYE_SECRET }}" \\
            -d '{"project_id":"\${{ vars.CODEEYE_PROJECT_ID }}"}' \\
            \${{ secrets.CODEEYE_WEBHOOK_URL }}`}</pre>
    </details>
  </div>
)}
```

- [ ] **Step 3: Build check**
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -4
```

- [ ] **Step 4: Commit**
```bash
git add src/components/Settings.tsx
git commit -m "feat: add webhook URL and secret management to Settings"
```

---

## Task 7: Phase 3 Verification

- [ ] **Step 1: Run all tests**
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

- [ ] **Step 4: Smoke test — History tab**
```bash
npm run dev
```
- Navigate to History tab → verify "프로젝트를 선택하세요" placeholder
- Select a project → verify loading state (may be empty in dev if no runs)

- [ ] **Step 5: Smoke test — Reports tab**
- Navigate to Reports tab
- Toggle language (한국어 / English)
- Click PDF button → verify popup opens with print dialog
- Click Markdown button → verify .md file downloads

- [ ] **Step 6: Smoke test — Settings webhook UI**
- Navigate to Settings
- Select a project → verify webhook URL and secret rotation UI appears

- [ ] **Step 7: Commit verification result**
```bash
git log --oneline HEAD~10..HEAD
```
