import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { useIssueStore } from '../stores/issueStore'
import type { Issue } from '../supabase'

type ReportLang = 'ko' | 'en'

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
    selectProject: '프로젝트를 선택하세요',
    noIssues: '이슈가 없습니다.',
    pdfButton: 'PDF로 저장 (프린트 다이얼로그)',
    mdButton: 'Markdown 다운로드 (.md)',
    language: '출력 언어',
    korean: '한국어',
    english: 'English',
    includeCount: '개 이슈 포함 (dismissed 제외)',
    currentProject: '현재 프로젝트',
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
    selectProject: 'Select a project',
    noIssues: 'No issues found.',
    pdfButton: 'Save as PDF (Print Dialog)',
    mdButton: 'Download Markdown (.md)',
    language: 'Output Language',
    korean: '한국어',
    english: 'English',
    includeCount: ' issues included (dismissed excluded)',
    currentProject: 'Project',
  },
}

function buildMarkdown(projectName: string, issues: Issue[], lang: ReportLang): string {
  const L = LABELS[lang]
  const locale = lang === 'ko' ? 'ko-KR' : 'en-US'
  const date = new Date().toLocaleString(locale)
  const bySev = (s: string) => issues.filter(i => i.severity === s).length

  const lines: string[] = [
    `# ${L.title}: ${projectName}`,
    ``,
    `> ${L.generatedAt}: ${date}`,
    ``,
    `## ${L.summary}`,
    ``,
    `| Severity | Count |`,
    `|----------|-------|`,
    `| ${L.critical} | ${bySev('critical')} |`,
    `| ${L.high} | ${bySev('high')} |`,
    `| ${L.medium} | ${bySev('medium')} |`,
    `| ${L.low} | ${bySev('low')} |`,
    `| **Total** | **${issues.length}** |`,
    ``,
    `## ${L.issueDetail}`,
    ``,
  ]

  for (const issue of issues) {
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

function openPdfPopup(projectName: string, issues: Issue[], lang: ReportLang): void {
  const L = LABELS[lang]
  const locale = lang === 'ko' ? 'ko-KR' : 'en-US'
  const date = new Date().toLocaleString(locale)
  const bySev = (s: string) => issues.filter(i => i.severity === s).length

  const issueHtml = issues.map(issue => `
    <div class="issue">
      <div class="issue-header sev-${issue.severity}">
        [${issue.severity.toUpperCase()}] ${issue.title}
      </div>
      <div class="issue-meta">${issue.file_path}:${issue.line_start}</div>
      <div class="issue-desc">${issue.description.replace(/\n/g, '<br>')}</div>
      ${issue.suggestion ? `<div class="issue-fix"><strong>${L.recommendation}:</strong><br>${issue.suggestion.replace(/\n/g, '<br>')}</div>` : ''}
    </div>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><title>${L.title}: ${projectName}</title>
<style>
body{font-family:'Segoe UI',sans-serif;margin:40px;color:#111}
h1{color:#1e293b;border-bottom:2px solid #6366f1;padding-bottom:8px}
.meta{color:#64748b;margin-bottom:24px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px}
.stat{padding:12px;border-radius:8px;text-align:center}
.stat .num{font-size:28px;font-weight:700}
.stat-critical{background:#fee2e2}.stat-critical .num{color:#dc2626}
.stat-high{background:#ffedd5}.stat-high .num{color:#ea580c}
.stat-medium{background:#fef9c3}.stat-medium .num{color:#ca8a04}
.stat-low{background:#dbeafe}.stat-low .num{color:#2563eb}
.issue{margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.issue-header{padding:10px 14px;font-weight:600;font-size:14px}
.sev-critical{background:#fee2e2;color:#dc2626}
.sev-high{background:#ffedd5;color:#ea580c}
.sev-medium{background:#fef9c3;color:#ca8a04}
.sev-low{background:#dbeafe;color:#2563eb}
.issue-meta{padding:6px 14px;font-size:12px;color:#64748b;background:#f8fafc}
.issue-desc,.issue-fix{padding:10px 14px;font-size:13px}
.issue-fix{background:#f0fdf4;border-top:1px solid #e2e8f0}
@media print{body{margin:20px}}
</style></head>
<body>
<h1>${L.title}</h1>
<div class="meta">${projectName} · ${L.generatedAt}: ${date}</div>
<div class="summary">
  <div class="stat stat-critical"><div class="num">${bySev('critical')}</div>${L.critical}</div>
  <div class="stat stat-high"><div class="num">${bySev('high')}</div>${L.high}</div>
  <div class="stat stat-medium"><div class="num">${bySev('medium')}</div>${L.medium}</div>
  <div class="stat stat-low"><div class="num">${bySev('low')}</div>${L.low}</div>
</div>
<h2>${L.issueDetail}</h2>
${issueHtml}
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`

  const popup = window.open('', '_blank', 'width=900,height=700')
  popup?.document.write(html)
  popup?.document.close()
}

export default function Reports() {
  const { selectedProject } = useProjectStore()
  const { issues } = useIssueStore()
  const [lang, setLang] = useState<ReportLang>('ko')

  const L = LABELS[lang]
  const activeIssues = issues.filter(i => i.status !== 'dismissed')

  const downloadMarkdown = () => {
    if (!selectedProject) return
    const md = buildMarkdown(selectedProject.name, activeIssues, lang)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
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
        <p className="text-white/30 text-sm">{L.selectProject}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-white">보고서 생성</h1>

      {/* Language selector */}
      <div className="rounded-xl border border-white/5 bg-white/2 p-4 flex items-center gap-4">
        <span className="text-sm text-white/50">{L.language}</span>
        {(['ko', 'en'] as ReportLang[]).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lang === l
                ? 'bg-[var(--theme-accent)] text-white'
                : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/8'
            }`}
          >
            {l === 'ko' ? L.korean : L.english}
          </button>
        ))}
      </div>

      {/* Severity preview */}
      <div className="grid grid-cols-4 gap-3">
        {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
          <div key={sev} className="rounded-xl border border-white/5 bg-white/2 p-3 text-center">
            <p className="text-2xl font-bold text-white">
              {activeIssues.filter(i => i.severity === sev).length}
            </p>
            <p className="text-xs text-white/40 mt-1">
              {L[sev as keyof typeof L] as string}
            </p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => openPdfPopup(selectedProject.name, activeIssues, lang)}
          className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--theme-accent)]/20 border border-[var(--theme-accent)]/30 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/30 transition-colors text-sm"
        >
          <Printer size={16} />
          {L.pdfButton}
        </button>
        <button
          onClick={downloadMarkdown}
          className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/8 transition-colors text-sm"
        >
          <Download size={16} />
          {L.mdButton}
        </button>
      </div>

      <p className="text-xs text-white/30">
        {activeIssues.length}{L.includeCount} · {L.currentProject}: {selectedProject.name}
      </p>
    </div>
  )
}
