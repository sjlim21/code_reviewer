import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  CheckCircle, 
  ShieldAlert, 
  TrendingUp, 
  FileText, 
  ChevronRight,
  Search,
  Code,
  Flame,
  ArrowUpRight,
  Trash2,
  Clock,
  Download
} from 'lucide-react';
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

const severityColors: { [key: string]: string } = {
  critical: '#f43f5e', // Rose 500
  high: '#f97316',     // Orange 500
  medium: '#eab308',   // Yellow 500
  low: '#3b82f6',      // Blue 500
  info: '#64748b'      // Slate 500
};

const severityGlows: { [key: string]: string } = {
  critical: 'hover:shadow-[0_0_20px_0_rgba(244,63,94,0.35)]',
  high: 'hover:shadow-[0_0_20px_0_rgba(249,115,22,0.30)]',
  medium: 'hover:shadow-[0_0_20px_0_rgba(234,179,8,0.25)]',
  low: 'hover:shadow-[0_0_20px_0_rgba(59,130,246,0.25)]',
  info: 'hover:shadow-[0_0_20px_0_rgba(100,116,139,0.20)]'
};

interface CustomAreaTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey?: string | number }>;
  label?: string;
}

const CustomAreaTooltip: React.FC<CustomAreaTooltipProps> = ({ active, payload, label }) => {
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

const CustomBarTooltip: React.FC<CustomBarTooltipProps> = ({ active, payload }) => {
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

import { useAppContext } from '../context/AppContext';

export const Dashboard: React.FC = () => {
  const {
    selectedProject,
    setSelectedProject: onSelectProject,
    setSelectedIssue: onSelectIssue,
    issues,
    projects,
    handleDeleteProject: onDeleteProject
  } = useAppContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const handleCardClick = (type: 'critical' | 'high' | 'medium' | 'low' | 'resolved') => {
    if (type === 'resolved') {
      if (statusFilter === 'resolved') {
        setStatusFilter('open');
        setSeverityFilter('all');
      } else {
        setStatusFilter('resolved');
        setSeverityFilter('all');
      }
    } else {
      if (severityFilter === type && statusFilter === 'open') {
        setSeverityFilter('all');
      } else {
        setSeverityFilter(type);
        setStatusFilter('open');
      }
    }
  };

  const isAnyCardActive = ['critical', 'high', 'medium', 'low'].includes(severityFilter) || statusFilter === 'resolved';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  };

  // 프로젝트별 전체 이슈 리스트 필터링

  const projectIssues = useMemo(() => {
    if (!selectedProject) return issues;
    return issues.filter(i => i.project_id === selectedProject.id);
  }, [selectedProject, issues]);

  // 검색 및 필터 필터링
  const filteredIssues = useMemo(() => {
    return projectIssues.filter(issue => {
      const issueTitle = issue.title || '';
      const issueFilePath = issue.file_path || '';
      const matchesSearch = issueTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            issueFilePath.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSeverity = severityFilter === 'all' ? true : issue.severity === severityFilter;
      const matchesCategory = categoryFilter === 'all' ? true : issue.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' ? true : issue.status === statusFilter;
      
      return matchesSearch && matchesSeverity && matchesCategory && matchesStatus;
    }).sort((a, b) => b.priority_score - a.priority_score);
  }, [projectIssues, searchTerm, severityFilter, categoryFilter, statusFilter]);

  const handleExport = (format: 'csv' | 'json' | 'pdf') => {
    if (format === 'pdf') {
      setExportDropdownOpen(false);
      setTimeout(() => {
        window.print();
      }, 100);
      return;
    }

    if (filteredIssues.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    if (format === 'json') {
      const jsonString = JSON.stringify(filteredIssues, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `codeeye_report_${selectedProject?.name || 'project'}_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'csv') {
      const headers = ['ID', 'Title', 'Severity', 'Category', 'Status', 'File Path', 'Line Start', 'Line End', 'Priority Score', 'Created At'];
      const rows = filteredIssues.map(issue => [
        issue.id,
        `"${(issue.title || '').replace(/"/g, '""')}"`,
        issue.severity,
        issue.category,
        issue.status,
        `"${(issue.file_path || '').replace(/"/g, '""')}"`,
        issue.line_start,
        issue.line_end,
        issue.priority_score,
        issue.created_at || ''
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `codeeye_report_${selectedProject?.name || 'project'}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setExportDropdownOpen(false);
  };

  // 중요도별 카운트 계산
  const metrics = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, open: 0, resolved: 0 };
    projectIssues.forEach(issue => {
      if (issue.status === 'open' || issue.status === 'in_progress') {
        counts[issue.severity]++;
        counts.open++;
      } else {
        counts.resolved++;
      }
    });
    return counts;
  }, [projectIssues]);

  // 프로젝트 건강성 수치 계산 (Health Grade)
  const healthScore = useMemo(() => {
    let score = 100;
    projectIssues.forEach(issue => {
      if (issue.status === 'open' || issue.status === 'in_progress') {
        if (issue.severity === 'critical') score -= 15;
        else if (issue.severity === 'high') score -= 10;
        else if (issue.severity === 'medium') score -= 5;
        else if (issue.severity === 'low') score -= 2;
      }
    });
    return Math.max(0, score);
  }, [projectIssues]);

  const healthGrade = useMemo(() => {
    if (healthScore >= 90) return 'A';
    if (healthScore >= 80) return 'B';
    if (healthScore >= 70) return 'C';
    if (healthScore >= 60) return 'D';
    return 'F';
  }, [healthScore]);

  const scoreColor = useMemo(() => {
    if (healthScore >= 90) return 'text-emerald-400';
    if (healthScore >= 75) return 'text-indigo-400';
    if (healthScore >= 60) return 'text-amber-400';
    return 'text-rose-500';
  }, [healthScore]);

  // 최근 30일 누적 이슈 추이 트렌드 (미해결 vs 해결됨) 및 해결 속도 연산
  const { chartTrend30Days, velocityMetrics } = useMemo(() => {
    const dates: { name: string; dateRaw: string; open: number; resolved: number }[] = [];
    
    // 최근 30일 날짜 목록 추출
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
        .replace('. ', '-')
        .replace('.', '')
        .trim();
      dates.push({
        dateRaw: d.toISOString().split('T')[0],
        name: dateStr,
        open: 0,
        resolved: 0
      });
    }

    // 각 날짜별 누적 결함 수 계산
    dates.forEach(d => {
      const targetTime = new Date(d.dateRaw + 'T23:59:59').getTime();
      let openCount = 0;
      let resolvedCount = 0;

      projectIssues.forEach(issue => {
        const createdTime = new Date(issue.created_at).getTime();
        if (createdTime <= targetTime) {
          if (issue.status === 'resolved' && issue.resolved_at) {
            const resolvedTime = new Date(issue.resolved_at).getTime();
            if (resolvedTime <= targetTime) {
              resolvedCount++;
            } else {
              openCount++;
            }
          } else {
            openCount++;
          }
        }
      });

      d.open = openCount;
      d.resolved = resolvedCount;
    });

    // 만약 데이터가 전무하면, 데모 시뮬레이션용 완만한 가이드 트렌드로 대체
    const hasAnyOpen = dates.some(d => d.open > 0 || d.resolved > 0);
    if (!hasAnyOpen) {
      dates.forEach((d, idx) => {
        d.open = [15, 14, 16, 13, 12, 11, 12, 10, 9, 8, 9, 7, 8, 6, 7, 5, 6, 7, 5, 4, 3, 4, 3, 2, 3, 2, 1, 1, 0, 0][idx] ?? 0;
        d.resolved = [0, 1, 2, 4, 5, 6, 6, 8, 9, 10, 10, 12, 12, 14, 14, 16, 16, 16, 18, 19, 20, 20, 21, 22, 22, 23, 24, 24, 25, 25][idx] ?? 0;
      });
    }

    // 평균 해결 속도 (created_at -> resolved_at 시간 편차 계산)
    let totalResolveTime = 0;
    let resolvedCount = 0;
    projectIssues.forEach(issue => {
      if (issue.status === 'resolved' && issue.resolved_at && issue.created_at) {
        const t1 = new Date(issue.created_at).getTime();
        const t2 = new Date(issue.resolved_at).getTime();
        const diffHours = (t2 - t1) / (1000 * 60 * 60);
        if (diffHours >= 0) {
          totalResolveTime += diffHours;
          resolvedCount++;
        }
      }
    });

    const avgVelocity = resolvedCount > 0 ? (totalResolveTime / resolvedCount).toFixed(1) : 'N/A';

    return {
      chartTrend30Days: dates,
      velocityMetrics: {
        avgHours: avgVelocity,
        count: resolvedCount
      }
    };
  }, [projectIssues]);

  const chartCategoryData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    projectIssues.forEach(i => {
      categories[i.category] = (categories[i.category] || 0) + 1;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [projectIssues]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Dynamic Health Stats Summary */}
      {projectIssues.length > 0 && (
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
                      {/* Gray track background */}
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        className="stroke-slate-800"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      {/* Gradient track foreground */}
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke="url(#progressGradient)"
                        strokeWidth="8"
                        fill="transparent"
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
                      {/* Gray track background */}
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        className="stroke-slate-800"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      {/* Gradient track foreground */}
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke={`url(#${gradientId})`}
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                      <defs>
                        <linearGradient id="healthGradientA" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        <linearGradient id="healthGradientB" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#4f46e5" />
                        </linearGradient>
                        <linearGradient id="healthGradientC" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#eab308" />
                          <stop offset="100%" stopColor="#ca8a04" />
                        </linearGradient>
                        <linearGradient id="healthGradientF" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#e11d48" />
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
              
              // Risk level calculations
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
                    {/* Index markers */}
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
      )}

      {/* Upper Grid - Project Selector & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Project List */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-5 flex flex-col justify-between shadow-xl">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Code className="text-indigo-400" size={16} />
              프로젝트 목록
            </h2>
            
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {projects.map(proj => {
                const isActive = selectedProject?.id === proj.id;
                return (
                  <div key={proj.id} className="group relative">
                    <button
                      onClick={() => onSelectProject(proj)}
                      className={`w-full text-left p-3.5 pr-10 rounded-xl flex items-center justify-between transition-all duration-300 ${
                        isActive 
                          ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/10 border border-indigo-500/40 text-indigo-100 shadow-[0_0_15px_0_rgba(99,102,241,0.15)]' 
                          : 'border border-slate-800/60 bg-slate-900/20 hover:border-slate-700/60 hover:bg-slate-800/30 text-slate-400'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-slate-100">{proj.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center justify-between w-full">
                          <span className="uppercase tracking-wider">{proj.language}</span>
                          <span className="text-slate-700 font-sans lowercase truncate max-w-[90px] ml-2">id: {proj.id}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className={isActive ? 'text-indigo-400' : 'text-slate-600'} />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(proj.id);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200"
                      title="프로젝트 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          
          {selectedProject && (
            <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Project ID</div>
                <div className="flex items-center justify-between gap-2 mt-1 bg-slate-950/40 px-2 py-1.5 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] font-mono text-slate-300 truncate max-w-[120px] xl:max-w-[140px]" title={selectedProject.id}>
                    {selectedProject.id}
                  </span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedProject.id);
                      alert('프로젝트 ID가 클립보드에 복사되었습니다.');
                    }}
                    className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 font-sans cursor-pointer uppercase shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Repository</div>
                <a 
                  href={selectedProject.repo_url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-xs text-indigo-400 truncate block hover:underline hover:text-indigo-300 mt-1 flex items-center gap-1"
                >
                  <span>{selectedProject.repo_url}</span>
                  <ArrowUpRight size={12} />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Metrics Cards */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-5 gap-4">
          
          {/* Critical Card */}
          <div 
            onClick={() => handleCardClick('critical')}
            onMouseMove={handleMouseMove}
            style={{ '--glow-color': 'rgba(244,63,94,0.25)' } as React.CSSProperties}
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
              <span className="text-4xl font-extrabold text-rose-500 font-mono tracking-tight">{metrics.critical}</span>
              <div className="p-2 bg-rose-500/10 rounded-lg">
                <Flame className="text-rose-500" size={20} />
              </div>
            </div>
          </div>
          
          {/* High Card */}
          <div 
            onClick={() => handleCardClick('high')}
            onMouseMove={handleMouseMove}
            style={{ '--glow-color': 'rgba(249,115,22,0.20)' } as React.CSSProperties}
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
              <span className="text-4xl font-extrabold text-orange-500 font-mono tracking-tight">{metrics.high}</span>
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <ShieldAlert className="text-orange-500" size={20} />
              </div>
            </div>
          </div>

          {/* Medium Card */}
          <div 
            onClick={() => handleCardClick('medium')}
            onMouseMove={handleMouseMove}
            style={{ '--glow-color': 'rgba(234,179,8,0.18)' } as React.CSSProperties}
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
              <span className="text-4xl font-extrabold text-yellow-500 font-mono tracking-tight">{metrics.medium}</span>
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <AlertTriangle className="text-yellow-500" size={20} />
              </div>
            </div>
          </div>

          {/* Low Card */}
          <div 
            onClick={() => handleCardClick('low')}
            onMouseMove={handleMouseMove}
            style={{ '--glow-color': 'rgba(59,130,246,0.18)' } as React.CSSProperties}
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
              <span className="text-4xl font-extrabold text-blue-500 font-mono tracking-tight">{metrics.low}</span>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Activity className="text-blue-500" size={20} />
              </div>
            </div>
          </div>

          {/* Resolved Card */}
          <div 
            onClick={() => handleCardClick('resolved')}
            onMouseMove={handleMouseMove}
            style={{ '--glow-color': 'rgba(16,185,129,0.20)' } as React.CSSProperties}
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
              <span className="text-4xl font-extrabold text-emerald-500 font-mono tracking-tight">{metrics.resolved}</span>
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle className="text-emerald-400" size={20} />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Visual Analytics Charts */}
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

      {/* Filter and Issue Grid list */}
      <div className="glass-panel rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-bold text-slate-200">탐지 결함 레포트</h3>
            <p className="text-xs text-slate-500 mt-1">심각도 및 RLS 우선순위 점수가 계산되어 노출됩니다.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
              <input
                type="text"
                placeholder="결함 파일, 파일 패턴 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full md:w-64 transition-all"
              />
            </div>

            {/* Select Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">모든 중요도</option>
                <option value="critical">🔴 Critical</option>
                <option value="high">🟠 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🔵 Low</option>
                <option value="info">⚪ Info</option>
              </select>
              
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">모든 카테고리</option>
                <option value="security">Security</option>
                <option value="bug">Bug</option>
                <option value="performance">Performance</option>
                <option value="code_smell">Code Smell</option>
                <option value="maintainability">Maintainability</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">모든 상태</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            {/* Export Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 border border-indigo-500/20 transition-all cursor-pointer shadow-md"
              >
                <Download size={14} />
                <span>레포트 내보내기</span>
              </button>

              {exportDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setExportDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-36 glass-panel border border-slate-800 rounded-xl py-1 shadow-2xl bg-slate-950/95 z-20 animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      onClick={() => handleExport('csv')}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-900/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      CSV 다운로드
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-900/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      JSON 다운로드
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-900/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2 border-t border-slate-800/80 mt-1 pt-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      PDF 보고서 출력
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Issue Cards Grid */}
        <div className="space-y-3">
          {filteredIssues.length > 0 ? (
            filteredIssues.map(issue => (
              <div
                key={issue.id}
                onClick={() => onSelectIssue(issue)}
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
      </div>

      {/* Printable Executive Report Container */}
      <div id="codeeye-print-report" className="hidden font-sans p-8 space-y-8 text-black bg-white">
        
        {/* Cover Page */}
        <div className="flex flex-col justify-between h-[270mm] p-12 border-4 border-slate-900 page-break-after">
          <div className="space-y-6 mt-20">
            <div className="text-[12px] font-mono tracking-widest text-slate-500 font-bold uppercase">Security Audit Report</div>
            <h1 className="text-5xl font-black tracking-tight text-slate-900">CodeEye 보안 및 품질 진단 보고서</h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
              본 보고서는 로컬 정적 분석 엔진을 통해 소스코드의 취약성, 버퍼 오버플로우, 메모리 누수 및 코드의 품질 상태를 정밀 분석하여 작성되었습니다.
            </p>
          </div>

          <div className="space-y-4 border-t-2 border-slate-900 pt-6 font-mono text-sm text-slate-700">
            <div><strong>프로젝트명:</strong> {selectedProject?.name || 'Local Project'}</div>
            <div><strong>진단 주체:</strong> CodeEye Local Static Analyzer</div>
            <div><strong>진단 일시:</strong> {new Date().toLocaleString('ko-KR')}</div>
            <div><strong>품질 등급:</strong> Grade {healthGrade} ({healthScore} / 100)</div>
          </div>
        </div>

        {/* Dashboard Statistics Page */}
        <div className="space-y-6 py-6 page-break-after">
          <h2 className="text-2xl font-bold border-b-2 border-slate-950 pb-2 text-slate-900">1. 진단 통계 요약 (Executive Summary)</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-300 p-4 rounded-xl space-y-1">
              <span className="text-xs text-slate-500 font-bold uppercase">프로젝트 품질 점수</span>
              <div className="text-3xl font-extrabold text-slate-900">{healthScore} / 100 (Grade {healthGrade})</div>
            </div>
            <div className="border border-slate-300 p-4 rounded-xl space-y-1">
              <span className="text-xs text-slate-500 font-bold uppercase">평균 해결 소요 시간</span>
              <div className="text-3xl font-extrabold text-slate-900">{velocityMetrics.avgHours === 'N/A' ? 'N/A' : `${velocityMetrics.avgHours}시간`}</div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center text-xs mt-4">
            <div className="border border-slate-300 p-2.5 rounded-lg">
              <div className="text-slate-500 font-bold">Critical</div>
              <div className="text-xl font-extrabold mt-1 text-red-600">{metrics.critical}건</div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded-lg">
              <div className="text-slate-500 font-bold">High</div>
              <div className="text-xl font-extrabold mt-1 text-orange-600">{metrics.high}건</div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded-lg">
              <div className="text-slate-500 font-bold">Medium</div>
              <div className="text-xl font-extrabold mt-1 text-yellow-600">{metrics.medium}건</div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded-lg">
              <div className="text-slate-500 font-bold">Low</div>
              <div className="text-xl font-extrabold mt-1 text-blue-600">{metrics.low}건</div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded-lg">
              <div className="text-slate-500 font-bold">Resolved</div>
              <div className="text-xl font-extrabold mt-1 text-emerald-600">{metrics.resolved}건</div>
            </div>
          </div>
        </div>

        {/* Unresolved Issues List Page */}
        <div className="space-y-6 py-6">
          <h2 className="text-2xl font-bold border-b-2 border-slate-950 pb-2 text-slate-900">2. 미해결 보안 위협 목록</h2>
          
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900 text-slate-700 font-bold">
                <th className="py-2.5 pr-2 w-16">심각도</th>
                <th className="py-2.5 px-2">결함 설명</th>
                <th className="py-2.5 px-2 w-48">파일명</th>
                <th className="py-2.5 px-2 w-12 text-right">점수</th>
              </tr>
            </thead>
            <tbody>
              {projectIssues.filter(i => i.status !== 'resolved').length > 0 ? (
                projectIssues
                  .filter(i => i.status !== 'resolved')
                  .sort((a, b) => b.priority_score - a.priority_score)
                  .map(issue => (
                    <tr key={issue.id} className="border-b border-slate-300">
                      <td className="py-2 pr-2 font-extrabold">
                        <span className={
                          issue.severity === 'critical' ? 'text-red-600' :
                          issue.severity === 'high' ? 'text-orange-600' :
                          issue.severity === 'medium' ? 'text-yellow-600' :
                          'text-blue-600'
                        }>
                          {issue.severity.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-bold text-slate-955">{issue.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{issue.description}</div>
                      </td>
                      <td className="py-2 px-2 font-mono text-[10px] text-slate-600 break-all">
                        {issue.file_path} (Lines {issue.line_start}-{issue.line_end})
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-800">{issue.priority_score}점</td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">감지된 미해결 결함이 없습니다. 프로젝트 상태 양호.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
