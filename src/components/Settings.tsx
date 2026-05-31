import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS, type Project } from '../supabase';
import { Save, Settings2, Sliders, Shield, Bell, Check, Key, Database, Info } from 'lucide-react';

interface SettingsProps {
  project: Project | null;
}

export const Settings: React.FC<SettingsProps> = ({ project }) => {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  const [slackUrl, setSlackUrl] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [ignorePaths, setIgnorePaths] = useState('node_modules/, dist/, build/, *.min.js');
  const [selectedLinters, setSelectedLinters] = useState({
    eslint: true,
    bandit: true,
    sonar: false,
    securityScan: true
  });
  const [isSaved, setIsSaved] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSupabaseUrl(localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '');
    setSupabaseKey(localStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '');
    setSlackUrl(localStorage.getItem('code_eye_slack_webhook_url') || '');
    setDiscordUrl(localStorage.getItem('code_eye_discord_webhook_url') || '');
    setIgnorePaths(localStorage.getItem('code_eye_ignore_paths') || 'node_modules/, dist/, build/, *.min.js');
    
    const savedLinters = localStorage.getItem('code_eye_selected_linters');
    if (savedLinters) {
      try {
        setSelectedLinters(JSON.parse(savedLinters));
      } catch {
        // Fallback
      }
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, supabaseUrl.trim());
    localStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, supabaseKey.trim());
    localStorage.setItem('code_eye_slack_webhook_url', slackUrl.trim());
    localStorage.setItem('code_eye_discord_webhook_url', discordUrl.trim());
    localStorage.setItem('code_eye_ignore_paths', ignorePaths.trim());
    localStorage.setItem('code_eye_selected_linters', JSON.stringify(selectedLinters));

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
      
      {/* Rules Config Column */}
      <div className="lg:col-span-2 space-y-6">
        <form onSubmit={handleSave} className="glass-panel rounded-2xl p-6 space-y-6 shadow-xl">
          
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Settings2 className="text-indigo-400" size={20} />
            <h2 className="text-base font-bold text-slate-200">
              {project ? `'${project.name}' 프로젝트 설정` : '전역 분석 설정'}
            </h2>
          </div>

          {/* 1. Supabase Connection */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Database size={14} />
              실제 Supabase DB 연동 설정
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-400 block">Supabase URL</label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-400 block">Supabase Anon Key</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-600">
              * 설정 시 Supabase 대시보드에서 `setup.sql`을 실행해 테이블이 준비되어 있어야 실시간 분석 저장이 가능합니다.
            </p>
          </div>

          {/* 2. Google OAuth & Gemini AI Info Card */}
          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-2.5">
            <h3 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Key size={14} className="text-indigo-400" />
              Gemini AI 통합 라이센스 적용
            </h3>
            <p className="text-xs text-indigo-200/80 leading-relaxed">
              구글 OAuth 로그인이 완료됨에 따라, 시스템 전역에 내장된 고성능 **Gemini 2.5** 모델이 자동으로 활성화되었습니다. 
              사용자가 개별적으로 API Key를 생성 및 관리할 필요 없이 소셜 인증 세션만으로도 코드 정밀 스캔 기능을 완전 무상으로 사용하실 수 있습니다.
            </p>
            <div className="flex items-center gap-2 text-[10px] text-indigo-400/80 font-semibold font-mono">
              <Info size={12} />
              Google Provider License: Active
            </div>
          </div>

          {/* 3. Ignore paths */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-semibold text-slate-400 block flex items-center gap-1.5">
              <Sliders size={14} />
              분석 예외 경로 (Ignore Paths)
            </label>
            <input
              type="text"
              value={ignorePaths}
              onChange={e => setIgnorePaths(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* 4. Linter rules checklist */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-400 block flex items-center gap-1.5">
              <Shield size={14} />
              활성화 분석 파이프라인 (Linter Engines)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-3 p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl cursor-pointer hover:border-slate-700/80 transition-all">
                <input
                  type="checkbox"
                  checked={selectedLinters.eslint}
                  onChange={e => setSelectedLinters(prev => ({ ...prev, eslint: e.target.checked }))}
                  className="rounded text-indigo-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 border-slate-800 w-4 h-4"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-300">ESLint (JS/TS)</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">코드 스타일 및 안티패턴 탐지</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl cursor-pointer hover:border-slate-700/80 transition-all">
                <input
                  type="checkbox"
                  checked={selectedLinters.bandit}
                  onChange={e => setSelectedLinters(prev => ({ ...prev, bandit: e.target.checked }))}
                  className="rounded text-indigo-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 border-slate-800 w-4 h-4"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-300">Bandit / Flake8 (Python)</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">파이썬 취약점 정적 진단</div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex justify-end">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/15"
            >
              {isSaved ? (
                <>
                  <Check size={14} />
                  저장 성공 & 새로고침 중...
                </>
              ) : (
                <>
                  <Save size={14} />
                  설정 저장하기
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Webhook Settings Column */}
      <div className="lg:col-span-1">
        <div className="glass-panel rounded-2xl p-6 space-y-5 h-full shadow-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Bell className="text-cyan-400" size={20} />
            <h2 className="text-base font-bold text-slate-200">외부 알림 웹훅 연동</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 block">
                Slack Incoming Webhook URL
              </label>
              <input
                type="text"
                value={slackUrl}
                onChange={e => setSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 block">
                Discord Webhook URL
              </label>
              <input
                type="text"
                value={discordUrl}
                onChange={e => setDiscordUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl">
              <div className="text-[10px] text-slate-400 font-semibold mb-1">알림 조건</div>
              <p className="text-[9px] text-slate-500 leading-relaxed">
                중요도가 **Critical** 또는 **High** 레벨에 해당하는 취약점이나 버그가 정적 분석 파이프라인에서 발견되면 지정된 채널로 즉시 상세 리포트 알림이 전송됩니다.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
