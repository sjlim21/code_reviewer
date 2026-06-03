import { ChevronRight, Clock } from 'lucide-react';
import type { Issue } from '../../supabase';

const severityColors: { [key: string]: string } = {
  critical: '#f43f5e',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#64748b'
};

const severityGlows: { [key: string]: string } = {
  critical: 'hover:shadow-[0_0_20px_0_rgba(244,63,94,0.35)]',
  high: 'hover:shadow-[0_0_20px_0_rgba(249,115,22,0.30)]',
  medium: 'hover:shadow-[0_0_20px_0_rgba(234,179,8,0.25)]',
  low: 'hover:shadow-[0_0_20px_0_rgba(59,130,246,0.25)]',
  info: 'hover:shadow-[0_0_20px_0_rgba(100,116,139,0.20)]'
};

export interface IssueTableProps {
  issues: Issue[];
  onIssueClick: (issue: Issue) => void;
}

export function IssueTable({ issues, onIssueClick }: IssueTableProps) {
  return (
    <div className="space-y-3">
      {issues.length > 0 ? (
        issues.map(issue => (
          <div
            key={issue.id}
            onClick={() => onIssueClick(issue)}
            className={`p-4 rounded-xl border border-slate-800/80 bg-slate-900/10 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${severityGlows[issue.severity]} hover:border-slate-600/40 hover:bg-slate-800/20`}
          >
            <div className="flex items-start gap-4">
              <span
                className="w-1.5 h-11 rounded-full block shrink-0"
                style={{ backgroundColor: severityColors[issue.severity] }}
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-100 font-bold text-sm tracking-tight">{issue.title}</span>

                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 text-slate-400 capitalize">
                    {issue.category}
                  </span>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    issue.status === 'open' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    issue.status === 'in_progress' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {issue.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-2 font-mono">
                  <span className="text-slate-400">{issue.file_path}</span>
                  <span className="text-slate-700">|</span>
                  <span>Lines {issue.line_start}-{issue.line_end}</span>
                  {issue.created_at && (
                    <>
                      <span className="text-slate-700">|</span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-500 font-sans">
                        <Clock size={11} className="text-slate-600" />
                        {new Date(issue.created_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 justify-between md:justify-end">
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Score</div>
                <div className="text-base font-extrabold text-slate-200 flex items-center gap-1.5 justify-end font-mono">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                    style={{ backgroundColor: severityColors[issue.severity] }}
                  />
                  {issue.priority_score}
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-800/40 text-slate-600 hover:text-slate-400 transition-colors">
                <ChevronRight size={16} />
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="text-center py-16 text-slate-500 text-sm font-medium border border-dashed border-slate-800/80 rounded-2xl">
          조건을 충족하는 분석 결함을 찾을 수 없습니다.
        </div>
      )}
    </div>
  );
}
