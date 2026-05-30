import React, { useState } from 'react';
import { getSupabaseClient } from '../supabase';
import { Terminal, Key, AlertCircle } from 'lucide-react';

interface LoginProps {
  onMockLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onMockLogin }) => {
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGithubLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.warn("Supabase configuration missing. Falling back to offline demo mode login.");
      setTimeout(() => {
        setIsLoading(false);
        onMockLogin();
      }, 1000);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          // Vercel 배포 시 Vercel 도메인으로 리다이렉트
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      console.error("OAuth login request failed:", err);
      setErrorMsg(err.message || 'GitHub 로그인 요청 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080c14] to-[#04060a] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background glowing ambient light */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

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
          className="w-full bg-[#24292e] hover:bg-[#2c3238] text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-3 transition-all duration-300 shadow-lg active:scale-[0.98]"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {/* Inline SVG GitHub Logo */}
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
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
