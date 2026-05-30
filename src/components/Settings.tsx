import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS, type Project } from '../supabase';
import { Save, Settings2, Sliders, Shield, Bell, Check, Key, Database } from 'lucide-react';

interface SettingsProps {
  project: Project | null;
}

export const Settings: React.FC<SettingsProps> = ({ project }) => {
  // Supabase & Gemini 키 상태 관리
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

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

  // 초기 마운트 시 LocalStorage에서 설정 로드
  useEffect(() => {
    setSupabaseUrl(localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '');
    setSupabaseKey(localStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '');
    setGeminiKey(localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '');
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 로컬 스토리지 저장
    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, supabaseUrl.trim());
    localStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, supabaseKey.trim());
    localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, geminiKey.trim());

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      // 저장 후 변경 사항 즉각 갱신을 위해 윈도우 리로드 제안 또는 알림
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

          {/* 1. Supabase 연동 설정 */}
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

          {/* 2. Gemini API 연동 설정 */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Key size={14} />
              Google Gemini API 연동 설정
            </h3>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 block">Gemini API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <p className="text-[10px] text-slate-600">
              * 코드 분석 시 Gemini 2.5 API 모델이 직접 코드 감항 진단을 시작합니다.
            </p>
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
