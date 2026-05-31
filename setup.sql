-- ==========================================
-- Code Review Issue Tracker - Supabase DB Setup SQL
-- ==========================================

-- 1. ENUM 타입 생성
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_level') THEN
        CREATE TYPE severity_level AS ENUM ('critical', 'high', 'medium', 'low', 'info');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_status') THEN
        CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved', 'dismissed', 'wont_fix');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_category') THEN
        CREATE TYPE issue_category AS ENUM (
            'security',
            'bug',
            'performance',
            'code_smell',
            'maintainability',
            'style',
            'documentation',
            'dependency',
            'test_coverage',
            'other'
        );
    END IF;
END$$;

-- 2. profiles 테이블 생성
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('admin', 'reviewer', 'developer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. projects 테이블 생성
CREATE TABLE IF NOT EXISTS public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language        TEXT,
  repo_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  analysis_config JSONB NOT NULL DEFAULT '{}',
  total_issues    INTEGER NOT NULL DEFAULT 0,
  open_issues     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. project_members 테이블 생성
CREATE TABLE IF NOT EXISTS public.project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('owner', 'reviewer', 'developer', 'viewer')),
  invited_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- 5. analysis_runs 테이블 생성
CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  triggered_by        UUID NOT NULL REFERENCES public.profiles(id),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  source_type         TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload', 'repo_sync', 'manual')),
  file_storage_path   TEXT,
  total_files         INTEGER DEFAULT 0,
  analyzed_files      INTEGER DEFAULT 0,
  issues_found        INTEGER DEFAULT 0,
  critical_count      INTEGER DEFAULT 0,
  high_count          INTEGER DEFAULT 0,
  medium_count        INTEGER DEFAULT 0,
  low_count           INTEGER DEFAULT 0,
  info_count          INTEGER DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. issues 테이블 생성
CREATE TABLE IF NOT EXISTS public.issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  analysis_run_id UUID REFERENCES public.analysis_runs(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  suggestion      TEXT,
  rule_id         TEXT,
  severity        severity_level NOT NULL,
  category        issue_category NOT NULL DEFAULT 'other',
  priority_score  SMALLINT NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  file_path       TEXT,
  line_start      INTEGER,
  line_end        INTEGER,
  code_snippet    TEXT,
  status          issue_status NOT NULL DEFAULT 'open',
  assignee_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  dismiss_reason  TEXT,
  is_false_positive BOOLEAN NOT NULL DEFAULT FALSE,
  effort_minutes    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. issue_comments 테이블 생성
CREATE TABLE IF NOT EXISTS public.issue_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. issue_tags 테이블 생성
CREATE TABLE IF NOT EXISTS public.issue_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, tag)
);

-- 9. notifications 테이블 생성
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  issue_id    UUID REFERENCES public.issues(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('issue_assigned', 'issue_resolved', 'issue_commented', 'analysis_completed', 'analysis_failed')),
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. auth.users 연동 profiles 트리거 생성
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. updated_at 자동 갱신 트리거 정의
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.projects;
CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.issues;
CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.issue_comments;
CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON public.issue_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_issues_project_priority ON public.issues (project_id, priority_score DESC) WHERE status != 'dismissed';
CREATE INDEX IF NOT EXISTS idx_issues_project_severity ON public.issues (project_id, severity);
CREATE INDEX IF NOT EXISTS idx_issues_status ON public.issues (project_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON public.issues (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_category ON public.issues (project_id, category);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_project ON public.analysis_runs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON public.issue_comments (issue_id, created_at);

-- 13. RLS 활성화 및 헬퍼 함수
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_tags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS 정책 생성
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "projects_select_member" ON public.projects;
CREATE POLICY "projects_select_member" ON public.projects FOR SELECT USING (owner_id = auth.uid() OR public.is_project_member(id));

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "projects_update_owner" ON public.projects;
CREATE POLICY "projects_update_owner" ON public.projects FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "projects_delete_owner" ON public.projects;
CREATE POLICY "projects_delete_owner" ON public.projects FOR DELETE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "issues_select" ON public.issues;
CREATE POLICY "issues_select" ON public.issues FOR SELECT USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "issues_insert" ON public.issues;
CREATE POLICY "issues_insert" ON public.issues FOR INSERT WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "issues_update" ON public.issues;
CREATE POLICY "issues_update" ON public.issues FOR UPDATE USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "issues_all_access" ON public.issues; -- 삭제 처리하여 RLS 우회 제거

DROP POLICY IF EXISTS "analysis_runs_insert" ON public.analysis_runs;
CREATE POLICY "analysis_runs_insert" ON public.analysis_runs FOR INSERT WITH CHECK (public.is_project_member(project_id));

DROP POLICY IF EXISTS "analysis_runs_select" ON public.analysis_runs;
CREATE POLICY "analysis_runs_select" ON public.analysis_runs FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- 14. Seed 데이터
CREATE TABLE IF NOT EXISTS public.severity_rules (
  id          SERIAL PRIMARY KEY,
  category    issue_category NOT NULL,
  rule_id     TEXT,
  default_severity severity_level NOT NULL,
  base_score  SMALLINT NOT NULL
);

-- unique constraint를 안전하게 보장
ALTER TABLE public.severity_rules DROP CONSTRAINT IF EXISTS unique_category_rule;
ALTER TABLE public.severity_rules ADD CONSTRAINT unique_category_rule UNIQUE (category, rule_id);

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
  ('documentation',   'missing-docstring',  'info',     5)
ON CONFLICT (category, rule_id) DO UPDATE SET
  default_severity = EXCLUDED.default_severity,
  base_score = EXCLUDED.base_score;

