import { CheckCircle, ShieldAlert, AlertTriangle } from 'lucide-react';

export interface HealthStatsProps {
  metrics: {
    open: number;
    resolved: number;
  };
  healthScore: number;
  healthGrade: string;
  scoreColor: string;
  projectIssues: Array<{ status: string; priority_score: number }>;
}

export function HealthStats({ metrics, healthScore, healthGrade, scoreColor, projectIssues }: HealthStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">

      {/* Left Dial: Circular Resolution Rate Gauge */}
      <div className="glass-panel rounded-2xl p-6 flex items-center justify-between shadow-xl gap-6">
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle className="text-emerald-400" size={16} />
            프로젝트 해결 진행률
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            전체 탐지된 결함 중 해결(Resolved) 상태로 처리된 완료도 지표입니다.
          </p>
          <div className="text-xs font-semibold text-slate-400 mt-2 font-mono">
            완료: <span className="text-emerald-400">{metrics.resolved}</span> / 미해결: <span className="text-rose-400">{metrics.open}</span>
          </div>
        </div>

        {/* SVG Circle Gauge */}
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          {(() => {
            const total = metrics.open + metrics.resolved;
            const rate = total > 0 ? Math.round((metrics.resolved / total) * 100) : 0;
            const radius = 40;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (rate / 100) * circumference;
            return (
              <>
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={radius} className="stroke-slate-800" strokeWidth="8" fill="transparent" />
                  <circle
                    cx="50" cy="50" r={radius}
                    stroke="url(#progressGradient)"
                    strokeWidth="8" fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--theme-accent, #6366f1)" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-100 font-mono tracking-tight">{rate}%</span>
                  <span className="text-[9px] uppercase font-bold text-slate-500 font-sans tracking-wide">Rate</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Middle Dial: Circular Health Grade Widget */}
      <div className="glass-panel rounded-2xl p-6 flex items-center justify-between shadow-xl gap-6">
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert className="text-indigo-400" size={16} />
            프로젝트 품질 등급 (Health)
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            미해결 결함들의 심각도 가중치를 반영하여 계산된 종합 품질 점수 및 등급입니다.
          </p>
          <div className="text-xs font-semibold text-slate-400 mt-2 font-mono">
            품질 점수: <span className={scoreColor}>{healthScore}</span> / 100
          </div>
        </div>

        {/* SVG Circle Gauge */}
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          {(() => {
            const radius = 40;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (healthScore / 100) * circumference;
            const gradientId = healthScore >= 90 ? 'healthGradientA' :
                               healthScore >= 75 ? 'healthGradientB' :
                               healthScore >= 60 ? 'healthGradientC' :
                               'healthGradientF';
            return (
              <>
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={radius} className="stroke-slate-800" strokeWidth="8" fill="transparent" />
                  <circle
                    cx="50" cy="50" r={radius}
                    stroke={`url(#${gradientId})`}
                    strokeWidth="8" fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="healthGradientA" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="healthGradientB" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                    <linearGradient id="healthGradientC" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#eab308" /><stop offset="100%" stopColor="#ca8a04" />
                    </linearGradient>
                    <linearGradient id="healthGradientF" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f43f5e" /><stop offset="100%" stopColor="#e11d48" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className={`text-3xl font-black font-mono tracking-tight ${scoreColor}`}>{healthGrade}</span>
                  <span className="text-[9px] uppercase font-bold text-slate-500 font-sans tracking-wide">Grade</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Right Dial: Speedometer Risk Index */}
      <div className="glass-panel rounded-2xl p-6 flex items-center justify-between shadow-xl gap-6">
        {(() => {
          const openIssues = projectIssues.filter(i => i.status === 'open' || i.status === 'in_progress');
          const avgScore = openIssues.length > 0 ? Math.round(openIssues.reduce((acc, i) => acc + i.priority_score, 0) / openIssues.length) : 0;

          let riskLevel = 'SECURE';
          let riskColorClass = 'text-emerald-400';
          let riskBgClass = 'bg-emerald-500/10 border-emerald-500/20';
          if (avgScore >= 70) {
            riskLevel = 'CRITICAL RISK';
            riskColorClass = 'text-rose-500';
            riskBgClass = 'bg-rose-500/10 border-rose-500/20';
          } else if (avgScore >= 40) {
            riskLevel = 'MODERATE RISK';
            riskColorClass = 'text-amber-500';
            riskBgClass = 'bg-amber-500/10 border-amber-500/20';
          }

          return (
            <>
              <div className="space-y-2 flex-1">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className={riskColorClass} size={16} />
                  평균 보안 리스크 지수
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  미해결 상태인 이슈들의 RLS 수학적 결함 점수를 바탕으로 산정된 평균 위험도 평점입니다.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold tracking-wider font-mono uppercase ${riskBgClass} ${riskColorClass}`}>
                    {riskLevel}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold font-mono">
                    Avg Risk Score: <span className="font-extrabold text-slate-200">{avgScore}</span> / 100
                  </div>
                </div>
              </div>

              {/* Horizontal Speedometer style Gauge */}
              <div className="relative w-32 flex flex-col justify-center items-center shrink-0">
                <div className="w-full bg-slate-800/80 h-3 rounded-full overflow-hidden border border-slate-700/50 p-[2px]">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      avgScore >= 70 ? 'bg-gradient-to-r from-yellow-500 to-rose-500' :
                      avgScore >= 40 ? 'bg-gradient-to-r from-emerald-500 to-amber-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${avgScore}%` }}
                  />
                </div>
                <div className="w-full flex justify-between text-[9px] text-slate-600 font-mono mt-1 px-1">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>

    </div>
  );
}
