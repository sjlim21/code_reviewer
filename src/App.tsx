import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useProjectStore } from './stores/projectStore';
import { useIssueStore } from './stores/issueStore';
import { useUiStore } from './stores/uiStore';
import { Dashboard } from './components/Dashboard';
import { CodeViewer } from './components/CodeViewer';
import { Uploader } from './components/Uploader';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { AppShell } from './components/layout/AppShell';
import {
  mockProjects,
  mockIssues,
  getSupabaseClient,
  type Issue
} from './supabase';
import {
  Terminal,
  Eye,
  GitBranch,
  ExternalLink,
  Database,
  LogOut,
  User
} from 'lucide-react';

function insertSorted(arr: Issue[], item: Issue): Issue[] {
  let low = 0;
  let high = arr.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (item.priority_score > arr[mid].priority_score) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  const result = [...arr];
  result.splice(low, 0, item);
  return result;
}

function AppContent() {
  const { session, isDemoSession, isLoadingSession, initAuth, setDemoSession, signOut } = useAuthStore();
  const { selectedProject, isUsingRealDB, setProjects, setSelectedProject, setIsUsingRealDB } = useProjectStore();
  const { issues, selectedIssue, setIssues, setSelectedIssue, upsertIssue } = useIssueStore();
  const { activeTab, theme, setActiveTab, setTheme, addLog } = useUiStore();

  // 1. Initialize Supabase auth subscription
  useEffect(() => {
    const { data: { subscription } } = initAuth();
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Apply theme CSS variable
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 3. Load data when session / demoSession changes
  useEffect(() => {
    let ignore = false;

    const loadDBData = async () => {
      const supabase = getSupabaseClient();

      if (!session && !isDemoSession) {
        if (!ignore) {
          setProjects([]);
          setIssues([]);
        }
        return;
      }

      if (!supabase || isDemoSession) {
        if (!ignore) {
          addLog('데모 세션 활성화 - 로컬 가상 Mock 데이터를 패칭합니다.', 'info');
          setProjects(mockProjects);
          setIssues(mockIssues);
          setSelectedProject(mockProjects[0]);
          setIsUsingRealDB(false);
        }
        return;
      }

      try {
        if (!ignore) {
          setIsUsingRealDB(true);
          addLog('Supabase 클라우드 데이터베이스 연결 중...', 'info');
        }

        const { data: dbProjects, error: projError } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (projError) throw projError;
        if (ignore) return;

        if (dbProjects && dbProjects.length > 0) {
          addLog(`클라우드 프로젝트 데이터를 성공적으로 로드했습니다. (총 ${dbProjects.length}개)`, 'success');
          setProjects(dbProjects);
          const currentSelected = useProjectStore.getState().selectedProject;
          const nextSelected = dbProjects.some(p => p.id === currentSelected?.id)
            ? currentSelected
            : dbProjects[0];
          setSelectedProject(nextSelected);

          const { data: dbIssues, error: issuesError } = await supabase
            .from('issues')
            .select('*')
            .eq('project_id', dbProjects[0].id)
            .order('priority_score', { ascending: false });

          if (issuesError) throw issuesError;
          if (!ignore) {
            setIssues(dbIssues ?? []);
          }
        } else {
          if (!ignore) {
            addLog('클라우드 DB에 생성된 프로젝트가 없습니다.', 'info');
            setProjects([]);
            setIssues([]);
            setSelectedProject(null);
          }
        }
      } catch (err) {
        console.error('Supabase load error:', err);
        if (!ignore) {
          addLog('Supabase 로드 에러가 발생하여 오프라인 모드로 전환합니다.', 'error');
          setProjects([]);
          setIssues([]);
          setSelectedProject(null);
          setIsUsingRealDB(false);
        }
      }
    };

    if (!isLoadingSession) {
      loadDBData();
    }

    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isDemoSession, isLoadingSession]);

  // 4. Re-fetch issues when selected project changes
  useEffect(() => {
    let ignore = false;

    const fetchIssuesForProject = async () => {
      if (!selectedProject) return;
      if (!isUsingRealDB) {
        addLog(`[프로젝트 전환] 데모 프로젝트 '${selectedProject.name}'의 이슈 목록을 가져왔습니다.`, 'info');
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        addLog(`[프로젝트 전환] '${selectedProject.name}' 프로젝트 이슈 데이터를 패칭 중...`, 'info');
        const { data: dbIssues, error } = await supabase
          .from('issues')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('priority_score', { ascending: false });

        if (error) throw error;
        if (!ignore) {
          setIssues(dbIssues ?? []);
          addLog(`[프로젝트 전환] '${selectedProject.name}'의 이슈 ${dbIssues?.length ?? 0}건을 로드했습니다.`, 'success');
        }
      } catch (err) {
        console.error('Fetch issues error:', err);
        addLog(`[에러] '${selectedProject.name}' 이슈 패칭 실패.`, 'error');
      }
    };

    fetchIssuesForProject();
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id, isUsingRealDB]);

  // 5. Realtime subscription
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedProject || !isUsingRealDB) return;

    addLog(`[실시간 데이터] '${selectedProject.name}' 프로젝트의 Postgres 변경 알림 구독 중...`, 'info');
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'issues',
          filter: `project_id=eq.${selectedProject.id}`
        },
        (payload) => {
          console.log('Realtime change detected:', payload);
          if (payload.eventType === 'INSERT') {
            const ins = payload.new as Issue;
            addLog(`[실시간 동기화] 새로운 결함 감지: [${ins.severity.toUpperCase()}] ${ins.title}`, 'warning');
            const currentIssues = useIssueStore.getState().issues;
            useIssueStore.getState().setIssues(insertSorted(currentIssues, ins));
          } else if (payload.eventType === 'UPDATE') {
            const upd = payload.new as Issue;
            addLog(`[실시간 동기화] 결함 업데이트됨: [${upd.status}] ${upd.title}`, 'info');
            upsertIssue(upd);
            const currentSelected = useIssueStore.getState().selectedIssue;
            if (currentSelected && currentSelected.id === upd.id) {
              setSelectedIssue(upd);
            }
          } else if (payload.eventType === 'DELETE') {
            addLog(`[실시간 동기화] 결함 삭제됨 (ID: ${payload.old.id})`, 'info');
            const filtered = useIssueStore.getState().issues.filter(i => i.id !== payload.old.id);
            useIssueStore.getState().setIssues(filtered);
          }
        }
      )
      .subscribe();

    return () => {
      addLog(`[실시간 데이터] '${selectedProject.name}' 실시간 채널 구독 해제`, 'info');
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id, isUsingRealDB]);

  // Logout handler
  const handleLogout = async () => {
    addLog('사용자 로그아웃 프로세스를 실행합니다.', 'info');
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    signOut();
    setSelectedProject(null);
    setProjects([]);
    setIssues([]);
    addLog('성공적으로 로그아웃되었습니다.', 'success');
  };

  // Loading screen
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--theme-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth guard
  if (!session && !isDemoSession) {
    return <Login onMockLogin={() => setDemoSession(true)} />;
  }

  const userEmail = session?.user?.email || 'offline-demo@github.com';
  const userName = session?.user?.user_metadata?.full_name || 'Demo User';

  // Suppress unused vars warning - issues used by child components via store
  void issues;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0f19] to-[#080b12] text-slate-100">

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

      {/* Top Header Bar (logo + theme + profile) */}
      <header className="border-b border-[#26334a]/60 bg-[#131a26]/40 backdrop-blur-md sticky top-0 z-40">
        <div className="pl-60 pr-4 sm:pr-6 lg:pr-8 h-16 flex items-center justify-between">
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

          <div className="flex items-center gap-6">
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

      {/* AppShell: Sidebar + Main Content */}
      <AppShell>
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
        {activeTab === 'upload' && <Uploader />}
        {activeTab === 'history' && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-white/30">History — coming soon</p>
          </div>
        )}
        {activeTab === 'reports' && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-white/30">Reports — coming soon</p>
          </div>
        )}
        {activeTab === 'settings' && <Settings />}
      </AppShell>

      {/* CodeViewer full-screen overlay (outside AppShell) */}
      {selectedIssue && (
        <CodeViewer
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
        />
      )}

      {/* Footer Info */}
      <footer className="border-t border-[#26334a]/60 py-6 bg-[#0b0f19] pl-60">
        <div className="px-4 text-center text-xs text-slate-600 flex flex-col md:flex-row md:justify-between items-center gap-2">
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

export default function App() {
  return <AppContent />;
}
