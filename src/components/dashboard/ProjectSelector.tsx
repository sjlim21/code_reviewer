import { Code, ChevronRight, ArrowUpRight, Trash2 } from 'lucide-react';
import type { Project } from '../../supabase';

export interface ProjectSelectorProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
}

export function ProjectSelector({
  projects,
  selectedProject,
  onSelectProject,
  onDeleteProject,
}: ProjectSelectorProps) {
  return (
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
  );
}
