import type { FC } from 'react';
import { TrendingUp, FileText } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

interface CustomAreaTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey?: string | number }>;
  label?: string;
}

const CustomAreaTooltip: FC<CustomAreaTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel border border-indigo-500/35 rounded-xl p-3.5 shadow-2xl backdrop-blur-md bg-slate-950/85 text-xs font-sans space-y-1.5">
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 font-mono">{label}</p>
        {payload.map((p, idx) => {
          const isResolved = p.dataKey === 'resolved';
          const dotColor = isResolved ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse';
          const labelText = isResolved ? '해결 완료' : '미해결 결함';
          const textColor = isResolved ? 'text-emerald-400' : 'text-rose-400';
          return (
            <div key={idx} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span className="text-slate-400">{labelText}:</span>
              <span className={`text-xs font-extrabold font-mono ${textColor}`}>{p.value}개</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

interface CustomBarTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      name: string;
      value: number;
    };
  }>;
}

const CustomBarTooltip: FC<CustomBarTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-panel border border-cyan-500/35 rounded-xl p-3 shadow-2xl backdrop-blur-md bg-slate-950/85 text-xs font-sans">
        <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 font-mono">{data.name}</p>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <span className="text-slate-400">결함 수:</span>
          <span className="text-xs font-extrabold text-slate-100 font-mono">{data.value}개</span>
        </div>
      </div>
    );
  }
  return null;
};

export interface TrendChartData {
  name: string;
  dateRaw: string;
  open: number;
  resolved: number;
}

export interface CategoryChartData {
  name: string;
  value: number;
}

export interface VelocityMetrics {
  avgHours: string;
  count: number;
}

export interface TrendChartProps {
  chartTrend30Days: TrendChartData[];
  chartCategoryData: CategoryChartData[];
  velocityMetrics: VelocityMetrics;
}

export function TrendChart({ chartTrend30Days, chartCategoryData, velocityMetrics }: TrendChartProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* Trend Area Chart */}
      <div className="glass-panel rounded-2xl p-6 md:col-span-2 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-400" />
                이슈 해결 추이 및 속도
              </h3>
              <p className="text-[11px] text-slate-500">최근 30일 동안 발생한 결함과 해결된 결함의 실시간 추이입니다.</p>
            </div>

            {/* Velocity statistics cards */}
            <div className="flex items-center gap-3">
              <div className="bg-indigo-950/40 border border-indigo-500/20 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">평균 해결 시간</div>
                <div className="text-xs font-bold text-indigo-100 font-mono mt-0.5">{velocityMetrics.avgHours === 'N/A' ? '데이터 없음' : `${velocityMetrics.avgHours}시간`}</div>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">해결 완료 건수</div>
                <div className="text-xs font-bold text-emerald-100 font-mono mt-0.5">{velocityMetrics.count}건</div>
              </div>
            </div>
          </div>

          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%" id="trend-chart-container">
              <AreaChart data={chartTrend30Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="glowRose" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="glowEmerald" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip content={<CustomAreaTooltip />} />
                <Area type="monotone" dataKey="open" stroke="#f43f5e" strokeWidth={2.5} fillOpacity={1} fill="url(#glowRose)" name="미해결 결함" />
                <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#glowEmerald)" name="해결 완료" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category Bar Chart */}
      <div className="glass-panel rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-200 mb-6 flex items-center gap-2">
          <FileText size={16} className="text-cyan-400" />
          결함 카테고리 분포
        </h3>

        <div className="h-64 flex items-center justify-center">
          {chartCategoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" id="category-chart-container">
              <BarChart data={chartCategoryData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <XAxis type="number" stroke="#475569" fontSize={10} hide />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={110} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={12}>
                  {chartCategoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6366f1' : '#06b6d4'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <span className="text-xs text-slate-500 font-medium">데이터가 수집되지 않았습니다.</span>
          )}
        </div>
      </div>
    </div>
  );
}
