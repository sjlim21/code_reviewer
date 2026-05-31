import React, { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../supabase';
import { Terminal, Key, AlertCircle } from 'lucide-react';

interface LoginProps {
  onMockLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onMockLogin }) => {
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleGithubLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.warn("Supabase configuration missing. Falling back to offline demo mode login.");
      timerRef.current = setTimeout(() => {
        setIsLoading(false);
        onMockLogin();
      }, 1000);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
          scopes: 'read:user'
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("OAuth login request failed:", err);
      const message = err instanceof Error ? err.message : 'GitHub 로그인 요청 중 오류가 발생했습니다.';
      setErrorMsg(message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080c14] to-[#04060a] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background glowing ambient light */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-login-1 rounded-full blur-[100px] pointer-events-none animate-float-auras" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-login-2 rounded-full blur-[100px] pointer-events-none animate-float-auras-reverse" />
      <div className="absolute top-1/2 left-2/3 w-64 h-64 bg-login-3 rounded-full blur-[90px] pointer-events-none animate-float-auras" style={{ animationDelay: '-5s' }} />


      <div className="w-full max-w-md glass-panel rounded-2xl p-8 shadow-2xl relative z-10 border border-[#26334a]/60 flex flex-col items-center text-center space-y-6">
        
        {/* Logo section */}
        <div className="flex flex-col items-center space-y-3">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl text-indigo-400 glow-indigo">
            <Terminal size={32} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              CODE EYE
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
              AI Code Review Gatekeeper
            </p>
          </div>
        </div>

        {/* Text descriptions */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-200">GitHub 계정 인증 필요</h2>
          <p className="text-xs text-slate-400 leading-relaxed px-4">
            이 도구는 인증받은 GitHub 계정 사용자 전용입니다.<br />
            보안과 코드 진단 DB 접근 제어를 위해 로그인이 필수입니다.
          </p>
        </div>

        {errorMsg && (
          <div className="w-full p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2 text-left">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* GitHub sign-in button */}
        <button
          onClick={handleGithubLogin}
          disabled={isLoading}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-3 transition-all duration-300 shadow-lg active:scale-[0.98] border border-slate-800"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {/* Inline SVG GitHub Logo */}
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
              </svg>
              <span>GitHub 계정으로 시작하기</span>
            </>
          )}
        </button>

        <div className="pt-4 border-t border-slate-800/80 w-full flex items-center justify-center gap-1.5 text-[9px] text-slate-500 font-mono">
          <Key size={10} />
          SSL / Supabase OAuth Guard Active
        </div>

      </div>
    </div>
  );
};
