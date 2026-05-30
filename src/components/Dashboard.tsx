import React, { useState, useMemo } from 'react';
import { 
  type Issue, 
  type Project 
} from '../supabase';
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
  Trash2
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

interface DashboardProps {
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onSelectIssue: (issue: Issue) => void;
  issues: Issue[];
  projects: Project[];
  onDeleteProject: (projectId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  selectedProject,
  onSelectProject,
  onSelectIssue,
  issues,
  projects,
  onDeleteProject
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 프로젝트별 전체 이슈 리스트 필터링
  const projectIssues = useMemo(() => {
    if (!selectedProject) return issues;
    return issues.filter(i => i.project_id === selectedProject.id);
  }, [selectedProject, issues]);

  // 검색 및 필터 필터링
  const filteredIssues = useMemo(() => {
    return projectIssues.filter(issue => {
      const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            issue.file_path.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSeverity = severityFilter === 'all' ? true : issue.severity === severityFilter;
      const matchesCategory = categoryFilter === 'all' ? true : issue.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' ? true : issue.status === statusFilter;
      
      return matchesSearch && matchesSeverity && matchesCategory && matchesStatus;
    }).sort((a, b) => b.priority_score - a.priority_score);
  }, [projectIssues, searchTerm, severityFilter, categoryFilter, statusFilter]);

  // 중요도별 카운트 계산
  const metrics = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, open: 0, resolved: 0 };
    projectIssues.forEach(issue => {
      counts[issue.severity]++;
      if (issue.status === 'open' || issue.status === 'in_progress') {
        counts.open++;
      } else {
        counts.resolved++;
      }
    });
    return counts;
  }, [projectIssues]);

  // 차트 데이터 (임시 트렌드 및 분포 데이터 구성)
  const chartTrendData = [
    { name: '05-24', issues: 5 },
    { name: '05-25', issues: 8 },
    { name: '05-26', issues: 12 },
    { name: '05-27', issues: 9 },
    { name: '05-28', issues: 15 },
    { name: '05-29', issues: 14 },
    { name: '05-30', issues: projectIssues.length },
  ];

  const chartCategoryData = useMemo(() => {
    const categories: { [key: string]: number } = {};
    projectIssues.forEach(i => {
      categories[i.category] = (categories[i.category] || 0) + 1;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [projectIssues]);

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
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
          <div className="glass-panel rounded-2xl p-5 border-b-4 border-rose-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 hover:shadow-[0_0_25px_0_rgba(244,63,94,0.25)] group">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-rose-400 transition-colors">Critical</span>
            <div className="flex items-baseline justify-between mt-4">
              <span className="text-4xl font-extrabold text-rose-500 font-mono tracking-tight">{metrics.critical}</span>
              <div className="p-2 bg-rose-500/10 rounded-lg">
                <Flame className="text-rose-500" size={20} />
              </div>
            </div>
          </div>
          
          {/* High Card */}
          <div className="glass-panel rounded-2xl p-5 border-b-4 border-orange-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 hover:shadow-[0_0_25px_0_rgba(249,115,22,0.25)] group">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-orange-400 transition-colors">High</span>
            <div className="flex items-baseline justify-between mt-4">
              <span className="text-4xl font-extrabold text-orange-500 font-mono tracking-tight">{metrics.high}</span>
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <ShieldAlert className="text-orange-500" size={20} />
              </div>
            </div>
          </div>

          {/* Medium Card */}
          <div className="glass-panel rounded-2xl p-5 border-b-4 border-yellow-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 hover:shadow-[0_0_25px_0_rgba(234,179,8,0.20)] group">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-yellow-400 transition-colors">Medium</span>
            <div className="flex items-baseline justify-between mt-4">
              <span className="text-4xl font-extrabold text-yellow-500 font-mono tracking-tight">{metrics.medium}</span>
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <AlertTriangle className="text-yellow-500" size={20} />
              </div>
            </div>
          </div>

          {/* Low Card */}
          <div className="glass-panel rounded-2xl p-5 border-b-4 border-blue-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 hover:shadow-[0_0_25px_0_rgba(59,130,246,0.20)] group">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Low</span>
            <div className="flex items-baseline justify-between mt-4">
              <span className="text-4xl font-extrabold text-blue-500 font-mono tracking-tight">{metrics.low}</span>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Activity className="text-blue-500" size={20} />
              </div>
            </div>
          </div>

          {/* Resolved Card */}
          <div className="glass-panel rounded-2xl p-5 border-b-4 border-emerald-500 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 hover:shadow-[0_0_25px_0_rgba(16,185,129,0.25)] group col-span-2 md:col-span-1">
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
        <div className="glass-panel rounded-2xl p-6 md:col-span-2 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-400" />
              이슈 분석 추이 트렌드
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">최근 7일 분석 로그</span>
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" id="trend-chart-container">
              <AreaChart data={chartTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="glowIndigo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ background: 'rgba(15, 22, 36, 0.9)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="issues" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#glowIndigo)" />
              </AreaChart>
            </ResponsiveContainer>
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
                <BarChart data={chartCategoryData} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <XAxis type="number" stroke="#475569" fontSize={10} hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={80} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(15, 22, 36, 0.9)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                    itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                  />
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
                    
                    <div className="text-xs text-slate-500 mt-2 flex items-center gap-2 font-mono">
                      <span className="text-slate-400">{issue.file_path}</span>
                      <span className="text-slate-700">|</span>
                      <span>Lines {issue.line_start}-{issue.line_end}</span>
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
    </div>
  );
};
