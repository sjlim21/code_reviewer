import { useState } from 'react';
import { mockProjects, mockIssues, type Issue, type Project } from './supabase';
import { Dashboard } from './components/Dashboard';
import { CodeViewer } from './components/CodeViewer';
import { Uploader } from './components/Uploader';
import { Settings } from './components/Settings';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Sliders, 
  Terminal, 
  Eye, 
  GitBranch, 
  ExternalLink
} from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'settings'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(mockProjects[0]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issues, setIssues] = useState<Issue[]>(mockIssues);

  // 이슈 상태 변경 핸들러
  const handleUpdateStatus = (issueId: string, newStatus: Issue['status']) => {
    setIssues(prevIssues => 
      prevIssues.map(issue => 
        issue.id === issueId 
          ? { 
              ...issue, 
              status: newStatus,
              resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null 
            } 
          : issue
      )
    );
    // 상세 보기 중인 이슈도 상태 업데이트
    if (selectedIssue && selectedIssue.id === issueId) {
      setSelectedIssue(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  // 분석 완료 후 새 이슈 추가 핸들러
  const handleAnalysisComplete = (newIssues: Issue[]) => {
    setIssues(prev => [...newIssues, ...prev]);
    setActiveTab('dashboard'); // 분석 완료 시 대시보드로 자동 이동
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0f19] to-[#080b12] text-slate-100 flex flex-col justify-between">
      
      {/* Navigation Header */}
      <header className="border-b border-[#26334a]/60 bg-[#131a26]/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Terminal size={22} className="animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-1.5">
                CODE EYE
              </span>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-widest mt-0.5">
                Smart Issue Analyzer
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <LayoutDashboard size={14} />
              대시보드
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'upload'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <UploadCloud size={14} />
              코드 분석
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Sliders size={14} />
              분석 설정
            </button>
          </nav>
        </div>
      </header>

      {/* Main Contents */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Project Context Info */}
        {selectedProject && (
          <div className="mb-6 p-4 bg-[#131a26]/30 border border-[#26334a]/40 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-800/60 border border-slate-700/60 rounded-lg">
                <GitBranch size={16} className="text-slate-400" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  {selectedProject.name}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">
                    {selectedProject.language}
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-1">{selectedProject.description}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <a 
                href={selectedProject.repo_url} 
                target="_blank" 
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#0b0f19] border border-[#26334a] hover:border-indigo-500/40 hover:bg-slate-800/40 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <GitBranch size={12} />
                Github Repository
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}

        {/* Tab Router Switch */}
        {activeTab === 'dashboard' && (
          <Dashboard 
            selectedProject={selectedProject}
            onSelectProject={setSelectedProject}
            onSelectIssue={setSelectedIssue}
            issues={issues}
          />
        )}

        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <Uploader 
              selectedProject={selectedProject} 
              onAnalysisComplete={handleAnalysisComplete}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <Settings project={selectedProject} />
        )}

        {/* Sidebar Slide Detail View overlay */}
        {selectedIssue && (
          <CodeViewer 
            issue={selectedIssue}
            onClose={() => setSelectedIssue(null)}
            onUpdateStatus={handleUpdateStatus}
          />
        )}
      </main>

      {/* Footer Info */}
      <footer className="border-t border-[#26334a]/60 py-6 bg-[#0b0f19]">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-600 flex flex-col md:flex-row md:justify-between items-center gap-2">
          <div>
            &copy; 2026 CODE EYE. AI-Powered Static Code Review Platform.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Eye size={12} />
              Supabase PostgreSQL Core Enabled
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default App;
