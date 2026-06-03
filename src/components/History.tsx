import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import { useProjectStore } from '../stores/projectStore'
import { getSupabaseClient } from '../supabase'
import type { AnalysisRun } from '../supabase'

interface ChartPoint {
  date: string
  total: number
  critical: number
  high: number
  newIssues: number
  resolvedIssues: number
  trigger: string
  runId: string
}

const triggerBadgeClass = (t: string) => {
  const map: Record<string, string> = {
    manual: 'bg-white/10 text-white/40',
    ci: 'bg-blue-500/20 text-blue-300',
    api: 'bg-purple-500/20 text-purple-300',
  }
  return map[t] ?? map['manual']
}

export default function History() {
  const { selectedProject } = useProjectStore()
  const [runs, setRuns] = useState<AnalysisRun[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedProject?.id) return
    const projectId = selectedProject.id
    setLoading(true)
    getSupabaseClient()
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

  const chartData: ChartPoint[] = runs.map((run, i) => {
    const prev = runs[i - 1]
    const prevTotal = prev?.issues_found ?? run.issues_found
    return {
      date: new Date(run.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      total: run.issues_found,
      critical: run.critical_count,
      high: run.high_count,
      newIssues: Math.max(0, run.issues_found - prevTotal),
      resolvedIssues: Math.max(0, prevTotal - run.issues_found),
      trigger: run.trigger_type,
      runId: run.id,
    }
  })

  const tooltipStyle = {
    contentStyle: {
      background: '#0d1117',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: 'rgba(255,255,255,0.7)' },
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
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
                <Line type="monotone" dataKey="total" stroke="var(--theme-accent)" strokeWidth={2} dot={false} name="전체" />
                <Line type="monotone" dataKey="critical" stroke="#f87171" strokeWidth={1.5} dot={false} name="Critical" />
                <Line type="monotone" dataKey="high" stroke="#fb923c" strokeWidth={1.5} dot={false} name="High" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* New vs Resolved bar chart */}
          <div className="rounded-xl border border-white/5 bg-white/2 p-5">
            <p className="text-sm text-white/50 mb-4">신규 / 해결 이슈</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
                <Bar dataKey="newIssues" fill="#f87171" name="신규" radius={[2, 2, 0, 0]} />
                <Bar dataKey="resolvedIssues" fill="#34d399" name="해결" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Run timeline list */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <div className="px-4 py-2 bg-white/2 border-b border-white/5">
              <p className="text-xs text-white/40 uppercase tracking-wider">분석 실행 목록</p>
            </div>
            {[...runs].reverse().map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRunId(run.id === selectedRunId ? null : run.id)}
                className="flex items-center justify-between px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/3 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${triggerBadgeClass(run.trigger_type)}`}>
                    {run.trigger_type}
                  </span>
                  <span className="text-sm text-white/60">
                    {new Date(run.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-white/50">이슈 {run.issues_found}</span>
                  <span className="text-red-400">Critical {run.critical_count}</span>
                  <span className={`px-2 py-0.5 rounded-full ${
                    run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-white/10 text-white/40'
                  }`}>
                    {run.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
