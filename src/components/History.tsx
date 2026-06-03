import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import { useProjectStore } from '../stores/projectStore'
import { getSupabaseClient } from '../supabase'
import type { AnalysisRun, Issue } from '../supabase'

interface ChartPoint {
  date: string
  total: number
  critical: number
  high: number
  medium: number
  low: number
  runId: string
}

interface RunDiff {
  newCount: number
  resolvedCount: number
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#60a5fa',
  info: '#a78bfa',
}

const triggerBadgeClass = (t: string) => {
  const map: Record<string, string> = {
    manual: 'bg-white/10 text-white/40',
    ci: 'bg-blue-500/20 text-blue-300',
    api: 'bg-purple-500/20 text-purple-300',
  }
  return map[t] ?? map['manual']
}

const severityBadgeClass = (s: string) => {
  const map: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-blue-500/20 text-blue-400',
    info: 'bg-purple-500/20 text-purple-400',
  }
  return map[s] ?? 'bg-white/10 text-white/40'
}

const statusBadgeClass = (s: string) => {
  const map: Record<string, string> = {
    open: 'bg-red-500/20 text-red-400',
    resolved: 'bg-green-500/20 text-green-400',
    dismissed: 'bg-white/10 text-white/30',
    in_progress: 'bg-blue-500/20 text-blue-300',
    pending_review: 'bg-yellow-500/20 text-yellow-400',
    wont_fix: 'bg-white/10 text-white/30',
  }
  return map[s] ?? 'bg-white/10 text-white/40'
}

export default function History() {
  const { selectedProject } = useProjectStore()
  const [runs, setRuns] = useState<AnalysisRun[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runIssues, setRunIssues] = useState<Record<string, Issue[]>>({})
  const [runDiffs, setRunDiffs] = useState<Record<string, RunDiff>>({})
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)

  useEffect(() => {
    if (!selectedProject?.id) return
    const projectId = selectedProject.id
    const client = getSupabaseClient()
    if (!client) { setLoading(false); return }
    setLoading(true)
    setSelectedRunId(null)
    setRunIssues({})
    setRunDiffs({})
    client
      .from('analysis_runs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(30)
      .then(({ data }) => {
        setRuns(data ?? [])
        setLoading(false)
      })
  }, [selectedProject])

  const handleRunClick = async (run: AnalysisRun, prevRun: AnalysisRun | null) => {
    // Toggle off
    if (selectedRunId === run.id) {
      setSelectedRunId(null)
      return
    }
    setSelectedRunId(run.id)

    // Already fetched
    if (runIssues[run.id] !== undefined) return

    const client = getSupabaseClient()
    if (!client) return
    setLoadingRunId(run.id)

    // Fetch current run's issues
    const { data: currIssues } = await client
      .from('issues')
      .select('id,title,severity,category,file_path,line_start,status,priority_score')
      .eq('analysis_run_id', run.id)
      .order('priority_score', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const curr = (currIssues ?? []) as any[]
    setRunIssues(prev => ({ ...prev, [run.id]: curr as unknown as Issue[] }))

    // Compute diff against previous run
    if (prevRun) {
      const { data: prevIssues } = await client
        .from('issues')
        .select('title,file_path')
        .eq('analysis_run_id', prevRun.id)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev_ = (prevIssues ?? []) as any[]
      const currKeys = new Set(curr.map((i) => `${i.file_path}::${i.title}`))
      const prevKeys = new Set(prev_.map((i) => `${i.file_path}::${i.title}`))

      setRunDiffs(prev => ({
        ...prev,
        [run.id]: {
          newCount: curr.filter((i) => !prevKeys.has(`${i.file_path}::${i.title}`)).length,
          resolvedCount: prev_.filter((i) => !currKeys.has(`${i.file_path}::${i.title}`)).length,
        },
      }))
    }

    setLoadingRunId(null)
  }

  // Chart data: use actual severity counts from analysis_runs (accurate)
  const chartData: ChartPoint[] = runs.map((run) => {
    const d = new Date(run.created_at)
    const dateStr = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    const timeStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    return {
      date: `${dateStr} ${timeStr}`,
      total: run.issues_found,
      critical: run.critical_count,
      high: run.high_count,
      medium: run.medium_count,
      low: run.low_count,
      runId: run.id,
    }
  })

  // Group runs by date (newest first), optionally filtering 0-issue runs
  const displayRuns = hideEmpty ? runs.filter(r => r.issues_found > 0) : runs
  const groupedRuns = [...displayRuns].reverse().reduce((acc, run) => {
    const dateKey = new Date(run.created_at).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    })
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(run)
    return acc
  }, {} as Record<string, AnalysisRun[]>)

  const tooltipStyle = {
    contentStyle: {
      background: '#0d1117',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: 'rgba(255,255,255,0.7)' },
  }

  const axisProps = {
    tick: { fill: 'rgba(255,255,255,0.4)', fontSize: 10, angle: -30 as number, textAnchor: 'end' as const },
    height: 48,
    interval: 'preserveStartEnd' as const,
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-white/30 text-sm">프로젝트를 선택하세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">분석 히스토리</h1>

      {loading ? (
        <p className="text-white/40 text-sm">로딩 중...</p>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/2 p-8 text-center">
          <p className="text-white/30 text-sm">분석 기록이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* Issue trend line chart */}
          <div className="rounded-xl border border-white/5 bg-white/2 p-5">
            <p className="text-sm text-white/50 mb-4">이슈 추이 (최근 30회)</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
                <Line type="monotone" dataKey="total" stroke="var(--theme-accent)" strokeWidth={2} dot={false} name="전체" />
                <Line type="monotone" dataKey="critical" stroke={SEVERITY_COLORS.critical} strokeWidth={1.5} dot={false} name="Critical" />
                <Line type="monotone" dataKey="high" stroke={SEVERITY_COLORS.high} strokeWidth={1.5} dot={false} name="High" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Severity distribution stacked bar chart */}
          <div className="rounded-xl border border-white/5 bg-white/2 p-5">
            <p className="text-sm text-white/50 mb-4">Severity 분포 (실행별)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} maxBarSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
                <Bar dataKey="critical" stackId="a" fill={SEVERITY_COLORS.critical} name="Critical" />
                <Bar dataKey="high"     stackId="a" fill={SEVERITY_COLORS.high}     name="High" />
                <Bar dataKey="medium"   stackId="a" fill={SEVERITY_COLORS.medium}   name="Medium" />
                <Bar dataKey="low"      stackId="a" fill={SEVERITY_COLORS.low}      name="Low" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Run timeline list — grouped by date */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <div className="px-4 py-2 bg-white/2 border-b border-white/5 flex items-center justify-between">
              <p className="text-xs text-white/40 uppercase tracking-wider">분석 실행 목록 — 클릭하면 이슈 상세 보기</p>
              <button
                onClick={() => setHideEmpty(v => !v)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                {hideEmpty ? '이슈없음 포함' : '이슈없음 숨기기'}
              </button>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
            {Object.entries(groupedRuns).map(([dateLabel, dayRuns]) => (
              <div key={dateLabel}>
                {/* Date group header */}
                <div className="px-4 py-2 bg-white/[0.03] border-b border-white/5 flex items-center gap-2">
                  <span className="text-xs font-medium text-white/50">{dateLabel}</span>
                  <span className="text-xs text-white/25">{dayRuns.length}회</span>
                </div>

                {dayRuns.map((run) => {
                  // Find the previous run (older than this one) for diff calculation
                  const runIndex = runs.findIndex(r => r.id === run.id)
                  const prevRun = runIndex > 0 ? runs[runIndex - 1] : null
                  const isSelected = selectedRunId === run.id
                  const isLoadingThis = loadingRunId === run.id
                  const diff = runDiffs[run.id]
                  const issues = runIssues[run.id] ?? []

                  return (
                    <div key={run.id}>
                      {/* Run row */}
                      <div
                        onClick={() => handleRunClick(run, prevRun)}
                        className={`flex items-center justify-between px-4 py-3 border-b border-white/5 cursor-pointer transition-colors ${isSelected ? 'bg-white/5' : 'hover:bg-white/3'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-white/20 text-xs">{isSelected ? '▼' : '▶'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${triggerBadgeClass(run.trigger_type ?? 'manual')}`}>
                            {run.trigger_type ?? 'manual'}
                          </span>
                          <span className="text-sm text-white/60">
                            {new Date(run.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                          </span>
                          {/* Diff badge — shown only after fetch */}
                          {diff && (
                            <span className="flex items-center gap-1.5 text-xs">
                              {diff.newCount > 0 && <span className="text-red-400">+{diff.newCount}</span>}
                              {diff.resolvedCount > 0 && <span className="text-green-400">-{diff.resolvedCount}</span>}
                              {diff.newCount === 0 && diff.resolvedCount === 0 && <span className="text-white/30">변화 없음</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          {/* Severity mini-bar */}
                          <div className="flex items-center gap-1">
                            {run.critical_count > 0 && <span className="text-red-400">{run.critical_count}C</span>}
                            {run.high_count > 0 && <span className="text-orange-400">{run.high_count}H</span>}
                            {run.medium_count > 0 && <span className="text-yellow-400">{run.medium_count}M</span>}
                            {run.low_count > 0 && <span className="text-blue-400">{run.low_count}L</span>}
                            {run.issues_found === 0 && <span className="text-white/30">이슈 없음</span>}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full ${
                            run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            run.status === 'failed'    ? 'bg-red-500/20 text-red-400' :
                            run.status === 'running'   ? 'bg-blue-500/20 text-blue-400' :
                            'bg-white/10 text-white/40'
                          }`}>
                            {run.status}
                          </span>
                          <span className="text-white/20">
                            {run.analyzed_files}/{run.total_files} 파일
                          </span>
                        </div>
                      </div>

                      {/* Inline accordion panel */}
                      {isSelected && (
                        <div className="bg-black/20 border-b border-white/8">
                          {isLoadingThis ? (
                            <p className="px-6 py-4 text-xs text-white/30">이슈 불러오는 중...</p>
                          ) : (
                            <>
                              {/* Diff summary header */}
                              {diff && prevRun && (
                                <div className="px-6 py-2 flex items-center gap-4 border-b border-white/5 bg-white/2">
                                  <span className="text-xs text-white/40">이전 실행 대비</span>
                                  <span className="text-xs text-red-400 font-medium">신규 +{diff.newCount}</span>
                                  <span className="text-xs text-green-400 font-medium">해결 -{diff.resolvedCount}</span>
                                  {diff.newCount === 0 && diff.resolvedCount === 0 && (
                                    <span className="text-xs text-white/30">변화 없음 (동일 이슈)</span>
                                  )}
                                </div>
                              )}
                              {!prevRun && (
                                <div className="px-6 py-2 border-b border-white/5 bg-white/2">
                                  <span className="text-xs text-white/30">첫 번째 분석 실행</span>
                                </div>
                              )}

                              {/* Issue list */}
                              {issues.length === 0 ? (
                                <p className="px-6 py-4 text-xs text-white/30">이슈 없음</p>
                              ) : (
                                <div className="divide-y divide-white/3 max-h-80 overflow-y-auto">
                                  {issues.map(issue => (
                                    <div key={issue.id} className="flex items-center gap-3 px-6 py-2 hover:bg-white/3 transition-colors">
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${severityBadgeClass(issue.severity)} shrink-0`}>
                                        {issue.severity[0].toUpperCase()}
                                      </span>
                                      <span className="text-xs text-white/70 flex-1 truncate">{issue.title}</span>
                                      <span className="text-xs text-white/25 font-mono shrink-0 hidden sm:block">
                                        {issue.file_path.split('/').pop()}:{issue.line_start}
                                      </span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusBadgeClass(issue.status)} shrink-0`}>
                                        {issue.status}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
