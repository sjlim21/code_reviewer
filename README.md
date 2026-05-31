# CodeEye (코드아이) - AI 기반 자율 코드 리뷰어 & 이슈 트래커

**CodeEye**는 React 19, TypeScript, Supabase, Gemini 3.5 Flash를 결합하여 설계된 자율 코드 리뷰 및 정적 분석 대시보드 플랫폼입니다.
개발자가 로컬 CLI를 통해 코드를 분석하여 Supabase 클라우드 데이터베이스에 분석 로그를 적재하고, 실시간 웹 대시보드를 통해 실시간 탐지 결과 및 AI 피드백을 인터랙티브하게 관리할 수 있도록 설계되었습니다.

---

## 🚀 시작하기 전 준비물
1. **Node.js** (v18 이상 권장)
2. **Supabase 계정 및 프로젝트**
3. **Google Gemini API Key** (Google AI Studio에서 무료 발급 가능)

---

## 🛠️ 1단계: Supabase 데이터베이스 구축 및 설정

### 1. SQL 스키마 초기화
1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인하고 새 프로젝트를 생성합니다.
2. 생성된 프로젝트의 **SQL Editor**로 이동합니다.
3. 프로젝트 루트에 있는 [setup.sql](file:///d:/01_project/3_test_viewer/setup.sql) 파일의 쿼리 전체를 복사하여 SQL Editor에 붙여넣고 **[Run]** 버튼을 실행합니다.
   - 이 쿼리는 필요한 테이블(`projects`, `issues`, `analysis_runs` 등), 인덱스, RLS 보안 정책 및 사용자 트리거를 생성합니다.

### 2. URL 인증 리다이렉트 설정 (중요!)
로컬 CLI 환경에서 구글 OAuth 소셜 로그인이 정상적으로 브라우저 및 터미널과 토큰을 연동하도록 Supabase 화이트리스트 주소를 추가해야 합니다.
1. Supabase 프로젝트의 **Authentication -> URL Configuration** 메뉴로 이동합니다.
2. **Site URL** 설정:
   - `https://code-reviewer-cyan.vercel.app` (또는 본인의 웹 배포 주소) 입력 후 저장
3. **Redirect URLs** 설정:
   - **[Add URL]** 버튼을 클릭하여 아래 두 주소를 각각 추가합니다.
     - `http://localhost:54321/callback` (로컬 CLI 콜백용)
     - `http://localhost:3000` (로컬 웹 개발용)

---

## 📝 2단계: 환경 변수 설정 (`.env`)

프로젝트 루트 폴더에 `.env` 파일을 생성하고 아래 양식에 맞추어 본인의 API 키와 URL을 작성합니다.

```env
# Supabase 접속 정보 (Supabase 프로젝트 Settings -> API 메뉴에서 확인 가능)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google AI Studio Gemini API 키 (선택 사항, 미입력 시 브라우저 로그인 세션 토큰으로 동작)
VITE_GEMINI_API_KEY=AIzaSy...
VITE_GCP_PROJECT_ID=your-gcp-project-id (선택 사항)
```

---

## 💻 3단계: 설치 및 웹 대시보드 실행

### 1. 패키지 설치
```bash
npm install
```

### 2. 로컬 개발 서버 구동 (Vite)
```bash
npm run dev
```
- 브라우저에서 `http://localhost:5173` (혹은 안내되는 포트 주소)로 접속하여 글래스모피즘 기반의 UI 대시보드가 로드되는지 확인합니다.

### 3. 프로덕션 빌드 검증
```bash
npm run build
```

---

## 📟 4단계: 로컬 CLI 분석 도구 사용 가이드 (`code-eye.js`)

로컬 디렉토리의 소스코드를 수집하고 분석하여 Supabase로 결과를 자동 적재하는 커맨드라인 인터페이스입니다.

### 1. CLI 로그인 (최초 1회 필수)
터미널에서 아래 명령을 실행하여 구글 인증을 갱신합니다.
```bash
node bin/code-eye.js login
```
- 실행 시 자동으로 열리는 웹 브라우저 창에서 구글 로그인을 마친 뒤, **"인증 완벽 성공!"** 초록색 안내 문구가 뜨고 터미널에 `[Success]` 구문이 출력될 때까지 대기합니다.

### 2. 프로젝트 소스코드 분석 명령
```bash
node bin/code-eye.js analyze [대상_디렉토리_경로] [프로젝트_UUID]
```
- **예시**:
  ```bash
  node bin/code-eye.js analyze D:\01_project\3_test_viewer fe6e962c-24cd-4d87-a682-d3f2df994918
  ```
- **CLI 분석 범위**:
  - 본 CLI 분석기는 사용자의 요청에 따라 대용량 스캔 요금 및 API 한도 초과(429 Error) 방지를 위해 **Gemini AI 스캔 과정이 비활성화(생략)**되어 있습니다.
  - 분석 경로 내에 파이썬(`.py`) 소스코드가 포함된 경우에만 자동으로 로컬 가상환경(`.venv`) 셋업 및 정적 분석 툴(Radon, Bandit) 검사를 수행하여 업로드합니다.

---

## 🤖 5단계: 수동 Gemini AI 분석 에이전트 실행 방법

로컬에서 직접 Gemini AI 코드리뷰 에이전트를 수행하고 싶을 경우, 프로젝트 내의 에이전트 마크다운 가이드라인을 시스템 프롬프트로 사용하여 임의의 제미나이 환경에서 독립 구동할 수 있습니다.

### 1. 에이전트 프롬프트 문서 파일
- 경로: [src/agents/code-reviewer-agent.md](file:///d:/01_project/3_test_viewer/src/agents/code-reviewer-agent.md)

### 2. 실행 방법
- 사용하고 계신 제미나이 CLI 환경 또는 Google AI Studio 웹 페이지의 **System Instructions(시스템 가이드라인)** 란에 `code-reviewer-agent.md` 파일 내의 지침 문장 전체를 입력합니다.
- 대화(User Prompt) 창에 분석하고자 하는 파일의 확장자와 코드를 복사하여 붙여넣고 정형화된 JSON Schema 형태로 진단 응답을 받아보실 수 있습니다.
