import { Search, Download } from 'lucide-react';

export interface IssueFiltersProps {
  searchTerm: string;
  severityFilter: string;
  categoryFilter: string;
  statusFilter: string;
  exportDropdownOpen: boolean;
  onSearchChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onExportToggle: () => void;
  onExportClose: () => void;
  onExport: (format: 'csv' | 'json' | 'pdf') => void;
}

export function IssueFilters({
  searchTerm,
  severityFilter,
  categoryFilter,
  statusFilter,
  exportDropdownOpen,
  onSearchChange,
  onSeverityChange,
  onCategoryChange,
  onStatusChange,
  onExportToggle,
  onExportClose,
  onExport,
}: IssueFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
        <input
          type="text"
          placeholder="결함 파일, 파일 패턴 검색..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full md:w-64 transition-all"
        />
      </div>

      {/* Select Dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severityFilter}
          onChange={e => onSeverityChange(e.target.value)}
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
          onChange={e => onCategoryChange(e.target.value)}
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
          onChange={e => onStatusChange(e.target.value)}
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
          onClick={onExportToggle}
          className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 border border-indigo-500/20 transition-all cursor-pointer shadow-md"
        >
          <Download size={14} />
          <span>레포트 내보내기</span>
        </button>

        {exportDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={onExportClose}
            />
            <div className="absolute right-0 mt-2 w-36 glass-panel border border-slate-800 rounded-xl py-1 shadow-2xl bg-slate-950/95 z-20 animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => onExport('csv')}
                className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-900/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                CSV 다운로드
              </button>
              <button
                onClick={() => onExport('json')}
                className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-900/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                JSON 다운로드
              </button>
              <button
                onClick={() => onExport('pdf')}
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
  );
}
