import { AppProvider, useAppContext } from './context/AppContext';
import { Dashboard } from './components/Dashboard';
import { CodeViewer } from './components/CodeViewer';
import { Uploader } from './components/Uploader';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Sliders, 
  Terminal, 
  Eye, 
  GitBranch, 
  ExternalLink,
  Database,
  LogOut,
  User
} from 'lucide-react';

function AppContent() {
  const {
    activeTab,
    setActiveTab,
    selectedProject,
    selectedIssue,
    setSelectedIssue,
    isUsingRealDB,
    theme,
    setTheme,
    session,
    setIsDemoSession,
    isDemoSession,
    isLoadingSession,
    handleLogout
  } = useAppContext();

  // 로딩 화면
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--theme-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 인증 가드 분기 (세션 부재 시 로그인 페이지 렌더링)
  if (!session && !isDemoSession) {
    return <Login onMockLogin={() => setIsDemoSession(true)} />;
  }

  const userEmail = session?.user?.email || 'offline-demo@github.com';
  const userName = session?.user?.user_metadata?.full_name || 'Demo User';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0f19] to-[#080b12] text-slate-100 flex flex-col justify-between">
      
      {!isUsingRealDB && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-[11px] font-semibold py-2.5 px-4 text-center flex items-center justify-center gap-2 z-50 animate-in fade-in duration-300">
          <span>⚠️ 현재 로컬 샌드박스 데모 모드로 작동 중입니다. 실시간 데이터베이스 연동 및 AI 정밀 분석 결과를 저장하려면 <b>[분석 설정]</b> 탭에서 Supabase 정보를 입력해 주세요.</span>
          <button 
            onClick={() => setActiveTab('settings')}
            className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[9px] font-bold uppercase transition-all cursor-pointer"
          >
            연동하기
          </button>
        </div>
      )}

      {/* Navigation Header */}
      <header className="border-b border-[#26334a]/60 bg-[#131a26]/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/30 rounded-xl text-[var(--theme-accent)]">
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

          {/* Navigation Tabs & Session Profile */}
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                style={activeTab === 'dashboard' ? { backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 12px var(--glow-accent-1)' } : undefined}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <LayoutDashboard size={14} />
                대시보드
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                style={activeTab === 'upload' ? { backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 12px var(--glow-accent-1)' } : undefined}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <UploadCloud size={14} />
                코드 분석
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                style={activeTab === 'settings' ? { backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 12px var(--glow-accent-1)' } : undefined}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'settings'
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Sliders size={14} />
                분석 설정
              </button>
            </nav>

            {/* Theme Switcher */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 gap-1.5 shrink-0">
              <button
                onClick={() => setTheme('indigo')}
                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  theme === 'indigo'
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
                title="Midnight Indigo"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              </button>
              <button
                onClick={() => setTheme('emerald')}
                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  theme === 'emerald'
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
                title="Cyberpunk Emerald"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </button>
              <button
                onClick={() => setTheme('amber')}
                className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  theme === 'amber'
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                }`}
                title="Solar Amber"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              </button>
            </div>

            {/* Profile Info & Logout */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-800/80">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-300">{userName}</div>
                <div className="text-[10px] text-slate-500 font-mono">{userEmail}</div>
              </div>
              <div className="p-2 bg-slate-800/60 rounded-xl text-slate-400 border border-slate-700/50">
                <User size={14} />
              </div>
              <button
                onClick={handleLogout}
                className="p-2 bg-slate-800/20 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                title="로그아웃"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
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
            
            <div className="flex items-center gap-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5 font-semibold">
                <Database size={14} className={isUsingRealDB ? 'text-emerald-400' : 'text-amber-500'} />
                {isUsingRealDB ? 'Supabase Real-time 연결됨' : '데모 시뮬레이션 모드'}
              </div>
              
              <a 
                href={selectedProject.repo_url} 
                target="_blank" 
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#0b0f19] border border-[#26334a] hover:border-[var(--theme-accent)]/40 hover:bg-slate-800/40 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <GitBranch size={12} />
                Github Repository
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}

        {/* Tab Router Switch */}
        {activeTab === 'dashboard' && <Dashboard />}

        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <Uploader />
          </div>
        )}

        {activeTab === 'settings' && <Settings />}

        {/* Sidebar Slide Detail View overlay */}
        {selectedIssue && (
          <CodeViewer 
            issue={selectedIssue}
            onClose={() => setSelectedIssue(null)}
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
              {isUsingRealDB ? 'Supabase PostgreSQL DB Core Active' : 'Sandbox Demo Mode'}
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
