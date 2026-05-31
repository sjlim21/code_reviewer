/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { type Session } from '@supabase/supabase-js';
import { 
  mockProjects, 
  mockIssues, 
  getSupabaseClient,
  type Issue, 
  type Project 
} from '../supabase';

interface AppContextType {
  activeTab: 'dashboard' | 'upload' | 'settings';
  setActiveTab: React.Dispatch<React.SetStateAction<'dashboard' | 'upload' | 'settings'>>;
  selectedProject: Project | null;
  setSelectedProject: React.Dispatch<React.SetStateAction<Project | null>>;
  selectedIssue: Issue | null;
  setSelectedIssue: React.Dispatch<React.SetStateAction<Issue | null>>;
  issues: Issue[];
  setIssues: React.Dispatch<React.SetStateAction<Issue[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  isUsingRealDB: boolean;
  setIsUsingRealDB: React.Dispatch<React.SetStateAction<boolean>>;
  theme: 'indigo' | 'emerald' | 'amber';
  setTheme: React.Dispatch<React.SetStateAction<'indigo' | 'emerald' | 'amber'>>;
  session: Session | null;
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
  isDemoSession: boolean;
  setIsDemoSession: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingSession: boolean;
  handleUpdateStatus: (issueId: string, newStatus: Issue['status']) => Promise<void>;
  handleAnalysisComplete: (newIssues: Issue[]) => void;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleLogout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'settings'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isUsingRealDB, setIsUsingRealDB] = useState(false);
  
  const [theme, setTheme] = useState<'indigo' | 'emerald' | 'amber'>(() => {
    return (localStorage.getItem('codeeye-theme') as 'indigo' | 'emerald' | 'amber') || 'indigo';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('codeeye-theme', theme);
  }, [theme]);
  
  const [session, setSession] = useState<Session | null>(null);
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

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setIsLoadingSession(false);
      
      if (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('error='))) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession((prev: Session | null) => {
        if (prev?.user?.id === currentSession?.user?.id) {
          return prev;
        }
        return currentSession;
      });
      
      if (currentSession) {
        setIsDemoSession(prev => prev ? false : prev);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. 로그인 완료 후 실시간 DB로부터 데이터 패칭
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

  // 3. 선택된 프로젝트가 변경될 때 이슈 목록을 다시 로드
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

  // 4. Supabase Realtime 실시간 구독 설정
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

  // 5. 이슈 상태 변경 핸들러
  const handleUpdateStatus = async (issueId: string, newStatus: Issue['status']) => {
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
    setIsDemoSession(false);
    setSelectedProject(null);
    setProjects([]);
    setIssues([]);
  };

  return (
    <AppContext.Provider value={{
      activeTab,
      setActiveTab,
      selectedProject,
      setSelectedProject,
      selectedIssue,
      setSelectedIssue,
      issues,
      setIssues,
      projects,
      setProjects,
      isUsingRealDB,
      setIsUsingRealDB,
      theme,
      setTheme,
      session,
      setSession,
      isDemoSession,
      setIsDemoSession,
      isLoadingSession,
      handleUpdateStatus,
      handleAnalysisComplete,
      handleDeleteProject,
      handleLogout
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
