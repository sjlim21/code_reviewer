import React, { useState, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../supabase';
import { Save, Settings2, Sliders, Shield, Bell, Check, Key, Database, Info } from 'lucide-react';

import { useAppContext } from '../context/AppContext';

interface RuleConfig {
  id: string;
  title: string;
  description: string;
  category: string;
  enabled: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

const DEFAULT_RULE_DEFINITIONS = [
  {
    id: 'security/plaintext-credential-storage',
    title: '민감 정보 평문 저장 (Plaintext LocalStorage)',
    description: 'Supabase URL, Anon Key, API 키 등의 민감 정보를 로컬 스토리지에 암호화 없이 저장하는지 진단합니다.',
    category: 'security',
    defaultSeverity: 'critical' as const
  },
  {
    id: 'security/unsafe-shell-start',
    title: '불안전한 쉘 명령어 실행 (Unsafe Shell Command)',
    description: 'cmd.exe 또는 쉘을 통해 외부 프로세스나 URL을 직접 실행하여 쉘 주입 위험이 있는지 진단합니다.',
    category: 'security',
    defaultSeverity: 'high' as const
  },
  {
    id: 'security/command-injection-shell-true',
    title: 'Python Subprocess Command Injection (shell=True)',
    description: 'Python subprocess 실행 시 shell=True 옵션을 사용해 주입 취약점이 발생하는지 진단합니다.',
    category: 'security',
    defaultSeverity: 'critical' as const
  },
  {
    id: 'bug/manual-jwt-parsing',
    title: '수동 JWT 파싱 및 만료 검사 (Manual JWT Parsing)',
    description: '클라이언트 사이드에서 JWT 토큰을 수동으로 파싱 및 만료 체크하는 fragile 패턴을 탐지합니다.',
    category: 'bug',
    defaultSeverity: 'medium' as const
  },
  {
    id: 'performance/memory-intensive-upload',
    title: '메모리 과다 점유 업로드 (FileReader API)',
    description: '파일의 크기 체크 없이 FileReader API로 한꺼번에 읽어들여 OOM을 유발할 수 있는 코드를 진단합니다.',
    category: 'performance',
    defaultSeverity: 'medium' as const
  },
  {
    id: 'security/memory-pointer-leak',
    title: 'C/C++ 메모리 누수 취약점 (malloc/free)',
    description: 'C/C++ 코드에서 malloc 할당 후 free 호출이 누락되어 메모리 누수가 발생할 수 있는 부분을 진단합니다.',
    category: 'security',
    defaultSeverity: 'critical' as const
  },
  {
    id: 'security/unsafe-string-function',
    title: 'C/C++ 버퍼 오버플로우 유발 함수 (strcpy/gets)',
    description: '바운드 경계 체크가 없어 버퍼 오버플로우를 유발하기 쉬운 strcpy, gets, sprintf 등의 사용을 진단합니다.',
    category: 'security',
    defaultSeverity: 'high' as const
  }
];

export const Settings: React.FC = () => {
  const {
    selectedProject: project,
    isUsingRealDB,
    session,
    isDemoSession,
    eventLogs,
    clearEventLogs,
    addEventLog,
    aiProvider,
    setAiProvider
  } = useAppContext();

  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  const [slackUrl, setSlackUrl] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [ignorePaths, setIgnorePaths] = useState('node_modules/, dist/, build/, *.min.js');
  
  const isEnvSupabaseUrlActive = !!import.meta.env.VITE_SUPABASE_URL;
  const isEnvSupabaseKeyActive = !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  const [selectedLinters, setSelectedLinters] = useState({
    eslint: true,
    bandit: true,
    cppcheck: true,
    sonar: false,
    securityScan: true
  });
  
  const [rulesConfig, setRulesConfig] = useState<RuleConfig[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const obfuscate = (str: string) => {
    if (!str) return '';
    return btoa(encodeURIComponent(str));
  };

  const deobfuscate = (str: string) => {
    if (!str) return '';
    try {
      return decodeURIComponent(atob(str));
    } catch {
      return str;
    }
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [eventLogs]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSupabaseUrl(
      isEnvSupabaseUrlActive 
        ? import.meta.env.VITE_SUPABASE_URL 
        : deobfuscate(sessionStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '')
    );
    setSupabaseKey(
      isEnvSupabaseKeyActive 
        ? import.meta.env.VITE_SUPABASE_ANON_KEY 
        : deobfuscate(sessionStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '')
    );
    setSlackUrl(deobfuscate(sessionStorage.getItem('code_eye_slack_webhook_url') || ''));
    setDiscordUrl(deobfuscate(sessionStorage.getItem('code_eye_discord_webhook_url') || ''));
    setIgnorePaths(localStorage.getItem('code_eye_ignore_paths') || 'node_modules/, dist/, build/, *.min.js');
    
    const savedLinters = localStorage.getItem('code_eye_selected_linters');
    if (savedLinters) {
      try {
        setSelectedLinters(JSON.parse(savedLinters));
      } catch {
        // Fallback
      }
    }

    const savedRules = localStorage.getItem('code_eye_rules_config');
    let parsedRules: RuleConfig[] = [];
    if (savedRules) {
      try {
        parsedRules = JSON.parse(savedRules);
      } catch {
        // Fallback
      }
    }
    const initialRules = DEFAULT_RULE_DEFINITIONS.map(def => {
      const saved = parsedRules.find(r => r.id === def.id);
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        category: def.category,
        enabled: saved ? saved.enabled : true,
        severity: saved ? saved.severity : def.defaultSeverity
      };
    });
    setRulesConfig(initialRules);
  }, [isEnvSupabaseUrlActive, isEnvSupabaseKeyActive]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isEnvSupabaseUrlActive) {
      sessionStorage.setItem(STORAGE_KEYS.SUPABASE_URL, obfuscate(supabaseUrl.trim()));
    }
    if (!isEnvSupabaseKeyActive) {
      sessionStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, obfuscate(supabaseKey.trim()));
    }
    sessionStorage.setItem('code_eye_slack_webhook_url', obfuscate(slackUrl.trim()));
    sessionStorage.setItem('code_eye_discord_webhook_url', obfuscate(discordUrl.trim()));
    localStorage.setItem('code_eye_ignore_paths', ignorePaths.trim());
    localStorage.setItem('code_eye_selected_linters', JSON.stringify(selectedLinters));
    localStorage.setItem('code_eye_rules_config', JSON.stringify(rulesConfig));

    addEventLog('보안 정적 분석 설정이 로컬 스토리지에 동기화되었습니다.', 'success');

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
                <label className="text-[11px] font-semibold text-slate-400 block flex items-center justify-between">
                  <span>Supabase URL</span>
                  {isEnvSupabaseUrlActive && <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 font-sans">환경 변수(Read-only)</span>}
                </label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  disabled={isEnvSupabaseUrlActive}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono ${isEnvSupabaseUrlActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-400 block flex items-center justify-between">
                  <span>Supabase Anon Key</span>
                  {isEnvSupabaseKeyActive && <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 font-sans">환경 변수(Read-only)</span>}
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  disabled={isEnvSupabaseKeyActive}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono ${isEnvSupabaseKeyActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-600">
              * 설정 시 Supabase 대시보드에서 `setup.sql`을 실행해 테이블이 준비되어 있어야 실시간 분석 저장이 가능합니다.
            </p>
          </div>

          {/* AI 제공자 선택 */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Shield size={14} />
              AI 분석 엔진 선택
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(['gemini', 'claude'] as const).map(provider => {
                const isActive = aiProvider === provider;
                const label = provider === 'gemini' ? 'Google Gemini' : 'Anthropic Claude';
                const sub = provider === 'gemini'
                  ? 'gemini-2.5-flash · 고속 · 1M 컨텍스트'
                  : 'claude-sonnet-4-6 · 고품질 · 200k 컨텍스트';
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setAiProvider(provider)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                        : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-bold mb-0.5">{label}</div>
                    <div className="text-[10px] opacity-70">{sub}</div>
                    {isActive && <div className="text-[10px] text-indigo-400 mt-1">✓ 활성</div>}
                  </button>
                );
              })}
            </div>
            {aiProvider === 'claude' && (
              <p className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
                ✓ API 키는 Supabase Edge Function(<strong>claude-proxy</strong>)이 서버에서 관리합니다. 브라우저에 노출되지 않습니다.
              </p>
            )}
          </div>

          {/* 2. Authentication & Static Analysis Engine Info Card */}
          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-2.5">
            <h3 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Key size={14} className="text-indigo-400" />
              진단 엔진 및 연동 환경 정보
            </h3>
            
            <div className="space-y-1 text-xs leading-relaxed">
              {isUsingRealDB ? (
                <p className="text-emerald-300 font-semibold flex items-center gap-1">
                  <Check size={12} className="text-emerald-400" />
                  클라우드 모드 활성화됨 (Supabase DB 연동)
                </p>
              ) : (
                <p className="text-amber-400 font-semibold flex items-center gap-1">
                  <Info size={12} className="text-amber-400" />
                  오프라인 데모 모드 (로컬 시뮬레이션)
                </p>
              )}
              
              {session ? (
                <p className="text-slate-300">
                  인증 상태: **GitHub 계정 로그인 완료** (사용자 ID: <code className="text-slate-400 text-[10px]">{session.user?.id}</code>)
                </p>
              ) : isDemoSession ? (
                <p className="text-slate-300">
                  인증 상태: **데모 사용자 세션** (이름: <code className="text-slate-400 text-[10px]">demo-user</code>)
                </p>
              ) : (
                <p className="text-slate-300">
                  인증 상태: **미인증 상태**
                </p>
              )}
            </div>

            <div className="border-t border-slate-800/80 my-2 pt-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Local Static AST Analyzer</span>
                <span className="text-emerald-400 font-bold uppercase">Active (C/C++, JS/TS, Python)</span>
              </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
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

              <label className="flex items-center gap-3 p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl cursor-pointer hover:border-slate-700/80 transition-all">
                <input
                  type="checkbox"
                  checked={selectedLinters.cppcheck}
                  onChange={e => setSelectedLinters(prev => ({ ...prev, cppcheck: e.target.checked }))}
                  className="rounded text-indigo-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 border-slate-800 w-4 h-4"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-300">C/C++ Pointer Safety</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">메모리 누수 및 버퍼 오버플로우 진단</div>
                </div>
              </label>
            </div>
          </div>

          {/* 5. Custom Static Rules Configurator */}
          <div className="space-y-4 pt-4 border-t border-slate-800/80">
            <label className="text-xs font-semibold text-slate-400 block flex items-center gap-1.5">
              <Shield size={14} className="text-indigo-400" />
              상세 정적 보안 진단 규칙셋 관리 (Custom Linter Rules)
            </label>
            
            <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
              {rulesConfig.map((rule, idx) => (
                <div 
                  key={rule.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-xl hover:border-slate-700/80 transition-all"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <input
                      type="checkbox"
                      id={`rule-check-${idx}`}
                      checked={rule.enabled}
                      onChange={e => {
                        const next = [...rulesConfig];
                        next[idx].enabled = e.target.checked;
                        setRulesConfig(next);
                      }}
                      className="mt-0.5 rounded text-indigo-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 border-slate-800 w-4 h-4"
                    />
                    <div className="space-y-1">
                      <label htmlFor={`rule-check-${idx}`} className="text-xs font-semibold text-slate-200 cursor-pointer block hover:text-white transition-colors">
                        {rule.title}
                      </label>
                      <p className="text-[10px] text-slate-500 leading-relaxed max-w-xl">
                        {rule.description}
                      </p>
                      <span className="inline-block text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400 capitalize">
                        {rule.category}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <span className="text-[10px] text-slate-400 font-medium font-sans">심각도:</span>
                    <select
                      value={rule.severity}
                      onChange={e => {
                        const next = [...rulesConfig];
                        next[idx].severity = e.target.value as RuleConfig['severity'];
                        setRulesConfig(next);
                      }}
                      disabled={!rule.enabled}
                      className="bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                </div>
              ))}
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

      {/* Webhook Settings & Terminal Console Column */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        <div className="glass-panel rounded-2xl p-6 space-y-5 shadow-xl flex-1 flex flex-col justify-between">
          <div className="space-y-5">
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

          {/* Terminal Console */}
          <div className="border-t border-slate-800/80 pt-5 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                시스템 이벤트 로그
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const text = eventLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
                    navigator.clipboard.writeText(text);
                    addEventLog('이벤트 로그 복사 완료.', 'success');
                  }}
                  className="text-[10px] text-slate-450 hover:text-white transition-colors cursor-pointer bg-slate-950 border border-slate-850/60 rounded px-2 py-0.5 font-semibold"
                >
                  로그 복사
                </button>
                <button
                  type="button"
                  onClick={clearEventLogs}
                  className="text-[10px] text-slate-450 hover:text-white transition-colors cursor-pointer bg-slate-950 border border-slate-850/60 rounded px-2 py-0.5 font-semibold"
                >
                  지우기
                </button>
              </div>
            </div>

            <div className="bg-black/90 border border-slate-900 rounded-xl p-3 font-mono text-[10px] h-[340px] overflow-y-auto space-y-1.5 shadow-inner">
              {eventLogs.length > 0 ? (
                eventLogs.slice().reverse().map((log, idx) => (
                  <div key={log.id} className="leading-relaxed flex items-start gap-1">
                    <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                    <span className={`font-bold shrink-0 select-none ${
                      log.type === 'success' ? 'text-emerald-500' :
                      log.type === 'warning' ? 'text-amber-500' :
                      log.type === 'error' ? 'text-rose-500' :
                      'text-indigo-400'
                    }`}>
                      [{log.type.toUpperCase()}]
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                    {idx === eventLogs.length - 1 && <div ref={consoleEndRef} />}
                  </div>
                ))
              ) : (
                <div className="text-slate-700 h-full flex items-center justify-center italic">
                  이벤트 로그가 비어 있습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
