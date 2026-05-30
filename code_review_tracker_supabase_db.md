# Code Review Issue Tracker — Supabase DB 설계 문서

> **대상**: AI 에이전트 (Anthropic / LLM 기반)  
> **목적**: 코드 리뷰 후 발견된 이슈를 등록하고, 심각도(Severity) 기준 우선순위 내림차순으로 표시하는 웹앱의 Supabase DB 전체 설계  
> **DB 플랫폼**: [Supabase](https://supabase.com) (PostgreSQL 15 기반, Row Level Security 포함)

---

## 목차

1. [프로젝트 구조 개요](#1-프로젝트-구조-개요)
2. [테이블 목록](#2-테이블-목록)
3. [테이블 상세 스키마](#3-테이블-상세-스키마)
4. [관계 (Foreign Keys)](#4-관계-foreign-keys)
5. [인덱스 전략](#5-인덱스-전략)
6. [Row Level Security (RLS) 정책](#6-row-level-security-rls-정책)
7. [Supabase Storage 연동](#7-supabase-storage-연동)
8. [Supabase Edge Functions 연동 포인트](#8-supabase-edge-functions-연동-포인트)
9. [초기 데이터 (Seed)](#9-초기-데이터-seed)
10. [전체 SQL 실행 순서](#10-전체-sql-실행-순서)
11. [에이전트 작업 지시](#11-에이전트-작업-지시)

---

## 1. 프로젝트 구조 개요

```
코드 업로드 / 저장소 연결
        ↓
   analysis_runs (분석 실행 기록)
        ↓
   issues (발견된 문제점, priority_score 기준 정렬)
        ↓
   대시보드 표시: Critical → High → Medium → Low → Info
```

**핵심 흐름**:
- 사용자는 `projects` 에 프로젝트를 등록한다
- 코드를 업로드하면 `analysis_runs` 레코드가 생성된다
- 분석 완료 후 `issues` 에 각 문제점이 저장된다
- `issues.priority_score` 내림차순 정렬로 가장 치명적인 이슈가 먼저 표시된다

---

## 2. 테이블 목록

| 테이블명 | 역할 | 핵심 컬럼 |
|---|---|---|
| `profiles` | 유저 프로필 (auth.users 연동) | `id`, `role`, `display_name` |
| `projects` | 프로젝트 단위 | `id`, `name`, `owner_id`, `language` |
| `project_members` | 프로젝트 멤버 권한 | `project_id`, `user_id`, `role` |
| `analysis_runs` | 분석 실행 이력 | `id`, `project_id`, `status`, `file_path` |
| `issues` | 발견된 이슈 (★ 핵심) | `id`, `severity`, `priority_score`, `status` |
| `issue_comments` | 이슈 코멘트 | `issue_id`, `author_id`, `content` |
| `issue_tags` | 이슈 태그 | `issue_id`, `tag` |
| `notifications` | 알림 | `user_id`, `issue_id`, `type` |

---

## 3. 테이블 상세 스키마

### 3-1. `profiles` — 유저 프로필

Supabase `auth.users` 와 1:1 연동. 로그인 시 자동 생성 (트리거로 처리).

```sql
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'developer'
                 CHECK (role IN ('admin', 'reviewer', 'developer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS '유저 프로필. auth.users와 1:1 연동.';
COMMENT ON COLUMN public.profiles.role IS 'admin=전체관리, reviewer=리뷰어, developer=개발자';
```

**자동 생성 트리거** (신규 회원가입 시 profiles 자동 삽입):

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 3-2. `projects` — 프로젝트

```sql
CREATE TABLE public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language        TEXT,                          -- 'python', 'javascript', 'java' 등
  repo_url        TEXT,                          -- GitHub/GitLab URL (선택)
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'deleted')),
  analysis_config JSONB NOT NULL DEFAULT '{}',   -- 분석 설정 (린터 규칙 등)
  total_issues    INTEGER NOT NULL DEFAULT 0,    -- 캐시 카운트
  open_issues     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.projects.analysis_config IS '{"linters":["eslint","bandit"], "ignore_paths":["node_modules"]}';
COMMENT ON COLUMN public.projects.total_issues IS '성능용 캐시 카운트. issues 테이블과 주기적 동기화.';
```

---

### 3-3. `project_members` — 프로젝트 멤버 권한

```sql
CREATE TABLE public.project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'developer'
                CHECK (role IN ('owner', 'reviewer', 'developer', 'viewer')),
  invited_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);
```

---

### 3-4. `analysis_runs` — 분석 실행 이력

```sql
CREATE TABLE public.analysis_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  triggered_by        UUID NOT NULL REFERENCES public.profiles(id),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  source_type         TEXT NOT NULL DEFAULT 'upload'
                        CHECK (source_type IN ('upload', 'repo_sync', 'manual')),
  file_storage_path   TEXT,               -- Supabase Storage 경로
  total_files         INTEGER DEFAULT 0,
  analyzed_files      INTEGER DEFAULT 0,
  issues_found        INTEGER DEFAULT 0,
  critical_count      INTEGER DEFAULT 0,
  high_count          INTEGER DEFAULT 0,
  medium_count        INTEGER DEFAULT 0,
  low_count           INTEGER DEFAULT 0,
  info_count          INTEGER DEFAULT 0,
  error_message       TEXT,               -- 실패 시 에러 메시지
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.analysis_runs.file_storage_path IS 'Supabase Storage bucket: code-uploads/{project_id}/{run_id}/';
```

---

### 3-5. `issues` — 발견된 이슈 ★ 핵심 테이블

> **우선순위 정렬 기준**: `priority_score DESC` → `severity` → `created_at`

```sql
CREATE TYPE severity_level AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved', 'dismissed', 'wont_fix');
CREATE TYPE issue_category AS ENUM (
  'security',       -- SQL Injection, XSS, 인증 취약점 등
  'bug',            -- 로직 오류, NPE, 예외 미처리 등
  'performance',    -- 불필요한 루프, N+1 쿼리 등
  'code_smell',     -- 중복 코드, 긴 함수 등
  'maintainability',-- 낮은 가독성, 복잡도 초과 등
  'style',          -- 코딩 컨벤션 위반
  'documentation',  -- 누락된 주석/문서
  'dependency',     -- 취약한 의존성 패키지
  'test_coverage',  -- 테스트 미작성 영역
  'other'
);

CREATE TABLE public.issues (
  -- 식별자
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  analysis_run_id UUID REFERENCES public.analysis_runs(id) ON DELETE SET NULL,

  -- 이슈 내용
  title           TEXT NOT NULL,
  description     TEXT,
  suggestion      TEXT,            -- AI 개선 제안 (LLM 생성)
  rule_id         TEXT,            -- 린터 룰 ID (e.g. 'no-unused-vars', 'S1481')

  -- 분류
  severity        severity_level NOT NULL,
  category        issue_category NOT NULL DEFAULT 'other',

  -- 우선순위 점수 (0~100, 높을수록 먼저 표시)
  priority_score  SMALLINT NOT NULL DEFAULT 0
                    CHECK (priority_score BETWEEN 0 AND 100),

  -- 코드 위치
  file_path       TEXT,            -- 'src/auth/login.py'
  line_start      INTEGER,
  line_end        INTEGER,
  code_snippet    TEXT,            -- 문제 코드 원문 (최대 2000자)

  -- 상태 관리
  status          issue_status NOT NULL DEFAULT 'open',
  assignee_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  dismiss_reason  TEXT,

  -- 메타
  is_false_positive BOOLEAN NOT NULL DEFAULT FALSE,
  effort_minutes    INTEGER,       -- 예상 수정 소요 시간(분)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.issues.priority_score IS
  'severity 기반 점수: critical=90~100, high=70~89, medium=40~69, low=10~39, info=0~9. 분석 엔진에서 계산.';
COMMENT ON COLUMN public.issues.code_snippet IS '최대 2000자. 전체 파일은 Supabase Storage 참조.';
COMMENT ON COLUMN public.issues.suggestion IS 'LLM(Claude API 등)이 생성한 개선 제안 텍스트.';
```

**priority_score 계산 기준 참고** (분석 엔진에서 적용):

| severity | base score | 예시 범위 |
|---|---|---|
| `critical` | 90 | 90 ~ 100 |
| `high` | 70 | 70 ~ 89 |
| `medium` | 40 | 40 ~ 69 |
| `low` | 10 | 10 ~ 39 |
| `info` | 0 | 0 ~ 9 |

> base score에 영향 범위(impact factor), 수정 복잡도(complexity factor)를 가중하여 최종 점수 결정.

---

### 3-6. `issue_comments` — 이슈 코멘트

```sql
CREATE TABLE public.issue_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 3-7. `issue_tags` — 이슈 태그

```sql
CREATE TABLE public.issue_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, tag)
);
```

---

### 3-8. `notifications` — 알림

```sql
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  issue_id    UUID REFERENCES public.issues(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK (type IN (
                  'issue_assigned',
                  'issue_resolved',
                  'issue_commented',
                  'analysis_completed',
                  'analysis_failed'
                )),
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. 관계 (Foreign Keys)

```
auth.users (Supabase 내장)
    └── profiles (1:1)
            ├── projects (owner_id, 1:N)
            ├── project_members (user_id, N:M)
            ├── analysis_runs (triggered_by, 1:N)
            ├── issues (assignee_id / resolved_by, 1:N)
            ├── issue_comments (author_id, 1:N)
            └── notifications (user_id, 1:N)

projects
    ├── project_members (project_id, 1:N)
    ├── analysis_runs (project_id, 1:N)
    └── issues (project_id, 1:N)

analysis_runs
    └── issues (analysis_run_id, 1:N)

issues
    ├── issue_comments (issue_id, 1:N)
    ├── issue_tags (issue_id, 1:N)
    └── notifications (issue_id, 1:N)
```

---

## 5. 인덱스 전략

> **핵심**: 대시보드 메인 쿼리는 `project_id + priority_score DESC` 조합이 가장 빈번하게 실행됨.

```sql
-- ★ 대시보드 메인 쿼리용 (가장 중요)
CREATE INDEX idx_issues_project_priority
  ON public.issues (project_id, priority_score DESC)
  WHERE status != 'dismissed';

-- severity 필터용
CREATE INDEX idx_issues_project_severity
  ON public.issues (project_id, severity);

-- 상태 필터용
CREATE INDEX idx_issues_status
  ON public.issues (project_id, status);

-- 담당자 필터용
CREATE INDEX idx_issues_assignee
  ON public.issues (assignee_id)
  WHERE assignee_id IS NOT NULL;

-- 카테고리 필터용
CREATE INDEX idx_issues_category
  ON public.issues (project_id, category);

-- 분석 실행 이력 조회용
CREATE INDEX idx_analysis_runs_project
  ON public.analysis_runs (project_id, created_at DESC);

-- 알림 조회용
CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

-- 이슈 코멘트 조회용
CREATE INDEX idx_issue_comments_issue
  ON public.issue_comments (issue_id, created_at);
```

---

## 6. Row Level Security (RLS) 정책

> Supabase에서 RLS는 **반드시 활성화**해야 한다. 활성화하지 않으면 모든 유저가 전체 데이터에 접근 가능.

### 6-1. RLS 활성화

```sql
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_tags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
```

### 6-2. 헬퍼 함수

```sql
-- 현재 로그인 유저가 해당 프로젝트의 멤버인지 확인
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 현재 로그인 유저의 role 반환
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 6-3. `profiles` RLS

```sql
-- 본인 프로필만 수정 가능, 조회는 멤버 간 허용
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (TRUE);  -- 프로필 조회는 인증된 모든 유저 허용

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
```

### 6-4. `projects` RLS

```sql
-- 멤버만 조회 가능
CREATE POLICY "projects_select_member" ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid()
    OR public.is_project_member(id)
  );

-- 인증된 유저는 프로젝트 생성 가능
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- owner만 수정/삭제 가능
CREATE POLICY "projects_update_owner" ON public.projects
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "projects_delete_owner" ON public.projects
  FOR DELETE USING (owner_id = auth.uid());
```

### 6-5. `issues` RLS

```sql
-- 프로젝트 멤버만 조회 가능
CREATE POLICY "issues_select" ON public.issues
  FOR SELECT USING (public.is_project_member(project_id));

-- 프로젝트 멤버는 이슈 등록 가능
CREATE POLICY "issues_insert" ON public.issues
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

-- 프로젝트 멤버는 이슈 상태/담당자 수정 가능
CREATE POLICY "issues_update" ON public.issues
  FOR UPDATE USING (public.is_project_member(project_id));
```

### 6-6. `notifications` RLS

```sql
-- 본인 알림만 조회/수정
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());
```

---

## 7. Supabase Storage 연동

### 버킷 구성

```
Supabase Storage
└── code-uploads/          (비공개 버킷, authenticated 접근)
    └── {project_id}/
        └── {analysis_run_id}/
            ├── source.zip          (업로드된 소스 전체)
            └── report.json         (분석 결과 원본 JSON)
```

### 버킷 생성 SQL

```sql
-- Supabase Dashboard > Storage > New Bucket 또는 SQL 실행
INSERT INTO storage.buckets (id, name, public)
VALUES ('code-uploads', 'code-uploads', FALSE);

-- Storage RLS: 프로젝트 멤버만 업로드/다운로드 가능
CREATE POLICY "storage_upload_member" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'code-uploads'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "storage_read_member" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'code-uploads'
    AND auth.uid() IS NOT NULL
  );
```

### `analysis_runs.file_storage_path` 경로 규칙

```
code-uploads/{project_id}/{analysis_run_id}/source.zip
code-uploads/{project_id}/{analysis_run_id}/report.json
```

---

## 8. Supabase Edge Functions 연동 포인트

> Edge Functions는 분석 트리거, AI 제안 생성, 알림 발송에 사용.

| Function명 | 트리거 | 역할 |
|---|---|---|
| `trigger-analysis` | POST `/analysis_runs` 삽입 후 | 분석 워커 호출 (외부 API 또는 백엔드 서버) |
| `generate-suggestion` | `issues` 삽입 후 (critical/high만) | Claude API 호출 → `issues.suggestion` 업데이트 |
| `send-notification` | `issues.assignee_id` 변경 시 | 담당자에게 이메일/슬랙 알림 |

### Database Webhook 예시 (Supabase Dashboard에서 설정)

```
Table: analysis_runs
Event: INSERT
Webhook URL: https://{project}.supabase.co/functions/v1/trigger-analysis
HTTP Method: POST
```

---

## 9. 초기 데이터 (Seed)

### severity별 기본 점수 참조 데이터

```sql
-- issue_category별 기본 severity 매핑 (분석 엔진 참조용)
CREATE TABLE public.severity_rules (
  id          SERIAL PRIMARY KEY,
  category    issue_category NOT NULL,
  rule_id     TEXT,                    -- 린터 룰 ID
  default_severity severity_level NOT NULL,
  base_score  SMALLINT NOT NULL
);

INSERT INTO public.severity_rules (category, rule_id, default_severity, base_score) VALUES
  ('security',        'sql-injection',      'critical', 95),
  ('security',        'xss',                'critical', 92),
  ('security',        'hardcoded-secret',   'critical', 90),
  ('security',        'weak-crypto',        'high',     75),
  ('bug',             'null-deref',         'high',     78),
  ('bug',             'unhandled-exception','high',     72),
  ('performance',     'n-plus-one-query',   'high',     70),
  ('performance',     'nested-loop',        'medium',   55),
  ('code_smell',      'duplicate-code',     'medium',   45),
  ('maintainability', 'complex-function',   'medium',   42),
  ('style',           'naming-convention',  'low',      15),
  ('documentation',   'missing-docstring',  'info',     5);
```

---

## 10. 전체 SQL 실행 순서

에이전트는 아래 순서대로 SQL을 Supabase SQL Editor에서 실행한다.

```
Step 1. ENUM 타입 생성
        → severity_level, issue_status, issue_category

Step 2. 기본 테이블 생성 (의존성 순서)
        → profiles → projects → project_members
        → analysis_runs → issues
        → issue_comments → issue_tags → notifications

Step 3. 트리거 생성
        → handle_new_user (auth.users INSERT 후 profiles 자동 생성)
        → updated_at 자동 갱신 트리거 (각 테이블)

Step 4. 인덱스 생성
        → Section 5 참조

Step 5. RLS 활성화 및 정책 생성
        → Section 6 참조 (반드시 테이블 생성 후 실행)

Step 6. Storage 버킷 생성
        → Section 7 참조

Step 7. Seed 데이터 삽입
        → severity_rules 참조 데이터
```

### `updated_at` 자동 갱신 트리거 (공통)

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 적용
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.issue_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## 11. 에이전트 작업 지시

> 아래 내용을 에이전트에게 그대로 전달한다.

### 에이전트가 반드시 준수해야 할 규칙

1. **ENUM 타입 먼저 생성** — `severity_level`, `issue_status`, `issue_category` 없이 `issues` 테이블 생성 불가
2. **RLS 반드시 활성화** — 비활성화 상태로 배포 금지
3. **`priority_score` 는 DB에서 계산하지 않음** — 분석 엔진(백엔드/Edge Function)에서 계산 후 INSERT 시 전달
4. **`auth.uid()` 사용** — RLS 정책에서 유저 식별은 항상 Supabase 내장 `auth.uid()` 함수 사용
5. **`gen_random_uuid()`** — UUID 기본값은 PostgreSQL 내장 함수 사용 (Supabase 기본 지원)
6. **Storage 경로 규칙 준수** — `code-uploads/{project_id}/{analysis_run_id}/` 형식 고정

### 프론트엔드 에이전트에게 전달할 주요 쿼리 예시

```sql
-- 대시보드: 프로젝트 이슈 목록 (우선순위 내림차순)
SELECT
  id, title, severity, priority_score, category,
  status, file_path, line_start, assignee_id, created_at
FROM public.issues
WHERE project_id = $1
  AND status NOT IN ('dismissed', 'wont_fix')
ORDER BY priority_score DESC, created_at DESC
LIMIT 50 OFFSET $2;

-- 심각도별 필터 추가 시
WHERE project_id = $1
  AND severity = 'critical'
  AND status = 'open'
ORDER BY priority_score DESC;

-- 이슈 상세
SELECT
  i.*,
  p.display_name AS assignee_name,
  p.avatar_url   AS assignee_avatar
FROM public.issues i
LEFT JOIN public.profiles p ON i.assignee_id = p.id
WHERE i.id = $1;
```

### Supabase 클라이언트 코드 예시 (TypeScript)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 이슈 목록 조회 (priority_score 내림차순)
const { data: issues, error } = await supabase
  .from('issues')
  .select(`
    id, title, severity, priority_score, category,
    status, file_path, line_start, created_at,
    assignee:profiles(display_name, avatar_url)
  `)
  .eq('project_id', projectId)
  .not('status', 'in', '(dismissed,wont_fix)')
  .order('priority_score', { ascending: false })
  .range(0, 49)

// 이슈 상태 변경
const { error } = await supabase
  .from('issues')
  .update({ status: 'resolved', resolved_by: userId, resolved_at: new Date().toISOString() })
  .eq('id', issueId)

// 실시간 구독 (분석 완료 이벤트)
supabase
  .channel('analysis_updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'analysis_runs',
    filter: `project_id=eq.${projectId}`
  }, (payload) => {
    if (payload.new.status === 'completed') {
      // 대시보드 새로고침
    }
  })
  .subscribe()
```

---

*문서 버전: v1.0 | 작성 기준: Supabase PostgreSQL 15, 코드 리뷰 이슈 트래커 프로젝트*
