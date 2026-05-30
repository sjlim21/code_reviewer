import { useState, useEffect } from 'react';
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
import { 
  LayoutDashboard, 
  UploadCloud, 
  Sliders, 
  Terminal, 
  Eye, 
  GitBranch, 
  ExternalLink,
  Database
} from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'settings'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isUsingRealDB, setIsUsingRealDB] = useState(false);

  // 1. Supabase에서 실시간 데이터 로드
  useEffect(() => {
    const loadDBData = async () => {
      const supabase = getSupabaseClient();
      
      if (!supabase) {
        // Fallback to Mock Data
        console.log("Using Mock fallback data.");
        setProjects(mockProjects);
        setIssues(mockIssues);
        setSelectedProject(mockProjects[0]);
        setIsUsingRealDB(false);
        return;
      }

      try {
        setIsUsingRealDB(true);
        
        // 프로젝트 로드
        const { data: dbProjects, error: projError } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (projError) throw projError;

        if (dbProjects && dbProjects.length > 0) {
          setProjects(dbProjects as Project[]);
          setSelectedProject(dbProjects[0] as Project);
          
          // 첫 번째 프로젝트의 이슈 로드
          const { data: dbIssues, error: issuesError } = await supabase
            .from('issues')
            .select('*')
            .eq('project_id', dbProjects[0].id)
            .order('priority_score', { ascending: false });

          if (issuesError) throw issuesError;
          setIssues(dbIssues as Issue[]);
        } else {
          // 프로젝트가 하나도 없는 경우 시드 프로젝트 가상 삽입 제안 또는 빈 배열
          setProjects([]);
          setIssues([]);
        }

      } catch (err) {
        console.error("Supabase load error:", err);
        // Error fallback to Mock
        setProjects(mockProjects);
        setIssues(mockIssues);
        setSelectedProject(mockProjects[0]);
        setIsUsingRealDB(false);
      }
    };

    loadDBData();
  }, []);

  // 2. 선택된 프로젝트가 변경될 때 이슈 목록을 다시 로드
  useEffect(() => {
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
        setIssues(dbIssues as Issue[]);
      } catch (err) {
        console.error("Fetch issues error:", err);
      }
    };

    fetchIssuesForProject();
  }, [selectedProject, isUsingRealDB]);

  // 3. Supabase Realtime 실시간 구독 설정 (이슈 변경 감지)
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedProject || !isUsingRealDB) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 전체 감지
          schema: 'public',
          table: 'issues',
          filter: `project_id=eq.${selectedProject.id}`
        },
        (payload) => {
          console.log('Realtime change detected:', payload);
          // 실시간으로 이슈 리스트 상태 갱신
          if (payload.eventType === 'INSERT') {
            setIssues(prev => [payload.new as Issue, ...prev].sort((a, b) => b.priority_score - a.priority_score));
          } else if (payload.eventType === 'UPDATE') {
            setIssues(prev => prev.map(issue => issue.id === payload.new.id ? (payload.new as Issue) : issue));
            // 상세 열려 있는 이슈 업데이트
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

  // 4. 이슈 상태 변경 핸들러 (실제 DB UPDATE 포함)
  const handleUpdateStatus = async (issueId: string, newStatus: Issue['status']) => {
    // 1단계: 프론트 상태 즉시 반영 (Optimistic UI)
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

    // 2단계: 실제 Supabase DB 업데이트 요청
    if (isUsingRealDB) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('issues')
            .update({ 
              status: newStatus,
              resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null,
              resolved_by: 'usr-1' // Default Admin
            })
            .eq('id', issueId);
          if (error) throw error;
        } catch (e) {
          console.error("DB update status failed:", e);
        }
      }
    }
  };

  // 5. 분석 완료 후 새 이슈 추가 핸들러
  const handleAnalysisComplete = (newIssues: Issue[]) => {
    if (isUsingRealDB) {
      // Supabase Realtime 구독 채널에서 INSERT 이벤트를 통해 자동으로 갱신될 것임.
      // 수동 동기화 보강
      setIssues(prev => [...newIssues, ...prev].sort((a, b) => b.priority_score - a.priority_score));
    } else {
      setIssues(prev => [...newIssues, ...prev].sort((a, b) => b.priority_score - a.priority_score));
    }
    setActiveTab('dashboard');
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
              {isUsingRealDB ? 'Supabase PostgreSQL DB Core Active' : 'Sandbox Demo Mode'}
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default App;
