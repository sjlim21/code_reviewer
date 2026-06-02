#!/usr/bin/env node

/**
 * CODE EYE - AI & Linter Hybrid CLI Agent
 * Node.js 내장 모듈 및 fetch API를 이용한 자율 경량형 CLI 에이전트 (Pure JS ESM)
 */

import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import readline from 'readline';

// ESM 환경의 __filename, __dirname 획득
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(os.homedir(), '.code-eye-config.json');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// 지원하는 코드 확장자 규칙
const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.h', '.cs', '.java', '.py', '.go', '.js', '.jsx', '.ts', '.tsx'];

// ----------------------------------------------------
// 1. 설정/자격증명 추출 및 로드 로직
// ----------------------------------------------------
const loadEnv = () => {
  const envVars = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim();
      if (key) {
        envVars[key.trim()] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
  return envVars;
};

// 1순위: OS 환경변수, 2순위: .env, 3순위: 로컬 세션 파일
const env = loadEnv();
let SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
let SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';

const loadSessionConfig = () => {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) || {};
    } catch (e) {
      return {};
    }
  }
  return {};
};

// 로드된 설정과 세션 동기화
const sessionConfig = loadSessionConfig();
if (!SUPABASE_URL) SUPABASE_URL = sessionConfig.supabase_url || '';
if (!SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = sessionConfig.supabase_anon_key || '';

// ----------------------------------------------------
// 2. 터미널 인터랙티브 입력 보조 유틸리티 (readline)
// ----------------------------------------------------
const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
};

const ensureSupabaseCredentials = async () => {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return true;

  console.log('\n\x1b[33m[Notice] 로컬 .env 에 Supabase 접속 정보(VITE_SUPABASE_URL)가 감지되지 않았습니다.\x1b[0m');
  console.log('CLI 분석 결과를 올릴 Supabase 정보를 한 번만 입력해 주세요. (정보는 ~/.code-eye-config.json 에 자동 캐싱됩니다.)\n');

  if (!SUPABASE_URL) {
    SUPABASE_URL = await askQuestion('🔗 Supabase Project URL 입력 (예: https://xxxx.supabase.co): ');
  }
  if (!SUPABASE_ANON_KEY) {
    SUPABASE_ANON_KEY = await askQuestion('🔑 Supabase Anon API Key 입력: ');
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('\x1b[31m[Error] Supabase 주소 혹은 API Key 입력이 비어있어 작업을 계속할 수 없습니다.\x1b[0m');
    process.exit(1);
  }

  // 캐싱을 위한 저장
  const currentConfig = loadSessionConfig();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    ...currentConfig,
    supabase_url: SUPABASE_URL,
    supabase_anon_key: SUPABASE_ANON_KEY
  }, null, 2), { encoding: 'utf-8', mode: 0o600 });

  console.log('\x1b[32m- Supabase 설정이 로컬 세션 파일에 임시 캐싱되었습니다.\x1b[0m\n');
  return true;
};

const ensureGcpCredentials = async (customGcpProjectId) => {
  const currentConfig = loadSessionConfig();
  let gcpProjectId = customGcpProjectId || process.env.VITE_GCP_PROJECT_ID || env.VITE_GCP_PROJECT_ID || currentConfig.gcp_project_id || '';

  if (customGcpProjectId && customGcpProjectId !== currentConfig.gcp_project_id) {
    const updatedConfig = {
      ...currentConfig,
      gcp_project_id: customGcpProjectId
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2), { encoding: 'utf-8', mode: 0o600 });
    gcpProjectId = customGcpProjectId;
  }

  if (process.env.CODE_EYE_DEBUG) {
    console.log(`[Debug] gcpProjectId: ${gcpProjectId ? 'found' : 'not found'}`);
  }

  if (gcpProjectId) return gcpProjectId;

  console.log('\n\x1b[33m[Notice] Google Cloud Project ID 정보가 필요합니다.\x1b[0m');
  console.log('Google Cloud Console에서 생성한 프로젝트 ID(예: test-425102)를 입력해 주세요. (정보는 ~/.code-eye-config.json 에 자동 캐싱됩니다.)\n');

  gcpProjectId = await askQuestion('🔗 Google Cloud Project ID 입력: ');

  if (!gcpProjectId) {
    console.error('\x1b[31m[Error] Google Cloud Project ID 입력이 비어있어 작업을 계속할 수 없습니다.\x1b[0m');
    process.exit(1);
  }

  // 캐싱을 위한 저장
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    ...currentConfig,
    gcp_project_id: gcpProjectId
  }, null, 2), { encoding: 'utf-8', mode: 0o600 });

  console.log('\x1b[32m- Google Cloud Project ID가 로컬 세션 파일에 임시 캐싱되었습니다.\x1b[0m\n');
  return gcpProjectId;
};

// ----------------------------------------------------
// 3. Python 환경 감지 및 가상환경 (.venv) 자율 셋업
// ----------------------------------------------------
const getPythonCommand = () => {
  try {
    execSync('python --version', { stdio: 'ignore' });
    return 'python';
  } catch (e) {
    try {
      execSync('python3 --version', { stdio: 'ignore' });
      return 'python3';
    } catch (err) {
      return null;
    }
  }
};

const setupVirtualEnv = (targetDir) => {
  const pythonCmd = getPythonCommand();
  if (!pythonCmd) {
    console.warn('\x1b[33m[Warning] 시스템에 Python이 감지되지 않았습니다. Linter(radon, bandit) 생략 후 Gemini AI 단독 모드로 스캔합니다.\x1b[0m');
    console.warn('\x1b[36m- Windows: Microsoft Store에서 Python을 설치해 주세요.\x1b[0m');
    console.warn('\x1b[36m- macOS: brew install python 명령어로 설치해 주세요.\x1b[0m\n');
    return null;
  }

  const venvDir = path.join(targetDir, '.venv');
  const isWindows = os.platform() === 'win32';
  const pipPath = isWindows ? path.join(venvDir, 'Scripts', 'pip.exe') : path.join(venvDir, 'bin', 'pip');
  const radonPath = isWindows ? path.join(venvDir, 'Scripts', 'radon.exe') : path.join(venvDir, 'bin', 'radon');
  const banditPath = isWindows ? path.join(venvDir, 'Scripts', 'bandit.exe') : path.join(venvDir, 'bin', 'bandit');

  if (!fs.existsSync(venvDir)) {
    console.log(`\x1b[34m[Venv] 로컬 가상환경(.venv)이 존재하지 않아 생성 중... (${pythonCmd} -m venv .venv)\x1b[0m`);
    try {
      execFileSync(pythonCmd, ['-m', 'venv', venvDir], { stdio: 'inherit', cwd: targetDir });
    } catch (e) {
      console.error('\x1b[31m[Venv Error] 가상환경 생성 실패:\x1b[0m', e);
      return null;
    }
  }

  if (!fs.existsSync(radonPath) || !fs.existsSync(banditPath)) {
    console.log('\x1b[34m[Venv] 가상환경 내 radon 및 bandit 설치 중... (pip install radon bandit)\x1b[0m');
    try {
      execFileSync(pipPath, ['install', 'radon', 'bandit'], { stdio: 'inherit', cwd: targetDir });
    } catch (e) {
      console.error('\x1b[31m[Venv Error] pip install 패키지 설치 실패:\x1b[0m', e);
      return null;
    }
  }

  return { radonPath, banditPath };
};

// ----------------------------------------------------
// 4. 로컬 OAuth 로그인 핸들러 (http Server)
// ----------------------------------------------------
const handleLogin = async () => {
  await ensureSupabaseCredentials();

  // Validate SUPABASE_URL format to prevent Command Injection
  try {
    new URL(SUPABASE_URL);
  } catch (err) {
    console.error('\x1b[31m[Error] 올바르지 않은 Supabase URL 형식입니다.\x1b[0m');
    process.exit(1);
  }

  const port = 54321;
  let timeoutId;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '', `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/callback') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>CODE EYE 로그인 완료</title></head>
        <body style="font-family: sans-serif; background-color: #0b0f19; color: #f8f9fa; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin:0;">
          <h1 style="color: #6366f1;">CODE EYE</h1>
          <p>OAuth 토큰 정보를 로컬 CLI 세션으로 이전하는 중...</p>
          <script>
            const hash = window.location.hash;
            if (hash) {
              const params = new URLSearchParams(hash.replace('#', '?'));
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');
              const providerToken = params.get('provider_token');
              if (accessToken) {
                fetch('/save-token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ access_token: accessToken, provider_token: providerToken || '', refresh_token: refreshToken || '' })
                })
                  .then(() => {
                    document.body.innerHTML = '<h1 style="color: #10b981;">인증 완벽 성공!</h1><p>이 웹 페이지 창을 닫고 터미널 창으로 돌아가 주셔도 안전합니다.</p>';
                  })
                  .catch(err => {
                    document.body.innerHTML = '<h1 style="color: #ef4444;">토큰 전송 오류</h1><p>' + err.message + '</p>';
                  });
              }
            } else {
              document.body.innerHTML = '<h1 style="color: #ef4444;">인증 파라미터 누락</h1><p>해시 정보가 없습니다.</p>';
            }
          </script>
        </body>
        </html>
      `);
    } else if (pathname === '/save-token') {
      let rawBody = '';
      for await (const chunk of req) { rawBody += chunk; }
      let parsedBody = {};
      try { parsedBody = JSON.parse(rawBody); } catch { /* use empty object */ }
      const accessToken = parsedBody.access_token || '';
      const providerToken = parsedBody.provider_token || '';
      const refreshToken = parsedBody.refresh_token || '';

      if (accessToken) {
        if (timeoutId) clearTimeout(timeoutId);

        const currentConfig = loadSessionConfig();
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({
          ...currentConfig,
          supabase_access_token: accessToken,
          supabase_refresh_token: refreshToken,
          google_provider_token: providerToken,
          saved_at: new Date().toISOString()
        }, null, 2), { encoding: 'utf-8', mode: 0o600 });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));

        console.log('\n\x1b[32m[Success] 깃허브 OAuth 토큰 세션이 ~/.code-eye-config.json 에 정상 기록되었습니다!\x1b[0m');
        server.close(() => {
          process.exit(0);
        });
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing access_token' }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Timeout to prevent zombie processes (5 minutes)
  timeoutId = setTimeout(() => {
    console.log('\n\x1b[33m[Timeout] 5분 동안 로그인이 완료되지 않아 로그인 대기 서버를 종료합니다.\x1b[0m');
    server.close(() => {
      process.exit(1);
    });
  }, 5 * 60 * 1000);

  server.on('error', (err) => {
    if (timeoutId) clearTimeout(timeoutId);
    if (err.code === 'EADDRINUSE') {
      console.error(`\n\x1b[31m[Error] 포트 ${port}이 이미 사용 중입니다. 기존에 실행된 'code-eye.js login' 프로세스가 존재하거나 해당 포트를 다른 프로그램이 사용하고 있을 수 있습니다.\x1b[0m`);
      console.error(`- 기존 프로세스를 종료하려면 다음 명령을 실행하세요:`);
      console.error(`  Windows: taskkill /F /IM node.exe (또는 특정 PID 종료)`);
      console.error(`  Mac/Linux: kill -9 $(lsof -t -i:${port})`);
    } else {
      console.error(`\n\x1b[31m[Error] 서버 오류: ${err.message}\x1b[0m`);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    // github provider 지정하여 Supabase 인증 획득
    const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&scopes=read:user&redirect_to=http://localhost:${port}/callback`;
    console.log(`\n\x1b[34m[Auth] GitHub OAuth 로그인창을 여는 중...\x1b[0m`);
    console.log(`- 아래 주소를 브라우저에 복사해 직접 접속하셔도 됩니다:\n  ${oauthUrl}\n`);
    
    try {
      if (os.platform() === 'win32') {
        // Use rundll32.exe url.dll,FileProtocolHandler to safely open URLs in default browser directly
        // without spawning cmd.exe shell, making it completely immune to command injections.
        execFileSync('rundll32.exe', ['url.dll,FileProtocolHandler', oauthUrl]);
      } else {
        const startCmd = os.platform() === 'darwin' ? 'open' : 'xdg-open';
        execFileSync(startCmd, [oauthUrl]);
      }
    } catch (e) {
      // 브라우저 팝업 실패 시 수동 접속용 로그 유지
    }
  });
};

const refreshSessionIfNeeded = async () => {
  if (!fs.existsSync(CONFIG_PATH)) return false;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) || {};
  } catch (e) {
    return false;
  }

  const supabaseToken = config.supabase_access_token;
  const refreshToken = config.supabase_refresh_token;

  if (!supabaseToken) return false;

  // Verify JWT dynamically by contacting the Supabase server's user profile verification endpoint.
  // This prevents clock-skew errors and guarantees validation against server-side token revocation.
  let isExpired = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${supabaseToken}`
      }
    });
    if (!res.ok) {
      isExpired = true;
    }
  } catch (e) {
    isExpired = true;
  }

  if (!isExpired) {
    return true; // Token is still valid
  }

  if (!refreshToken) {
    console.log('\n\x1b[33m[Session] 세션이 만료되었으나 갱신 토큰(Refresh Token)이 없습니다. 다시 로그인해 주세요.\x1b[0m');
    return false;
  }

  console.log('\x1b[34m[Session] 세션 만료가 감지되어 자동으로 토큰을 갱신하는 중...\x1b[0m');

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('\x1b[33m- [Warning] 자동 세션 갱신 실패:\x1b[0m', errText);
      return false;
    }

    const data = await res.json();
    if (data.access_token) {
      const currentConfig = loadSessionConfig();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({
        ...currentConfig,
        supabase_access_token: data.access_token,
        supabase_refresh_token: data.refresh_token || refreshToken,
        google_provider_token: data.provider_token || currentConfig.google_provider_token || '',
        saved_at: new Date().toISOString()
      }, null, 2), { encoding: 'utf-8', mode: 0o600 });

      // Update in-memory values
      SUPABASE_URL = currentConfig.supabase_url || SUPABASE_URL;
      SUPABASE_ANON_KEY = currentConfig.supabase_anon_key || SUPABASE_ANON_KEY;

      console.log('\x1b[32m- 세션이 자동으로 정상 갱신되었습니다.\x1b[0m');
      return true;
    }
  } catch (err) {
    console.error('\x1b[31m[Error] 세션 자동 갱신 중 에러 발생:\x1b[0m', err instanceof Error ? err.message : String(err));
  }

  return false;
};

// ----------------------------------------------------
// 5. Linter 정적 분석 가동 (radon & bandit)
// ----------------------------------------------------
const runLinterAnalysis = (targetPath, bin) => {
  console.log('\x1b[34m[Linter] 1단계: 로컬 파이썬 Linter (radon & bandit) 가동 중...\x1b[0m');
  const radonIssues = [];
  const banditIssues = [];

  try {
    const radonResRaw = execFileSync(bin.radonPath, ['cc', targetPath, '-j', '-x', 'node_modules,.venv,.git,dist'], { encoding: 'utf-8' });
    const radonJson = JSON.parse(radonResRaw);
    
    Object.keys(radonJson).forEach(filePath => {
      const items = radonJson[filePath];
      const relPath = path.relative(targetPath, filePath).replace(/\\/g, '/');
      items.forEach((item) => {
        if (item.complexity > 10) {
          radonIssues.push({
            title: `순환 복잡도 오버헤드 감지 (${item.name})`,
            description: `메서드/클래스 '${item.name}'의 Cyclomatic Complexity가 ${item.complexity}로 매우 높은 수준입니다. 복잡한 다중 분기 및 중첩 조건문을 리팩토링하여 유지보수성을 향상시켜야 합니다.`,
            suggestion: `// Radon 복잡도 리팩토링 제안\n- 하나의 큰 함수인 '${item.name}'을 여러 개의 단일 책임 함수로 분해하세요.\n- 조기 리턴(Guard Clauses)을 활용하여 depth 수준을 낮추세요.`,
            rule_id: `performance/cyclomatic-complexity`,
            severity: item.complexity > 20 ? 'high' : 'medium',
            category: 'performance',
            priority_score: item.complexity > 20 ? 82 : 55,
            file_path: relPath,
            line_start: item.lineno || 1,
            line_end: item.endline || item.lineno || 1,
            code_snippet: `// Complexity Score: ${item.complexity} inside ${item.name}`,
            status: 'open'
          });
        }
      });
    });
  } catch (e) {
    console.warn('\x1b[33m- Radon 순환복잡도 검출을 건너뜁니다 (Python 파일 미존재 혹은 파싱 오류)\x1b[0m');
  }

  try {
    const banditResRaw = execFileSync(bin.banditPath, ['-r', targetPath, '-f', 'json', '-x', 'node_modules,.venv,.git,dist'], { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const banditJson = JSON.parse(banditResRaw);
    
    if (banditJson.results && Array.isArray(banditJson.results)) {
      banditJson.results.forEach((issue) => {
        const relPath = path.relative(targetPath, issue.filename).replace(/\\/g, '/');
        const severityMap = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', UNDEFINED: 'info' };
        
        banditIssues.push({
          title: `Bandit 보안 약점 감지 (${issue.test_id})`,
          description: `${issue.issue_text}\n(취약 신뢰 등급: ${issue.issue_confidence})`,
          suggestion: `// Bandit 취약점 수정 가이드\n- 안전하지 않은 API 사용을 중단하거나 적절한 인코딩 및 시그니처 검증 모듈을 연결하세요.`,
          rule_id: `security/bandit-${issue.test_id.toLowerCase()}`,
          severity: severityMap[issue.issue_severity] || 'medium',
          category: 'security',
          priority_score: issue.issue_severity === 'HIGH' ? 88 : 50,
          file_path: relPath,
          line_start: issue.line_number || 1,
          line_end: (issue.line_range && issue.line_range[issue.line_range.length - 1]) || issue.line_number || 1,
          code_snippet: issue.code || '',
          status: 'open'
        });
      });
    }
  } catch (e) {
    try {
      if (e.stdout) {
        const banditJson = JSON.parse(e.stdout.toString());
        if (banditJson.results && Array.isArray(banditJson.results)) {
          banditJson.results.forEach((issue) => {
            const relPath = path.relative(targetPath, issue.filename).replace(/\\/g, '/');
            const severityMap = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };
            banditIssues.push({
              title: `Bandit 보안 위협 식별: ${issue.test_id}`,
              description: `${issue.issue_text}\n- 감지 룰: ${issue.test_name}\n- 탐지 신뢰도: ${issue.issue_confidence}`,
              suggestion: `// Bandit 안전 방어 보안 샌드박스 가이드라인\n- 임의의 문자열 변환 및 검증되지 않은 입력값에 대한 화이트리스트 정제 필터를 거치도록 수정하세요.`,
              rule_id: `security/bandit-${issue.test_id.toLowerCase()}`,
              severity: severityMap[issue.issue_severity] || 'medium',
              category: 'security',
              priority_score: issue.issue_severity === 'HIGH' ? 89 : 52,
              file_path: relPath,
              line_start: issue.line_number || 1,
              line_end: (issue.line_range && issue.line_range[issue.line_range.length - 1]) || issue.line_number || 1,
              code_snippet: issue.code || '',
              status: 'open'
            });
          });
        }
      }
    } catch (parseErr) {
      console.warn('\x1b[33m- Bandit 취약점 검출을 건너뜁니다 (Python 파일 미존재 혹은 파싱 오류)\x1b[0m');
    }
  }

  return [...radonIssues, ...banditIssues];
};

// ----------------------------------------------------
// 6. 다국어 소스코드 재귀 수집
// ----------------------------------------------------
const collectSourceFiles = (dir, baseDir = dir) => {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  
  const stats = fs.statSync(dir);
  if (stats.isFile()) {
    const ext = path.extname(dir).toLowerCase();
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      results.push({
        name: path.basename(dir),
        content: fs.readFileSync(dir, 'utf-8'),
        relPath: path.relative(baseDir, dir).replace(/\\/g, '/')
      });
    }
    return results;
  }

  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === '.git' || item === '.venv' || item === 'dist') continue;
    const fullPath = path.join(dir, item);
    results.push(...collectSourceFiles(fullPath, baseDir));
  }
  return results;
};

// ----------------------------------------------------
// 7. 에이전트 마크다운 시스템 프롬프트 로드
// ----------------------------------------------------
const getAgentSystemPrompt = () => {
  const agentMdPath = path.join(PROJECT_ROOT, 'src', 'agents', 'code-reviewer-agent.md');
  if (fs.existsSync(agentMdPath)) {
    return fs.readFileSync(agentMdPath, 'utf-8');
  }
  return `You are a static code analyzer. Return issues matched to the requested JSON Schema.`;
};

const loadAgentPrompt = (name) => {
  const p = path.join(PROJECT_ROOT, 'src', 'agents', name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
};

// ----------------------------------------------------
// 7-A. Node.js 호환 Gemini API 호출 함수
// ----------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const callGeminiNode = async (systemPrompt, userPrompt, responseSchema, retries = 3) => {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY 없음');
  const modelName = process.env.VITE_GEMINI_MODEL || env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const body = {
    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    ...(responseSchema ? { generationConfig: { responseMimeType: 'application/json', responseSchema } } : {})
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body)
    });

    if (res.status === 429) {
      const waitMs = Math.min(60000, 15000 * Math.pow(2, attempt));
      console.log(`\x1b[33m  [Rate Limit] ${Math.round(waitMs/1000)}초 대기 후 재시도 (${attempt + 1}/${retries + 1})...\x1b[0m`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      const status = res.status;
      if (status === 401 || status === 403) throw new Error('Gemini API 인증 오류. API 키 확인 필요.');
      throw new Error(`Gemini API Error ${status}: ${errText}`);
    }

    const json = await res.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Gemini 빈 응답');
    return rawText;
  }
  throw new Error('Gemini API rate limit 초과 — 최대 재시도 횟수 도달');
};

const parseJsonSafe = (text, fallbackPattern) => {
  try { return JSON.parse(text); } catch (_) {}
  const match = text.match(fallbackPattern || /\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  return null;
};

// ----------------------------------------------------
// 7-B. 단일 파일 Gemini 4단계 분석 파이프라인 (Node.js)
// ----------------------------------------------------
const analyzeFileWithGemini = async (fileInfo, runId, projectId) => {
  const { name: fileName, content: codeContent, relPath } = fileInfo;
  if (!codeContent || codeContent.trim().length === 0) return [];
  if (codeContent.length > 512 * 1024) {
    console.log(`\x1b[33m  - [Skip] ${relPath}: 파일 크기 초과 (>512KB)\x1b[0m`);
    return [];
  }

  const parserPrompt = loadAgentPrompt('parser_agent.md');
  const specialistCppPrompt = loadAgentPrompt('specialist_cpp.md');
  const specialistPyGoPrompt = loadAgentPrompt('specialist_python_go.md');
  const specialistJsTsPrompt = loadAgentPrompt('specialist_jsts.md');
  const specialistJvmPrompt = loadAgentPrompt('specialist_jvm_clr.md');
  const generalPrompt = loadAgentPrompt('code-reviewer-agent.md');
  const verifierPrompt = loadAgentPrompt('verifier_agent.md');
  const scorerPrompt = loadAgentPrompt('scorer_agent.md');
  const reporterPrompt = loadAgentPrompt('reporter_agent.md');

  // [1] Parser Agent
  console.log(`\x1b[34m  [1/4 Parser] ${relPath}\x1b[0m`);
  const parserSchema = {
    type: "OBJECT",
    properties: {
      file_name: { type: "STRING" },
      language: { type: "STRING" },
      complexity_hint: { type: "STRING", enum: ["low", "medium", "high"] },
      dependencies: { type: "ARRAY", items: { type: "STRING" } },
      chunks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            chunk_id: { type: "STRING" },
            line_start: { type: "INTEGER" },
            line_end: { type: "INTEGER" },
            context_summary: { type: "STRING" },
            content: { type: "STRING" }
          },
          required: ["chunk_id", "line_start", "line_end", "context_summary", "content"]
        }
      }
    },
    required: ["file_name", "language", "complexity_hint", "dependencies", "chunks"]
  };

  const parserText = await callGeminiNode(parserPrompt, `File Name: ${fileName}\nContent:\n\`\`\`\n${codeContent}\n\`\`\``, parserSchema);
  const parsedResult = parseJsonSafe(parserText);
  if (!parsedResult || !Array.isArray(parsedResult.chunks)) {
    console.log(`\x1b[33m  - [Parser] ${relPath}: 파싱 실패, 건너뜀\x1b[0m`);
    return [];
  }

  const chunks = parsedResult.chunks;
  const detectedLanguage = (parsedResult.language || '').toLowerCase().trim();

  // [2] Language Router
  let specialistPrompt = generalPrompt;
  let routingLabel = 'general';
  const ext = path.extname(fileName).toLowerCase();
  if (detectedLanguage === 'cpp' || detectedLanguage === 'c' || ['.cpp', '.c', '.h'].includes(ext)) {
    specialistPrompt = specialistCppPrompt; routingLabel = 'cpp';
  } else if (['typescript', 'javascript', 'tsx', 'jsx'].includes(detectedLanguage) || ['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    specialistPrompt = specialistJsTsPrompt; routingLabel = 'js/ts';
  } else if (['python', 'go'].includes(detectedLanguage) || ['.py', '.go'].includes(ext)) {
    specialistPrompt = specialistPyGoPrompt; routingLabel = 'python/go';
  } else if (['java', 'csharp', 'cs', 'kotlin'].includes(detectedLanguage) || ['.java', '.cs', '.kt'].includes(ext)) {
    specialistPrompt = specialistJvmPrompt; routingLabel = 'jvm/clr';
  }
  console.log(`\x1b[34m  [2/4 Specialist:${routingLabel}] ${relPath} (${chunks.length} chunks)\x1b[0m`);

  // [3] Specialist Analyst (병렬)
  const specialistSchema = {
    type: "OBJECT",
    properties: {
      chunk_id: { type: "STRING" },
      raw_issues: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            analyst_issue_id: { type: "STRING" },
            title: { type: "STRING" },
            description: { type: "STRING" },
            severity_suggestion: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
            category: { type: "STRING", enum: ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "dependency", "test_coverage", "other"] },
            file_path: { type: "STRING" },
            line_start: { type: "INTEGER" },
            line_end: { type: "INTEGER" },
            code_snippet: { type: "STRING" },
            as_is: { type: "STRING" },
            to_be: { type: "STRING" },
            confidence_raw: { type: "NUMBER" }
          },
          required: ["analyst_issue_id", "title", "description", "severity_suggestion", "category", "file_path", "line_start", "line_end", "code_snippet", "as_is", "to_be", "confidence_raw"]
        }
      }
    },
    required: ["chunk_id", "raw_issues"]
  };

  const specialistResults = await Promise.all(chunks.map(async (chunk) => {
    try {
      const prompt = JSON.stringify({
        chunk_id: chunk.chunk_id, language: parsedResult.language, file_name: fileName,
        line_start: chunk.line_start, line_end: chunk.line_end,
        context_summary: chunk.context_summary, dependencies: parsedResult.dependencies, content: chunk.content
      });
      const text = await callGeminiNode(specialistPrompt, prompt, specialistSchema);
      return parseJsonSafe(text) || { chunk_id: chunk.chunk_id, raw_issues: [] };
    } catch (err) {
      console.error(`\x1b[31m  - [Specialist Error] chunk ${chunk.chunk_id}: ${err.message}\x1b[0m`);
      return { chunk_id: chunk.chunk_id, raw_issues: [] };
    }
  }));

  const rawIssues = specialistResults.flatMap(r => r.raw_issues || []);
  if (rawIssues.length === 0) {
    console.log(`\x1b[32m  - [Specialist] ${relPath}: 이슈 없음\x1b[0m`);
    return [];
  }
  console.log(`\x1b[33m  - [Specialist] ${rawIssues.length}개 원시 이슈 감지\x1b[0m`);

  // RAG 단계 생략 (CLI에서 Supabase RPC 직접 호출 복잡) - rag_references는 빈 배열
  const issuesWithRag = rawIssues.map(i => ({ ...i, rag_references: [] }));

  // [3] Verifier Agent
  console.log(`\x1b[34m  [3/4 Verifier] ${relPath}\x1b[0m`);
  const verifierSchema = {
    type: "OBJECT",
    properties: {
      verified_issues: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            analyst_issue_id: { type: "STRING" },
            is_false_positive: { type: "BOOLEAN" },
            severity_original: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
            severity_verified: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
            severity_changed: { type: "BOOLEAN" },
            severity_change_reason: { type: "STRING", nullable: true },
            duplicate_of: { type: "STRING", nullable: true },
            affected_lines: { type: "ARRAY", items: { type: "INTEGER" } },
            confidence_verified: { type: "NUMBER" },
            human_review_required: { type: "BOOLEAN" },
            rag_references: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, id: { type: "STRING" }, title: { type: "STRING" } }, required: ["source", "id", "title"] } },
            verifier_note: { type: "STRING" }
          },
          required: ["analyst_issue_id", "is_false_positive", "severity_original", "severity_verified", "severity_changed", "severity_change_reason", "duplicate_of", "affected_lines", "confidence_verified", "human_review_required", "rag_references", "verifier_note"]
        }
      },
      summary: {
        type: "OBJECT",
        properties: { total_raw: { type: "INTEGER" }, false_positives_removed: { type: "INTEGER" }, severity_downgraded: { type: "INTEGER" }, duplicates_merged: { type: "INTEGER" }, human_review_required: { type: "INTEGER" }, passed: { type: "INTEGER" } },
        required: ["total_raw", "false_positives_removed", "severity_downgraded", "duplicates_merged", "human_review_required", "passed"]
      }
    },
    required: ["verified_issues", "summary"]
  };

  const verifierText = await callGeminiNode(verifierPrompt, JSON.stringify({
    file_name: fileName, language: parsedResult.language, full_source: codeContent, raw_issues: issuesWithRag
  }), verifierSchema);

  const verifierResult = parseJsonSafe(verifierText);
  const verifiedIssues = verifierResult?.verified_issues || [];

  // [4] Reporter Agent (Scorer 통합)
  console.log(`\x1b[34m  [4/4 Reporter] ${relPath}\x1b[0m`);
  const reporterSchema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" }, description: { type: "STRING" }, suggestion: { type: "STRING" },
        rule_id: { type: "STRING" },
        severity: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
        category: { type: "STRING", enum: ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "dependency", "test_coverage", "other"] },
        priority_score: { type: "INTEGER" }, file_path: { type: "STRING" },
        line_start: { type: "INTEGER" }, line_end: { type: "INTEGER" }, code_snippet: { type: "STRING" },
        status: { type: "STRING", enum: ["open", "pending_review"] },
        is_false_positive: { type: "BOOLEAN" }, effort_minutes: { type: "INTEGER" },
        confidence_score: { type: "NUMBER" }, human_review_required: { type: "BOOLEAN" },
        rag_references: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, id: { type: "STRING" }, title: { type: "STRING" } }, required: ["source", "id", "title"] } },
        score_breakdown: { type: "OBJECT", properties: { severity_base: { type: "INTEGER" }, impact_factor: { type: "INTEGER" }, complexity_inv: { type: "INTEGER" }, attack_surface: { type: "INTEGER" } }, required: ["severity_base", "impact_factor", "complexity_inv", "attack_surface"] }
      },
      required: ["title", "description", "suggestion", "rule_id", "severity", "category", "priority_score", "file_path", "line_start", "line_end", "code_snippet", "status", "is_false_positive", "effort_minutes", "confidence_score", "human_review_required", "rag_references", "score_breakdown"]
    }
  };

  const reporterText = await callGeminiNode(reporterPrompt, JSON.stringify({
    project_id: projectId, analysis_run_id: runId,
    raw_issues: issuesWithRag, verified_issues: verifiedIssues, scored_issues: []
  }), reporterSchema);

  const reporterIssues = parseJsonSafe(reporterText, /\[\s*\{[\s\S]*\}\s*\]/);
  if (!Array.isArray(reporterIssues)) {
    console.log(`\x1b[33m  - [Reporter] ${relPath}: 최종 포맷 실패, 원시 이슈로 폴백\x1b[0m`);
    return issuesWithRag.map(i => ({
      title: i.title, description: i.description, suggestion: `AS-IS:\n${i.as_is}\n\nTO-BE:\n${i.to_be}`,
      rule_id: null, severity: i.severity_suggestion || 'medium', category: i.category || 'other',
      priority_score: i.severity_suggestion === 'critical' ? 90 : i.severity_suggestion === 'high' ? 75 : i.severity_suggestion === 'low' ? 30 : 50,
      file_path: i.file_path || relPath, line_start: i.line_start, line_end: i.line_end,
      code_snippet: i.code_snippet, status: 'open', is_false_positive: false,
      effort_minutes: 30, confidence_score: i.confidence_raw || 0.7, human_review_required: false,
      rag_references: [], score_breakdown: { severity_base: 50, impact_factor: 1, complexity_inv: 1, attack_surface: 1 }
    }));
  }

  const passedIds = new Set(
    verifiedIssues.filter(v => !v.is_false_positive && !v.duplicate_of).map(v => v.analyst_issue_id)
  );
  return reporterIssues.filter(i => !i.is_false_positive && (passedIds.size === 0 || passedIds.has(i.analyst_issue_id ?? '')));
};

// ----------------------------------------------------
// 7-C. 전체 소스 파일 Gemini 파이프라인 실행
// ----------------------------------------------------
const runGeminiPipeline = async (sourceFiles, resolvedPath) => {
  if (!GEMINI_API_KEY) {
    console.log('\x1b[33m[AI] VITE_GEMINI_API_KEY 없음 — AI 분석 건너뜀\x1b[0m');
    return [];
  }

  console.log(`\n\x1b[36m[AI Pipeline] Gemini 멀티 에이전트 분석 시작 (${sourceFiles.length}개 파일)\x1b[0m`);
  const runId = crypto.randomUUID();
  const allIssues = [];

  for (let i = 0; i < sourceFiles.length; i++) {
    const fileInfo = sourceFiles[i];
    try {
      console.log(`\n\x1b[36m▶ 분석 중 [${i+1}/${sourceFiles.length}]: ${fileInfo.relPath}\x1b[0m`);
      const issues = await analyzeFileWithGemini(fileInfo, runId, '');
      if (issues.length > 0) {
        console.log(`\x1b[32m  ✓ ${issues.length}개 이슈 검출\x1b[0m`);
        allIssues.push(...issues);
      }
      if (i < sourceFiles.length - 1) await sleep(5000);
    } catch (err) {
      console.error(`\x1b[31m  [Error] ${fileInfo.relPath} 분석 실패: ${err.message}\x1b[0m`);
      if (i < sourceFiles.length - 1) await sleep(5000);
    }
  }

  console.log(`\n\x1b[32m[AI Pipeline] 완료: 총 ${allIssues.length}개 이슈 검출\x1b[0m`);
  return allIssues;
};

// ----------------------------------------------------
// 8. 지능적 중복 제거 (Deduplication) 알고리즘
// ----------------------------------------------------
const deduplicateIssues = (aiIssues, linterIssues) => {
  const finalIssues = [...aiIssues];

  for (const lintIssue of linterIssues) {
    const isDuplicate = aiIssues.some(aiIssue => 
      aiIssue.file_path === lintIssue.file_path &&
      Math.abs(aiIssue.line_start - lintIssue.line_start) <= 3
    );

    if (isDuplicate) {
      console.log(`\x1b[90m  - [Deduplicated] Linter 이슈 드롭 (동일라인 겹침): ${lintIssue.file_path}:${lintIssue.line_start} [${lintIssue.title}]\x1b[0m`);
    } else {
      finalIssues.push(lintIssue);
    }
  }

  return finalIssues;
};

// ----------------------------------------------------
// 9. 핵심 실행 파이프라인 (Analyze)
// ----------------------------------------------------
const handleAnalyze = async (targetPath, projectId, customGcpProjectId) => {
  await ensureSupabaseCredentials();

  const sessionValid = await refreshSessionIfNeeded();
  if (!sessionValid) {
    console.error('\x1b[31m[Error] 로그인 세션이 없거나 만료되었습니다. 먼저 "node bin/code-eye.js login" 명령을 실행해 주세요.\x1b[0m');
    process.exit(1);
  }

  let supabaseToken = '';
  let googleToken = '';

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      supabaseToken = config.supabase_access_token || '';
      googleToken = config.google_provider_token || '';
    } catch (e) {}
  }

  let ownerId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${supabaseToken}` }
    });
    if (!userRes.ok) throw new Error(`Auth API ${userRes.status}`);
    const userData = await userRes.json();
    if (!userData?.id) throw new Error('사용자 정보 없음');
    ownerId = userData.id;
  } catch (e) {
    console.error('\x1b[31m[Error] 사용자 세션 정보를 추출할 수 없습니다. 다시 로그인해 주세요.\x1b[0m');
    process.exit(1);
  }

  const resolvedPath = path.resolve(targetPath);
  let activeProjectId = projectId;
  const folderName = path.basename(resolvedPath) || 'Local Project';

  const dbHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Prefer': 'return=representation'
  };

  if (supabaseToken) {
    dbHeaders['Authorization'] = `Bearer ${supabaseToken}`;
  }

  // 프로젝트 ID가 없을 경우 폴더명 기반 자동 검색 및 신규 생성 폴백
  if (!activeProjectId) {
    console.log(`\x1b[34m[Project] --project 인자가 제공되지 않아 폴더명 '${folderName}' 기반으로 프로젝트 자동 검색/생성 시도 중...\x1b[0m`);
    try {
      // 1. 기존 동일 이름 프로젝트가 있는지 검색
      const searchRes = await fetch(`${SUPABASE_URL}/rest/v1/projects?name=eq.${encodeURIComponent(folderName)}`, {
        method: 'GET',
        headers: dbHeaders
      });
      if (searchRes.ok) {
        const projs = await searchRes.json();
        if (projs && projs.length > 0) {
          activeProjectId = projs[0].id;
          console.log(`\x1b[32m- 기존 프로젝트를 발견하여 자동 매핑했습니다. (ID: ${activeProjectId})\x1b[0m`);
        }
      }

      // 2. 존재하지 않는다면 새 프로젝트 자동 생성 및 등록
      if (!activeProjectId) {
        const newProjId = crypto.randomUUID();
        const projCreateRes = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
          method: 'POST',
          headers: dbHeaders,
          body: JSON.stringify({
            id: newProjId,
            name: folderName,
            description: `CLI 자동 분석 도구에 의해 등록된 로컬 프로젝트`,
            owner_id: ownerId,
            language: 'Multi',
            repo_url: 'https://github.com',
            status: 'active',
            total_issues: 0,
            open_issues: 0
          })
        });

        if (!projCreateRes.ok) {
          if (projCreateRes.status === 409) {
            // Concurrently created by another process, fetch and map it
            const searchRes2 = await fetch(`${SUPABASE_URL}/rest/v1/projects?name=eq.${encodeURIComponent(folderName)}`, {
              method: 'GET',
              headers: dbHeaders
            });
            if (searchRes2.ok) {
              const projs2 = await searchRes2.json();
              if (projs2 && projs2.length > 0) {
                activeProjectId = projs2[0].id;
                console.log(`\x1b[32m- 동시 등록 충돌이 발생하였으나 기존 프로젝트로 자동 전환 매핑했습니다. (ID: ${activeProjectId})\x1b[0m`);
              }
            }
          }
          if (!activeProjectId) {
            const errTxt = await projCreateRes.text();
            throw new Error(`DB 프로젝트 등록 에러: ${errTxt}`);
          }
        } else {
          activeProjectId = newProjId;
          console.log(`\x1b[32m- 새 프로젝트를 Supabase DB에 성공적으로 등록했습니다! (ID: ${activeProjectId})\x1b[0m`);
        }
      }
    } catch (err) {
      console.error(`\x1b[31m[Project Error] 프로젝트 자동 매핑 실패:\x1b[0m`, err.message);
      process.exit(1);
    }
  }

  // targetPath의 resolvedPath 출력을 위로 양보함
  console.log(`\n\x1b[32m[CODE EYE] 로컬 분석 대상 디렉토리: ${resolvedPath}\x1b[0m`);

  // 8-3. 다국어 코드 파일 수집
  const sourceFiles = collectSourceFiles(resolvedPath);
  if (sourceFiles.length === 0) {
    console.error('\x1b[31m[Error] 분석 가능한 다국어 소스코드 파일이 대상 경로에 존재하지 않습니다.\x1b[0m');
    process.exit(1);
  }

  // 8-2. Python 가상환경 셋업 및 Linter 실행 (파이썬 파일이 존재하는 경우에만)
  let linterIssues = [];
  const hasPythonFiles = sourceFiles.some(f => f.relPath.endsWith('.py'));
  if (hasPythonFiles) {
    const bin = setupVirtualEnv(resolvedPath);
    if (bin) {
      linterIssues = runLinterAnalysis(resolvedPath, bin);
      console.log(`\x1b[32m- 로컬 Linter 감지 성공 (검출된 물리 결함: ${linterIssues.length}개)\x1b[0m\n`);
    } else {
      console.log('\x1b[33m- 파이썬 정적 툴 미감지로 인해 Linter 단계 생략 (Fallback AI 단독 모드로 이행)\x1b[0m\n');
    }
  }

  const aiIssues = await runGeminiPipeline(sourceFiles, resolvedPath);

  console.log('\n\x1b[34m[Deduplicate] Linter 결과와 AI 진단 결과의 지능형 중복 제거 수행 중...\x1b[0m');
  const finalIssues = deduplicateIssues(aiIssues, linterIssues);
  console.log(`\x1b[32m- 취합 완료 (최종 리포트 등록 이슈 수: ${finalIssues.length}개)\x1b[0m\n`);

  await uploadIssuesToSupabase(activeProjectId, ownerId, sourceFiles, finalIssues, dbHeaders);
};

// ----------------------------------------------------
// 9. DB 적재 공유 로직
// ----------------------------------------------------
const uploadIssuesToSupabase = async (activeProjectId, ownerId, sourceFiles, finalIssues, dbHeaders) => {
  console.log('\x1b[34m[Database] Supabase 클라우드 데이터 적재 시작...\x1b[0m');
  try {
    const runId = crypto.randomUUID();
    const runInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/analysis_runs`, {
      method: 'POST',
      headers: dbHeaders,
      body: JSON.stringify({
        id: runId,
        project_id: activeProjectId,
        triggered_by: ownerId,
        status: 'completed',
        source_type: 'manual',
        total_files: sourceFiles.length,
        analyzed_files: sourceFiles.length,
        issues_found: finalIssues.length,
        critical_count: finalIssues.filter(i => i.severity === 'critical').length,
        high_count: finalIssues.filter(i => i.severity === 'high').length,
        medium_count: finalIssues.filter(i => i.severity === 'medium').length,
        low_count: finalIssues.filter(i => i.severity === 'low').length,
        info_count: finalIssues.filter(i => i.severity === 'info').length,
        completed_at: new Date().toISOString()
      })
    });

    if (!runInsertRes.ok) {
      const errText = await runInsertRes.text();
      throw new Error(`Analysis Run 삽입 실패 (HTTP ${runInsertRes.status}): ${errText}`);
    }

    if (finalIssues.length > 0) {
      const issuePayload = finalIssues.map(issue => ({
        project_id: activeProjectId,
        analysis_run_id: runId,
        title: issue.title,
        description: issue.description,
        suggestion: issue.suggestion,
        rule_id: issue.rule_id,
        severity: issue.severity,
        category: issue.category,
        priority_score: issue.priority_score || (issue.severity === 'critical' ? 95 : 50),
        file_path: issue.file_path,
        line_start: issue.line_start,
        line_end: issue.line_end,
        code_snippet: issue.code_snippet,
        status: 'open'
      }));

      const issuesInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/issues`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify(issuePayload)
      });

      if (!issuesInsertRes.ok) {
        const errText = await issuesInsertRes.text();
        throw new Error(`Issues 삽입 실패 (HTTP ${issuesInsertRes.status}): ${errText}`);
      }
    }

    const projectUpdateRes = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${activeProjectId}`, {
      method: 'PATCH',
      headers: dbHeaders,
      body: JSON.stringify({
        total_issues: finalIssues.length,
        open_issues: finalIssues.length
      })
    });

    if (!projectUpdateRes.ok) {
      const errText = await projectUpdateRes.text();
      console.warn('\x1b[33m- [Warning] 프로젝트 요약 수치 갱신 실패:\x1b[0m', errText);
    }

    console.log('\n\x1b[32m🎉 [Success] 모든 정밀 분석 결과가 Supabase에 다이렉트로 적재 완료되었습니다!');
    console.log(`  - 프로젝트 ID: ${activeProjectId}`);
    console.log(`  - 분석 이슈 수: ${finalIssues.length}개\x1b[0m\n`);

  } catch (err) {
    console.error('\x1b[31m[Database Error] Supabase DB 적재 실패:\x1b[0m', err.message);
  }
};

// ----------------------------------------------------
// 10. 외부 결과 임포트 핸들러 (Import)
// ----------------------------------------------------
const handleImport = async (jsonFilePath, projectId) => {
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`\x1b[31m[Error] JSON 파일을 찾을 수 없습니다: ${jsonFilePath}\x1b[0m`);
    process.exit(1);
  }

  await ensureSupabaseCredentials();

  const sessionValid = await refreshSessionIfNeeded();
  if (!sessionValid) {
    console.error('\x1b[31m[Error] 로그인 세션이 없거나 만료되었습니다. "node bin/code-eye.js login"을 먼저 실행하세요.\x1b[0m');
    process.exit(1);
  }
  
  // 환경변수 우선, 없으면 파일 로드
  const config = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) : {};
  const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN || config.supabase_access_token || '';
  const googleToken = config.google_provider_token || '';

  let ownerId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${supabaseToken}` }
    });
    if (!userRes.ok) throw new Error(`Auth API ${userRes.status}`);
    const userData = await userRes.json();
    if (!userData?.id) throw new Error('사용자 정보 없음');
    ownerId = userData.id;
  } catch (e) {
    console.error('\x1b[31m[Error] 사용자 세션 정보를 추출할 수 없습니다. "node bin/code-eye.js login"을 먼저 실행하세요.\x1b[0m');
    process.exit(1);
  }

  const dbHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${supabaseToken}`,
    'Prefer': 'return=representation'
  };

  // 프로필 존재 여부 확인 및 자동 생성 (Self-Healing)
  console.log(`\x1b[34m[Auth] 프로필 유효성 검사 중 (UID: ${ownerId})...\x1b[0m`);
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${ownerId}`, {
    method: 'GET',
    headers: dbHeaders
  });

  if (profileRes.ok) {
    const profiles = await profileRes.json();
    if (!profiles || profiles.length === 0) {
      console.log(`\x1b[33m- 프로필 미존재. 자동 생성 시도...\x1b[0m`);
      const createProfileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({
          id: ownerId,
          display_name: 'CLI User',
          role: 'admin'
        })
      });
      if (!createProfileRes.ok) {
        const err = await createProfileRes.text();
        console.error('\x1b[31m- [Error] 프로필 생성 실패 (RLS 정책 확인 필요):\x1b[0m', err);
        // 무시하고 진행 시도 (이미 있을 수도 있으므로)
      } else {
        console.log(`\x1b[32m- 프로필 생성 완료.\x1b[0m`);
      }
    } else {
      console.log(`\x1b[32m- 프로필 확인 완료.\x1b[0m`);
    }
  }

  const importedIssues = JSON.parse(await fs.promises.readFile(jsonFilePath, 'utf-8'));
  console.log(`\x1b[34m[Import] 외부 분석 결과 '${jsonFilePath}' 로드 완료. (이슈: ${importedIssues.length}개)\x1b[0m`);

  let activeProjectId = projectId;
  const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  if (!activeProjectId || !isUuid(activeProjectId)) {
    const targetName = activeProjectId || path.basename(path.resolve('.')) || 'Imported Project';
    console.log(`\x1b[34m[Project] '${targetName}' 기반 자동 매핑 시도...\x1b[0m`);
    
    activeProjectId = null; // 리셋 후 검색

    // 기존 프로젝트 검색 (이름 기준)
    const searchRes = await fetch(`${SUPABASE_URL}/rest/v1/projects?name=eq.${encodeURIComponent(targetName)}`, {
      method: 'GET',
      headers: dbHeaders
    });
    
    if (searchRes.ok) {
      const projs = await searchRes.json();
      if (projs && projs.length > 0) {
        activeProjectId = projs[0].id;
        console.log(`\x1b[32m- 기존 프로젝트 매핑 완료 (ID: ${activeProjectId})\x1b[0m`);
      }
    }

    if (!activeProjectId) {
      const newProjId = crypto.randomUUID();
      console.log(`\x1b[34m- 새 프로젝트 생성 중... (이름: ${targetName}, ID: ${newProjId})\x1b[0m`);
      const projCreateRes = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
        method: 'POST',
        headers: dbHeaders,
        body: JSON.stringify({
          id: newProjId,
          name: targetName,
          description: 'Imported via Gemini CLI Hybrid Workflow',
          owner_id: ownerId,
          language: 'Mixed',
          status: 'active'
        })
      });
      if (!projCreateRes.ok) {
        if (projCreateRes.status === 409) {
          // Concurrently created by another process, fetch and map it
          const searchRes2 = await fetch(`${SUPABASE_URL}/rest/v1/projects?name=eq.${encodeURIComponent(targetName)}`, {
            method: 'GET',
            headers: dbHeaders
          });
          if (searchRes2.ok) {
            const projs2 = await searchRes2.json();
            if (projs2 && projs2.length > 0) {
              activeProjectId = projs2[0].id;
              console.log(`\x1b[32m- 동시 생성 충돌이 발생하였으나 기존 프로젝트로 자동 매핑했습니다. (ID: ${activeProjectId})\x1b[0m`);
            }
          }
        }
        if (!activeProjectId) {
          const err = await projCreateRes.text();
          console.error('\x1b[31m- [Error] 프로젝트 생성 실패:\x1b[0m', err);
          process.exit(1);
        }
      } else {
        activeProjectId = newProjId;
      }
    }
  }

  const sourceFiles = Array.from(new Set(importedIssues.map(i => i.file_path))).map(path => ({ relPath: path }));
  await uploadIssuesToSupabase(activeProjectId, ownerId, sourceFiles, importedIssues, dbHeaders);
};

// ----------------------------------------------------
// 11. CLI 메인 라우팅 핸들러
// ----------------------------------------------------
const main = () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printHelp();
    process.exit(0);
  }

  const getArgValue = (flag) => {
    const idx = args.indexOf(flag);
    return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : null;
  };

  if (command === 'login') {
    handleLogin();
  } else if (command === 'analyze') {
    const targetPath = args[1] || '.';
    const projectId = getArgValue('--project') || args[2];
    handleAnalyze(targetPath, (projectId && projectId.startsWith('--')) ? null : projectId);
  } else if (command === 'import') {
    const jsonPath = args[1];
    const projectId = getArgValue('--project') || args[2];
    if (!jsonPath) {
      console.log('사용법: node bin/code-eye.js import <issues.json> [--project <id>]');
      process.exit(1);
    }
    handleImport(jsonPath, (projectId && projectId.startsWith('--')) ? null : projectId);
  } else {
    printHelp();
  }
};

const printHelp = () => {
  console.log(`
\x1b[36mCODE EYE - Hybrid CLI Agent\x1b[0m
사용법:
  \x1b[1mnode bin/code-eye.js [명령어] [매개변수]\x1b[0m

명령어:
  \x1b[32mlogin\x1b[0m                     로그인 및 토큰 저장
  \x1b[32manalyze <path> <project_id>\x1b[0m Linter 스캔 전용 (AI 스캔 생략)
  \x1b[32mimport <file> <project_id>\x1b[0m 외부 AI 분석 결과(JSON)를 Supabase에 업로드

예시:
  $ node bin/code-eye.js import ./my_issues.json fe6e962c-24cd-4d87-a682-d3f2df994918
`);
};

main();
