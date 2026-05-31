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

  const handleGoogleLogin = async () => {
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
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          scopes: 'https://www.googleapis.com/auth/generative-language',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
      if (error) throw error;
    } catch (err) {
      console.error("OAuth login request failed:", err);
      const message = err instanceof Error ? err.message : 'Google 로그인 요청 중 오류가 발생했습니다.';
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
          <h2 className="text-sm font-semibold text-slate-200">Google 계정 인증 필요</h2>
          <p className="text-xs text-slate-400 leading-relaxed px-4">
            이 도구는 인증받은 Google 계정 사용자 전용입니다.<br />
            보안과 코드 진단 DB 접근 제어를 위해 로그인이 필수입니다.
          </p>
        </div>

        {errorMsg && (
          <div className="w-full p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2 text-left">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google sign-in button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full bg-[#4285f4] hover:bg-[#357ae8] text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-3 transition-all duration-300 shadow-lg active:scale-[0.98]"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {/* Inline SVG Google Logo */}
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.555 0-6.444-2.889-6.444-6.444s2.889-6.444 6.444-6.444c1.614 0 3.09.594 4.237 1.579l3.023-3.023C19.167 2.057 15.938 1 12.24 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.895 0 10.865-4.047 11.72-9.6H12.24z" />
              </svg>
              <span>Google 계정으로 시작하기</span>
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
