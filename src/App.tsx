import { useState, useEffect } from 'react';
import { type Session } from '@supabase/supabase-js';
import { 
  mockProjects, 
  mockIssues, 
  getSupabaseClient,
  type Issue, 
  type Project 
} from './supabase';
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

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'settings'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isUsingRealDB, setIsUsingRealDB] = useState(false);
  
  // 인증 및 세션 상태 추가
  const [session, setSession] = useState<Session | null>(null);
  const [googleToken, setGoogleToken] = useState<string>('');
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(() => !getSupabaseClient());

  // 1. Supabase Auth 세션 감지 및 초기 로드
  useEffect(() => {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      Promise.resolve().then(() => {
        setIsLoadingSession(false);
      });
      return;
    }

    // 초기 세션 획득
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.provider_token) {
        setGoogleToken(initialSession.provider_token);
      }
      setIsLoadingSession(false);
      
      // OAuth 리다이렉션 해시 파라미터 클리닝으로 무한 인증 상태 변경 루프 방지
      if (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });

    // 인증 상태 변화 리스너 등록
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession((prev: Session | null) => {
        // 동일 사용자 세션인 경우 상태 변경을 생략하여 무한 렌더링 루프 방지
        if (prev?.user?.id === currentSession?.user?.id) {
          return prev;
        }
        return currentSession;
      });
      
      if (currentSession) {
        // 가딩 적용: 이미 데모 세션이 꺼져있는 경우 상태 변화 렌더 트리거 방지
        setIsDemoSession(prev => prev ? false : prev);
        if (currentSession.provider_token) {
          setGoogleToken(currentSession.provider_token);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. 로그인 완료 후 실시간 DB로부터 데이터 패칭 (경합 조건 및 무한 루프 방어 패치)
  useEffect(() => {
    let ignore = false;

    const loadDBData = async () => {
      const supabase = getSupabaseClient();
      
      // 인증도 없고 가상 데모 세션도 없으면 패칭 중단
      if (!session && !isDemoSession) {
        if (!ignore) {
          setProjects([]);
          setIssues([]);
        }
        return;
      }

      if (!supabase || isDemoSession) {
        // Fallback to Mock Data
        console.log("Using Mock fallback data (Demo Session).");
        if (!ignore) {
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
        }
        
        // 프로젝트 로드
        const { data: dbProjects, error: projError } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (projError) throw projError;
        if (ignore) return;

        if (dbProjects && dbProjects.length > 0) {
          setProjects(dbProjects as Project[]);
          setSelectedProject(current => {
            if (current && dbProjects.some(p => p.id === current.id)) {
              return current;
            }
            return dbProjects[0] as Project;
          });
          
          // 첫 번째 프로젝트의 이슈 로드
          const { data: dbIssues, error: issuesError } = await supabase
            .from('issues')
            .select('*')
            .eq('project_id', dbProjects[0].id)
            .order('priority_score', { ascending: false });

          if (issuesError) throw issuesError;
          if (!ignore) {
            setIssues(dbIssues as Issue[]);
          }
        } else {
          if (!ignore) {
            setProjects([]);
            setIssues([]);
            setSelectedProject(null);
          }
        }

      } catch (err) {
        console.error("Supabase load error:", err);
        if (!ignore) {
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

    return () => {
      ignore = true;
    };
  }, [session, isDemoSession, isLoadingSession]);

  // 3. 선택된 프로젝트가 변경될 때 이슈 목록을 다시 로드 (문자열 ID 의존성 매핑 및 경합 방지)
  useEffect(() => {
    let ignore = false;

    const fetchIssuesForProject = async () => {
      if (!selectedProject || !isUsingRealDB) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        const { data: dbIssues, error } = await supabase
          .from('issues')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('priority_score', { ascending: false });

        if (error) throw error;
        if (!ignore) {
          setIssues(dbIssues as Issue[]);
        }
      } catch (err) {
        console.error("Fetch issues error:", err);
      }
    };

    fetchIssuesForProject();

    return () => {
      ignore = true;
    };
  }, [selectedProject, isUsingRealDB]);

  // 4. Supabase Realtime 실시간 구독 설정 (이슈 변경 감지, ID 의존성 패치)
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedProject || !isUsingRealDB) return;

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
            setIssues(prev => [payload.new as Issue, ...prev].sort((a, b) => b.priority_score - a.priority_score));
          } else if (payload.eventType === 'UPDATE') {
            setIssues(prev => prev.map(issue => issue.id === payload.new.id ? (payload.new as Issue) : issue));
            setSelectedIssue(current => current && current.id === payload.new.id ? (payload.new as Issue) : current);
          } else if (payload.eventType === 'DELETE') {
            setIssues(prev => prev.filter(issue => issue.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProject, isUsingRealDB]);

  // 5. 이슈 상태 변경 핸들러 (실제 DB UPDATE 포함 - 에러 시 안전한 롤백 지원)
  const handleUpdateStatus = async (issueId: string, newStatus: Issue['status']) => {
    // 롤백을 위해 이전 상태 백업
    const previousIssues = [...issues];
    const previousSelectedIssue = selectedIssue ? { ...selectedIssue } : null;

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
    if (selectedIssue && selectedIssue.id === issueId) {
      setSelectedIssue(prev => prev ? { ...prev, status: newStatus } : null);
    }

    if (isUsingRealDB) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('issues')
            .update({ 
              status: newStatus,
              resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null,
              resolved_by: session?.user?.id || null
            })
            .eq('id', issueId);
          if (error) throw error;
        } catch (e) {
          console.error("DB status update failed. Rolling back state:", e);
          alert('데이터베이스 업데이트 실패로 변경 사항이 롤백되었습니다.');
          setIssues(previousIssues);
          setSelectedIssue(previousSelectedIssue);
        }
      }
    }
  };

  // 6. 분석 완료 후 새 이슈 추가 핸들러
  const handleAnalysisComplete = (newIssues: Issue[]) => {
    setIssues(prev => [...newIssues, ...prev].sort((a, b) => b.priority_score - a.priority_score));
    setActiveTab('dashboard');
  };

  // 7. 프로젝트 삭제 핸들러
  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('정말로 이 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 프로젝트와 연결된 모든 이슈 및 분석 이력이 영구적으로 제거됩니다.')) {
      return;
    }

    if (isUsingRealDB) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);
          if (error) throw error;
        } catch (e) {
          console.error("DB project delete failed:", e);
          const errorMsg = e instanceof Error ? e.message : String(e);
          alert('프로젝트 삭제 중 에러가 발생했습니다: ' + errorMsg);
          return;
        }
      }
    }

    // 로컬 상태 동기화
    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);

    if (selectedProject?.id === projectId) {
      if (updatedProjects.length > 0) {
        setSelectedProject(updatedProjects[0]);
      } else {
        setSelectedProject(null);
        setIssues([]);
      }
    }
  };

  // 로그아웃 핸들러
  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setGoogleToken('');
    setIsDemoSession(false);
    setSelectedProject(null);
    setProjects([]);
    setIssues([]);
  };

  // 로딩 화면
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 7. 인증 가드 분기 (세션 부재 시 로그인 페이지 렌더링)
  if (!session && !isDemoSession) {
    return <Login onMockLogin={() => setIsDemoSession(true)} />;
  }

  const userEmail = session?.user?.email || 'offline-demo@google.com';
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

          {/* Navigation Tabs & Session Profile */}
          <div className="flex items-center gap-6">
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
            projects={projects}
            onDeleteProject={handleDeleteProject}
          />
        )}

        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <Uploader 
              selectedProject={selectedProject} 
              onAnalysisComplete={handleAnalysisComplete}
              session={session}
              projects={projects}
              onProjectCreated={(newProj) => {
                setProjects(prev => [newProj, ...prev]);
                setSelectedProject(newProj);
              }}
              onProjectSelected={(proj) => {
                setSelectedProject(proj);
              }}
              googleToken={googleToken}
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
              {isUsingRealDB ? 'Supabase PostgreSQL DB Core Active' : 'Sandbox Demo Mode'}
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default App;
