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

export interface EventLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

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
  eventLogs: EventLog[];
  addEventLog: (message: string, type?: EventLog['type']) => void;
  clearEventLogs: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'settings'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isUsingRealDB, setIsUsingRealDB] = useState(false);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);

  const addEventLog = (message: string, type: EventLog['type'] = 'info') => {
    const newLog: EventLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      message,
      type
    };
    setTimeout(() => {
      setEventLogs(prev => [newLog, ...prev].slice(0, 100));
    }, 0);
  };

  const clearEventLogs = () => {
    setEventLogs([]);
    addEventLog('시스템 이벤트 콘솔이 초기화되었습니다.', 'info');
  };

  useEffect(() => {
    addEventLog('CodeEye 보안 진단 콘솔 초기화 완료.', 'info');
  }, []);
  
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
        if (currentSession) {
          addEventLog(`GitHub 계정 로그인 감지: ${currentSession.user?.email || currentSession.user?.id}`, 'success');
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
        if (!ignore) {
          addEventLog('데모 세션 활성화 - 로컬 가상 Mock 데이터를 패칭합니다.', 'info');
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
          addEventLog('Supabase 클라우드 데이터베이스 연결 중...', 'info');
        }
        
        const { data: dbProjects, error: projError } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        if (projError) throw projError;
        if (ignore) return;

        if (dbProjects && dbProjects.length > 0) {
          addEventLog(`클라우드 프로젝트 데이터를 성공적으로 로드했습니다. (총 ${dbProjects.length}개)`, 'success');
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
            addEventLog('클라우드 DB에 생성된 프로젝트가 없습니다.', 'info');
            setProjects([]);
            setIssues([]);
            setSelectedProject(null);
          }
        }

      } catch (err) {
        console.error("Supabase load error:", err);
        if (!ignore) {
          addEventLog('Supabase 로드 에러가 발생하여 오프라인 모드로 전환합니다.', 'error');
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
      if (!selectedProject) return;
      if (!isUsingRealDB) {
        addEventLog(`[프로젝트 전환] 데모 프로젝트 '${selectedProject.name}'의 이슈 목록을 가져왔습니다.`, 'info');
        return;
      }
      
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        addEventLog(`[프로젝트 전환] '${selectedProject.name}' 프로젝트 이슈 데이터를 패칭 중...`, 'info');
        const { data: dbIssues, error } = await supabase
          .from('issues')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('priority_score', { ascending: false });

        if (error) throw error;
        if (!ignore) {
          setIssues(dbIssues as Issue[]);
          addEventLog(`[프로젝트 전환] '${selectedProject.name}'의 이슈 ${dbIssues.length}건을 로드했습니다.`, 'success');
        }
      } catch (err) {
        console.error("Fetch issues error:", err);
        addEventLog(`[에러] '${selectedProject.name}' 이슈 패칭 실패.`, 'error');
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

    addEventLog(`[실시간 데이터] '${selectedProject.name}' 프로젝트의 Postgres 변경 알림 구독 중...`, 'info');
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
            addEventLog(`[실시간 동기화] 새로운 결함 감지: [${ins.severity.toUpperCase()}] ${ins.title}`, 'warning');
            setIssues(prev => insertSorted(prev, ins));
          } else if (payload.eventType === 'UPDATE') {
            const upd = payload.new as Issue;
            addEventLog(`[실시간 동기화] 결함 업데이트됨: [${upd.status}] ${upd.title}`, 'info');
            setIssues(prev => prev.map(issue => issue.id === upd.id ? upd : issue));
            setSelectedIssue(current => current && current.id === upd.id ? upd : current);
          } else if (payload.eventType === 'DELETE') {
            addEventLog(`[실시간 동기화] 결함 삭제됨 (ID: ${payload.old.id})`, 'info');
            setIssues(prev => prev.filter(issue => issue.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      addEventLog(`[실시간 데이터] '${selectedProject.name}' 실시간 채널 구독 해제`, 'info');
      supabase.removeChannel(channel);
    };
  }, [selectedProject, isUsingRealDB]);

  // 5. 이슈 상태 변경 핸들러
  const handleUpdateStatus = async (issueId: string, newStatus: Issue['status']) => {
    const previousIssues = [...issues];
    const previousSelectedIssue = selectedIssue ? { ...selectedIssue } : null;
    const targetIssue = issues.find(i => i.id === issueId);
    const title = targetIssue ? targetIssue.title : issueId;

    addEventLog(`[이슈 변경] 결함 [${title}]의 상태를 '${newStatus}'(으)로 변경 중...`, 'info');

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
          addEventLog(`[이슈 변경 완료] DB 업데이트 성공.`, 'success');
        } catch (e) {
          console.error("DB status update failed. Rolling back state:", e);
          addEventLog(`[에러] 이슈 변경 실패, 롤백 수행.`, 'error');
          alert('데이터베이스 업데이트 실패로 변경 사항이 롤백되었습니다.');
          setIssues(previousIssues);
          setSelectedIssue(previousSelectedIssue);
        }
      }
    } else {
      addEventLog(`[이슈 변경 완료] 로컬 세션 상태 업데이트 완료.`, 'success');
    }

    // Webhook simulation if URL exists
    const slack = localStorage.getItem('code_eye_slack_webhook_url');
    const discord = localStorage.getItem('code_eye_discord_webhook_url');
    if (slack || discord) {
      addEventLog(`[웹훅 연동] 결함 상태 변경 이벤트 알림 전송 시작...`, 'info');
      setTimeout(() => {
        if (slack) addEventLog(`[웹훅 연동] Slack 채널로 [${newStatus}] 알림 전송 성공`, 'success');
        if (discord) addEventLog(`[웹훅 연동] Discord 채널로 [${newStatus}] 알림 전송 성공`, 'success');
      }, 300);
    }
  };

  // 6. 분석 완료 후 새 이슈 추가 핸들러
  const handleAnalysisComplete = (newIssues: Issue[]) => {
    setIssues(prev => [...newIssues, ...prev].sort((a, b) => b.priority_score - a.priority_score));
    setActiveTab('dashboard');
    addEventLog(`[진단 완료] 정적 진단이 완료되었습니다. (감지된 결함: ${newIssues.length}건)`, 'success');

    // Webhook simulation if URL exists and contains issues
    if (newIssues.length > 0) {
      const slack = localStorage.getItem('code_eye_slack_webhook_url');
      const discord = localStorage.getItem('code_eye_discord_webhook_url');
      if (slack || discord) {
        addEventLog(`[웹훅 연동] 새로운 취약점 발견 알림 웹훅 전송 시작...`, 'info');
        setTimeout(() => {
          if (slack) addEventLog(`[웹훅 연동] Slack 채널로 분석 알림 전송 완료 (${newIssues.length}건 감지)`, 'success');
          if (discord) addEventLog(`[웹훅 연동] Discord 채널로 분석 알림 전송 완료 (${newIssues.length}건 감지)`, 'success');
        }, 500);
      }
    }
  };

  // 7. 프로젝트 삭제 핸들러
  const handleDeleteProject = async (projectId: string) => {
    const targetProj = projects.find(p => p.id === projectId);
    const name = targetProj ? targetProj.name : projectId;

    if (!window.confirm('정말로 이 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 프로젝트와 연결된 모든 이슈 및 분석 이력이 영구적으로 제거됩니다.')) {
      return;
    }

    addEventLog(`[프로젝트 삭제] '${name}' 프로젝트를 삭제하는 중...`, 'info');

    if (isUsingRealDB) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);
          if (error) throw error;
          addEventLog(`[프로젝트 삭제 완료] DB 삭제 성공.`, 'success');
        } catch (e) {
          console.error("DB project delete failed:", e);
          const errorMsg = e instanceof Error ? e.message : String(e);
          addEventLog(`[에러] 프로젝트 DB 삭제 실패: ${errorMsg}`, 'error');
          alert('프로젝트 삭제 중 에러가 발생했습니다: ' + errorMsg);
          return;
        }
      }
    } else {
      addEventLog(`[프로젝트 삭제 완료] 로컬 데이터 삭제 완료.`, 'success');
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
    addEventLog('사용자 로그아웃 프로세스를 실행합니다.', 'info');
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setIsDemoSession(false);
    setSelectedProject(null);
    setProjects([]);
    setIssues([]);
    addEventLog('성공적으로 로그아웃되었습니다.', 'success');
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
      handleLogout,
      eventLogs,
      addEventLog,
      clearEventLogs
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
