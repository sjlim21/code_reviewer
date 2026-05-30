#!/usr/bin/env node

/**
 * CODE EYE - AI & Linter Hybrid CLI Agent
 * Node.js 내장 모듈 및 fetch API를 이용한 자율 경량형 CLI 에이전트
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';

// ESM 환경의 __dirname 획득
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(os.homedir(), '.code-eye-config.json');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// 지원하는 코드 확장자 규칙
const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.h', '.cs', '.java', '.py', '.go', '.js', '.jsx', '.ts', '.tsx'];

// ----------------------------------------------------
// 1. .env 파일 파싱 유틸리티
// ----------------------------------------------------
const loadEnv = () => {
  const env: Record<string, string> = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim();
      if (key) {
        env[key.trim()] = val.replace(/^["']|["']$/g, ''); // 따옴표 제거
      }
    }
  }
  return env;
};

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
const GEMINI_API_KEY = env.VITE_GEMINI_API_KEY || '';

// ----------------------------------------------------
// 2. Python 환경 감지 및 가상환경 (.venv) 자율 셋업
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

const setupVirtualEnv = (targetDir: string): { radonPath: string; banditPath: string } | null => {
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

  // 가상환경 폴더가 없다면 새로 생성
  if (!fs.existsSync(venvDir)) {
    console.log(`\x1b[34m[Venv] 로컬 가상환경(.venv)이 존재하지 않아 생성 중... (${pythonCmd} -m venv .venv)\x1b[0m`);
    try {
      execSync(`${pythonCmd} -m venv "${venvDir}"`, { stdio: 'inherit', cwd: targetDir });
    } catch (e) {
      console.error('\x1b[31m[Venv Error] 가상환경 생성 실패:\x1b[0m', e);
      return null;
    }
  }

  // 가상환경 내부 radon/bandit 설치 여부 검사 및 없으면 pip install
  if (!fs.existsSync(radonPath) || !fs.existsSync(banditPath)) {
    console.log('\x1b[34m[Venv] 가상환경 내 radon 및 bandit 설치 중... (pip install radon bandit)\x1b[0m');
    try {
      execSync(`"${pipPath}" install radon bandit`, { stdio: 'inherit', cwd: targetDir });
    } catch (e) {
      console.error('\x1b[31m[Venv Error] pip install 패키지 설치 실패:\x1b[0m', e);
      return null;
    }
  }

  return { radonPath, banditPath };
};

// ----------------------------------------------------
// 3. 로컬 OAuth 로그인 핸들러 (http Server)
// ----------------------------------------------------
const handleLogin = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('\x1b[31m[Error] .env 내에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정이 부재합니다.\x1b[0m');
    process.exit(1);
  }

  const port = 54321;
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '', `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/callback') {
      // 리다이렉트되어 돌아왔을 때, 해시 파라미터(#)는 서버로 전달되지 않으므로 HTML 브릿지 페이지 반환
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>CODE EYE 로그인 완료</title></head>
        <body style="font-family: sans-serif; background-color: #0b0f19; color: #f8f9fa; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin:0;">
          <h1 style="color: #6366f1;">CODE EYE</h1>
          <p>OAuth 토큰 정보를 로컬 CLI 세션으로 이전하는 중...</p>
          <script>
            // 브라우저 해시 파라미터 획득 및 로컬 API로 재전송
            const hash = window.location.hash;
            if (hash) {
              const params = new URLSearchParams(hash.replace('#', '?'));
              const accessToken = params.get('access_token');
              const providerToken = params.get('provider_token');
              if (accessToken) {
                fetch('/save-token?access_token=' + encodeURIComponent(accessToken) + '&provider_token=' + encodeURIComponent(providerToken || ''))
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
      const accessToken = parsedUrl.searchParams.get('access_token') || '';
      const providerToken = parsedUrl.searchParams.get('provider_token') || '';

      if (accessToken) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({
          supabase_access_token: accessToken,
          google_provider_token: providerToken,
          saved_at: new Date().toISOString()
        }, null, 2));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));

        console.log('\n\x1b[32m[Success] 구글 OAuth 토큰 세션이 ~/.code-eye-config.json 에 정상 기록되었습니다!\x1b[0m');
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

  server.listen(port, () => {
    const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=http://localhost:${port}/callback&scopes=https://www.googleapis.com/auth/generative-language`;
    console.log(`\n\x1b[34m[Auth] Google OAuth 로그인창을 여는 중...\x1b[0m`);
    console.log(`- 아래 주소를 브라우저에 복사해 직접 접속하셔도 됩니다:\n  ${oauthUrl}\n`);
    
    // OS별 기본 브라우저 자동 호출
    try {
      const startCmd = os.platform() === 'win32' ? 'start' : os.platform() === 'darwin' ? 'open' : 'xdg-open';
      // start 명령어는 첫 매개변수로 타이틀을 지정할 수 있으므로 따옴표 처리에 유의
      if (os.platform() === 'win32') {
        execSync(`start "" "${oauthUrl}"`);
      } else {
        execSync(`${startCmd} "${oauthUrl}"`);
      }
    } catch (e) {
      // 자동 열기 실패 시 수동 접속 유도
    }
  });
};

// ----------------------------------------------------
// 4. Linter 정적 분석 가동 (radon & bandit)
// ----------------------------------------------------
const runLinterAnalysis = (targetPath: string, bin: { radonPath: string; banditPath: string }) => {
  console.log('\x1b[34m[Linter] 1단계: 로컬 파이썬 Linter (radon & bandit) 가동 중...\x1b[0m');
  const radonIssues: any[] = [];
  const banditIssues: any[] = [];

  // 4-1. Radon CC 분석
  try {
    const radonResRaw = execSync(`"${bin.radonPath}" cc "${targetPath}" -j`, { encoding: 'utf-8' });
    const radonJson = JSON.parse(radonResRaw);
    
    Object.keys(radonJson).forEach(filePath => {
      const items = radonJson[filePath];
      const relPath = path.relative(targetPath, filePath).replace(/\\/g, '/');
      items.forEach((item: any) => {
        // 복잡도가 C 등급(Score > 10) 이상인 경우 결함 경고 등록
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

  // 4-2. Bandit 보안 분석
  try {
    const banditResRaw = execSync(`"${bin.banditPath}" -r "${targetPath}" -f json`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const banditJson = JSON.parse(banditResRaw);
    
    if (banditJson.results && Array.isArray(banditJson.results)) {
      banditJson.results.forEach((issue: any) => {
        const relPath = path.relative(targetPath, issue.filename).replace(/\\/g, '/');
        const severityMap: Record<string, string> = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', UNDEFINED: 'info' };
        
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
  } catch (e: any) {
    // Bandit은 취약점이 감지되면 exit code 1을 리턴하므로 catch 블록에서 아웃풋 수집 처리 가능
    try {
      if (e.stdout) {
        const banditJson = JSON.parse(e.stdout.toString());
        if (banditJson.results && Array.isArray(banditJson.results)) {
          banditJson.results.forEach((issue: any) => {
            const relPath = path.relative(targetPath, issue.filename).replace(/\\/g, '/');
            const severityMap: Record<string, string> = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };
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
// 5. 다국어 소스코드 재귀 수집
// ----------------------------------------------------
const collectSourceFiles = (dir: string, baseDir: string = dir): { name: string; content: string; relPath: string }[] => {
  const results: any[] = [];
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
// 6. 에이전트 마크다운 시스템 프롬프트 로드
// ----------------------------------------------------
const getAgentSystemPrompt = () => {
  const agentMdPath = path.join(PROJECT_ROOT, 'src', 'agents', 'code-reviewer-agent.md');
  if (fs.existsSync(agentMdPath)) {
    return fs.readFileSync(agentMdPath, 'utf-8');
  }
  return `You are a static code analyzer. Return issues matched to the requested JSON Schema.`;
};

// ----------------------------------------------------
// 7. 지능적 중복 제거 (Deduplication) 알고리즘
// ----------------------------------------------------
const deduplicateIssues = (aiIssues: any[], linterIssues: any[]) => {
  const finalIssues = [...aiIssues];

  for (const lintIssue of linterIssues) {
    // 동일 파일의 ±3라인 오차 범위 내에 겹치는 AI 이슈가 있는지 체크
    const isDuplicate = aiIssues.some(aiIssue => 
      aiIssue.file_path === lintIssue.file_path &&
      Math.abs(aiIssue.line_start - lintIssue.line_start) <= 3
    );

    if (isDuplicate) {
      console.log(`\x1b[90m  - [Deduplicated] Linter 이슈 드롭 (동일라인 겹침): ${lintIssue.file_path}:${lintIssue.line_start} [${lintIssue.title}]\x1b[0m`);
    } else {
      // 겹치지 않는 Linter 고유 이슈는 합류시킴
      finalIssues.push(lintIssue);
    }
  }

  return finalIssues;
};

// ----------------------------------------------------
// 8. 핵심 실행 파이프라인 (Analyze)
// ----------------------------------------------------
const handleAnalyze = async (targetPath: string, projectId: string) => {
  // 8-1. 자격 증명 토큰 수집
  let supabaseToken = '';
  let googleToken = '';

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      supabaseToken = config.supabase_access_token || '';
      googleToken = config.google_provider_token || '';
    } catch (e) {}
  }

  // Fallback 체크
  if (!supabaseToken && !SUPABASE_ANON_KEY) {
    console.error('\x1b[31m[Error] 로그인 세션이 부재합니다. 먼저 "node bin/code-eye.js login" 명령을 실행해 주세요.\x1b[0m');
    process.exit(1);
  }

  const resolvedPath = path.resolve(targetPath);
  console.log(`\n\x1b[32m[CODE EYE] 로컬 분석 대상 디렉토리: ${resolvedPath}\x1b[0m`);

  // 8-2. Python 가상환경 셋업 및 Linter 실행
  let linterIssues: any[] = [];
  const bin = setupVirtualEnv(resolvedPath);
  if (bin) {
    linterIssues = runLinterAnalysis(resolvedPath, bin);
    console.log(`\x1b[32m- 로컬 Linter 감지 성공 (검출된 물리 결함: ${linterIssues.length}개)\x1b[0m\n`);
  } else {
    console.log('\x1b[33m- 파이썬 정적 툴 미감지로 인해 Linter 단계 생킵 (Fallback AI 단독 모드로 이행)\x1b[0m\n');
  }

  // 8-3. 다국어 코드 파일 수집
  const sourceFiles = collectSourceFiles(resolvedPath);
  if (sourceFiles.length === 0) {
    console.error('\x1b[31m[Error] 분석 가능한 다국어 소스코드 파일이 대상 경로에 존재하지 않습니다.\x1b[0m');
    process.exit(1);
  }

  console.log(`\x1b[34m[Gemini] 2단계: Gemini 3.5 Flash AI 심층 진단 구동 중... (대상 파일수: ${sourceFiles.length}개)\x1b[0m`);
  const systemPrompt = getAgentSystemPrompt();
  const aiIssues: any[] = [];

  // Linter 리포트 요약본 텍스트 빌드 (Gemini 컨텍스트 융합용)
  let linterSummaryText = '';
  if (linterIssues.length > 0) {
    linterSummaryText = `\n[Python Radon & Bandit Static Analysis Report]\n`;
    linterIssues.forEach((issue, idx) => {
      linterSummaryText += `${idx+1}. File: ${issue.file_path}, Line: ${issue.line_start}, Type: ${issue.category}, Msg: ${issue.description}\n`;
    });
  }

  // 각 소스 파일별 순차 분석 호출
  for (let idx = 0; idx < sourceFiles.length; idx++) {
    const file = sourceFiles[idx];
    console.log(`  - 스캔 중 (${idx + 1}/${sourceFiles.length}): ${file.relPath}`);

    const apiKey = GEMINI_API_KEY || '';
    const url = googleToken
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`
      : `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (googleToken) headers['Authorization'] = `Bearer ${googleToken}`;

    const userPrompt = `File Path: ${file.relPath}
Content:
\`\`\`
${file.content}
\`\`\`
${linterSummaryText ? `\n참고할 정적 Linter 진단 결과는 아래와 같습니다. 겹치는 이슈가 있다면 검토 후 정형 스키마에 수용 및 개선 코드를 작성하세요.\n${linterSummaryText}` : ''}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              description: "List of code review issues detected in the source code.",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  description: { type: "STRING" },
                  suggestion: { type: "STRING" },
                  rule_id: { type: "STRING" },
                  severity: { type: "STRING", enum: ["critical", "high", "medium", "low", "info"] },
                  category: { type: "STRING", enum: ["security", "bug", "performance", "code_smell", "maintainability", "style", "documentation", "other"] },
                  line_start: { type: "INTEGER" },
                  line_end: { type: "INTEGER" },
                  code_snippet: { type: "STRING" }
                },
                required: ["title", "description", "suggestion", "rule_id", "severity", "category", "line_start", "line_end", "code_snippet"]
              }
            }
          }
        })
      });

      if (!response.ok) {
        console.warn(`    \x1b[31m[Warning] ${file.relPath} AI 스캔 에러 (HTTP ${response.status})\x1b[0m`);
        continue;
      }

      const resJson: any = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          parsed.forEach((issue: any, i: number) => {
            aiIssues.push({
              id: `iss-cli-${Date.now()}-${idx}-${i}`,
              project_id: projectId,
              title: issue.title,
              description: issue.description,
              suggestion: issue.suggestion,
              rule_id: issue.rule_id,
              severity: issue.severity,
              category: issue.category,
              priority_score: issue.severity === 'critical' ? 95 : issue.severity === 'high' ? 75 : 45,
              file_path: file.relPath,
              line_start: issue.line_start,
              line_end: issue.line_end,
              code_snippet: issue.code_snippet,
              status: 'open',
              created_at: new Date().toISOString()
            });
          });
        }
      }
    } catch (e: any) {
      console.warn(`    \x1b[31m[Warning] ${file.relPath} Gemini API 스캔 실패:\x1b[0m`, e.message);
    }
  }

  // 8-4. 지능적 중복 제거 (Deduplication) 적용
  console.log('\n\x1b[34m[Deduplicate] Linter 결과와 AI 진단 결과의 지능형 중복 제거 수행 중...\x1b[0m');
  const finalIssues = deduplicateIssues(aiIssues, linterIssues);
  console.log(`\x1b[32m- 취합 완료 (최종 리포트 등록 이슈 수: ${finalIssues.length}개)\x1b[0m\n`);

  // 8-5. Supabase DB 직접 적재
  console.log('\x1b[34m[Database] 3단계: Supabase 클라우드 데이터 적재 시작...\x1b[0m');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Prefer': 'return=representation'
  };

  if (supabaseToken) {
    headers['Authorization'] = `Bearer ${supabaseToken}`;
  }

  try {
    // Analysis Run 레코드 삽입
    const runId = crypto.randomUUID();
    const runInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/analysis_runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: runId,
        project_id: projectId,
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

    // Issues 레코드 벌크 삽입
    if (finalIssues.length > 0) {
      const issuePayload = finalIssues.map(issue => ({
        project_id: projectId,
        analysis_run_id: runId,
        title: issue.title,
        description: issue.description,
        suggestion: issue.suggestion,
        rule_id: issue.rule_id,
        severity: issue.severity,
        category: issue.category,
        priority_score: issue.priority_score,
        file_path: issue.file_path,
        line_start: issue.line_start,
        line_end: issue.line_end,
        code_snippet: issue.code_snippet,
        status: 'open'
      }));

      const issuesInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify(issuePayload)
      });

      if (!issuesInsertRes.ok) {
        const errText = await issuesInsertRes.text();
        throw new Error(`Issues 삽입 실패 (HTTP ${issuesInsertRes.status}): ${errText}`);
      }
    }

    // Project 요약 갱신 (PATCH)
    const projectUpdateRes = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, {
      method: 'PATCH',
      headers,
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
    console.log(`  - 프로젝트 ID: ${projectId}`);
    console.log(`  - 스캔 성공 파일수: ${sourceFiles.length}개`);
    console.log(`  - 등록된 고유 결함수: ${finalIssues.length}개\x1b[0m\n`);

  } catch (err: any) {
    console.error('\x1b[31m[Database Error] Supabase DB 적재 실패:\x1b[0m', err.message);
  }
};

// ----------------------------------------------------
// 9. CLI 메인 라우팅 핸들러
// ----------------------------------------------------
const main = () => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printHelp();
    process.exit(0);
  }

  if (command === 'login') {
    handleLogin();
  } else if (command === 'analyze') {
    const targetPath = args[1];
    let projectId = '';

    // --project 매개변수 파싱
    const projIdx = args.indexOf('--project');
    if (projIdx !== -1 && args[projIdx + 1]) {
      projectId = args[projIdx + 1];
    }

    if (!targetPath) {
      console.error('\x1b[31m[Error] 분석할 대상 경로가 명시되지 않았습니다.\x1b[0m');
      console.log('예: node bin/code-eye.js analyze ./src --project [PROJECT_ID]');
      process.exit(1);
    }

    if (!projectId) {
      console.error('\x1b[31m[Error] --project [PROJECT_ID] 매개변수가 필수적입니다.\x1b[0m');
      process.exit(1);
    }

    handleAnalyze(targetPath, projectId);
  } else {
    printHelp();
  }
};

const printHelp = () => {
  console.log(`
\x1b[36mCODE EYE - AI & Linter Hybrid CLI Agent\x1b[0m
사용법:
  \x1b[1mnode bin/code-eye.js [명령어] [매개변수]\x1b[0m

명령어:
  \x1b[32mlogin\x1b[0m                     Google 소셜 로그인을 실행하고 로컬 인증 토큰을 저장합니다.
  \x1b[32manalyze <path> --project <id>\x1b[0m 로컬 파이썬 Linter 복합 분석을 돌린 뒤 결과를 Supabase에 업로드합니다.

예시:
  $ node bin/code-eye.js login
  $ node bin/code-eye.js analyze ./src --project prj-12345
`);
};

main();
