import type { CSSProperties, MouseEvent } from 'react';
import { Flame, ShieldAlert, AlertTriangle, Activity, CheckCircle } from 'lucide-react';

export interface StatsCardsProps {
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolved?: number;
  severityFilter?: string;
  statusFilter?: string;
  isAnyCardActive?: boolean;
  onCardClick?: (type: 'critical' | 'high' | 'medium' | 'low' | 'resolved') => void;
  onMouseMove?: (e: MouseEvent<HTMLDivElement>) => void;
}

export function StatsCards({
  critical,
  high,
  medium,
  low,
  resolved = 0,
  severityFilter = 'all',
  statusFilter = 'open',
  isAnyCardActive = false,
  onCardClick = () => {},
  onMouseMove = () => {},
}: StatsCardsProps) {
  return (
    <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-5 gap-4">

      {/* Critical Card */}
      <div
        onClick={() => onCardClick('critical')}
        onMouseMove={onMouseMove}
        style={{ '--glow-color': 'rgba(244,63,94,0.25)' } as CSSProperties}
        className={`glass-panel glow-card-interactive rounded-2xl p-5 border-b-4 border-rose-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 cursor-pointer group ${
          severityFilter === 'critical' && statusFilter === 'open'
            ? 'ring-2 ring-rose-500 shadow-[0_0_25px_0_rgba(244,63,94,0.35)] scale-[1.02] border-t border-rose-500/20'
            : isAnyCardActive
              ? 'opacity-40 hover:opacity-100 hover:scale-[1.01]'
              : 'hover:shadow-[0_0_25px_0_rgba(244,63,94,0.25)]'
        }`}
      >
        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-rose-400 transition-colors">Critical</span>
        <div className="flex items-baseline justify-between mt-4">
          <span className="text-4xl font-extrabold text-rose-500 font-mono tracking-tight">{critical}</span>
          <div className="p-2 bg-rose-500/10 rounded-lg">
            <Flame className="text-rose-500" size={20} />
          </div>
        </div>
      </div>

      {/* High Card */}
      <div
        onClick={() => onCardClick('high')}
        onMouseMove={onMouseMove}
        style={{ '--glow-color': 'rgba(249,115,22,0.20)' } as CSSProperties}
        className={`glass-panel glow-card-interactive rounded-2xl p-5 border-b-4 border-orange-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 cursor-pointer group ${
          severityFilter === 'high' && statusFilter === 'open'
            ? 'ring-2 ring-orange-500 shadow-[0_0_25px_0_rgba(249,115,22,0.35)] scale-[1.02] border-t border-orange-500/20'
            : isAnyCardActive
              ? 'opacity-40 hover:opacity-100 hover:scale-[1.01]'
              : 'hover:shadow-[0_0_25px_0_rgba(249,115,22,0.25)]'
        }`}
      >
        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-orange-400 transition-colors">High</span>
        <div className="flex items-baseline justify-between mt-4">
          <span className="text-4xl font-extrabold text-orange-500 font-mono tracking-tight">{high}</span>
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <ShieldAlert className="text-orange-500" size={20} />
          </div>
        </div>
      </div>

      {/* Medium Card */}
      <div
        onClick={() => onCardClick('medium')}
        onMouseMove={onMouseMove}
        style={{ '--glow-color': 'rgba(234,179,8,0.18)' } as CSSProperties}
        className={`glass-panel glow-card-interactive rounded-2xl p-5 border-b-4 border-yellow-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 cursor-pointer group ${
          severityFilter === 'medium' && statusFilter === 'open'
            ? 'ring-2 ring-yellow-500 shadow-[0_0_25px_0_rgba(234,179,8,0.30)] scale-[1.02] border-t border-yellow-500/20'
            : isAnyCardActive
              ? 'opacity-40 hover:opacity-100 hover:scale-[1.01]'
              : 'hover:shadow-[0_0_25px_0_rgba(234,179,8,0.20)]'
        }`}
      >
        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-yellow-400 transition-colors">Medium</span>
        <div className="flex items-baseline justify-between mt-4">
          <span className="text-4xl font-extrabold text-yellow-500 font-mono tracking-tight">{medium}</span>
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <AlertTriangle className="text-yellow-500" size={20} />
          </div>
        </div>
      </div>

      {/* Low Card */}
      <div
        onClick={() => onCardClick('low')}
        onMouseMove={onMouseMove}
        style={{ '--glow-color': 'rgba(59,130,246,0.18)' } as CSSProperties}
        className={`glass-panel glow-card-interactive rounded-2xl p-5 border-b-4 border-blue-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 cursor-pointer group ${
          severityFilter === 'low' && statusFilter === 'open'
            ? 'ring-2 ring-blue-500 shadow-[0_0_25px_0_rgba(59,130,246,0.30)] scale-[1.02] border-t border-blue-500/20'
            : isAnyCardActive
              ? 'opacity-40 hover:opacity-100 hover:scale-[1.01]'
              : 'hover:shadow-[0_0_25px_0_rgba(59,130,246,0.20)]'
        }`}
      >
        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Low</span>
        <div className="flex items-baseline justify-between mt-4">
          <span className="text-4xl font-extrabold text-blue-500 font-mono tracking-tight">{low}</span>
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Activity className="text-blue-500" size={20} />
          </div>
        </div>
      </div>

      {/* Resolved Card */}
      <div
        onClick={() => onCardClick('resolved')}
        onMouseMove={onMouseMove}
        style={{ '--glow-color': 'rgba(16,185,129,0.20)' } as CSSProperties}
        className={`glass-panel glow-card-interactive rounded-2xl p-5 border-b-4 border-emerald-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 hover:shadow-[0_0_25px_0_rgba(16,185,129,0.25)] group col-span-2 md:col-span-1 cursor-pointer ${
          statusFilter === 'resolved'
            ? 'ring-2 ring-emerald-500 shadow-[0_0_25px_0_rgba(16,185,129,0.35)] scale-[1.02] border-t border-emerald-500/20'
            : isAnyCardActive
              ? 'opacity-40 hover:opacity-100 hover:scale-[1.01]'
              : 'hover:shadow-[0_0_25px_0_rgba(16,185,129,0.25)]'
        }`}
      >
        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-emerald-400 transition-colors">Resolved</span>
        <div className="flex items-baseline justify-between mt-4">
          <span className="text-4xl font-extrabold text-emerald-500 font-mono tracking-tight">{resolved}</span>
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <CheckCircle className="text-emerald-400" size={20} />
          </div>
        </div>
      </div>

    </div>
  );
}
