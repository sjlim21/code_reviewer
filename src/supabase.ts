import { createClient, SupabaseClient } from '@supabase/supabase-js';

// SessionStorage 키 정의
export const STORAGE_KEYS = {
  SUPABASE_URL: 'code_eye_supabase_url',
  SUPABASE_ANON_KEY: 'code_eye_supabase_anon_key'
};

const deobfuscate = (str: string) => {
  if (!str) return '';
  try {
    return decodeURIComponent(atob(str));
  } catch {
    return str;
  }
};

let cachedSupabaseClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

// 동적으로 Supabase 클라이언트를 가져오는 함수 (싱글톤 보장)
export const getSupabaseClient = (): SupabaseClient | null => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  // Clean up any remaining legacy localStorage keys for security
  if (localStorage.getItem('code_eye_supabase_url')) {
    localStorage.removeItem('code_eye_supabase_url');
  }
  if (localStorage.getItem('code_eye_supabase_anon_key')) {
    localStorage.removeItem('code_eye_supabase_anon_key');
  }
  if (localStorage.getItem('code_eye_gemini_api_key')) {
    localStorage.removeItem('code_eye_gemini_api_key');
  }

  const localUrl = deobfuscate(sessionStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '');
  const localKey = deobfuscate(sessionStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '');

  const url = envUrl || localUrl || '';
  const key = envKey || localKey || '';

  if (url && key) {
    // 기존 캐시된 클라이언트가 있고 접속 주소/키가 동일하다면 싱글톤 재사용
    if (cachedSupabaseClient && cachedUrl === url && cachedKey === key) {
      return cachedSupabaseClient;
    }
    
    try {
      cachedSupabaseClient = createClient(url, key);
      cachedUrl = url;
      cachedKey = key;
      return cachedSupabaseClient;
    } catch (e) {
      console.error("Supabase client initialization failed:", e);
      return null;
    }
  }
  return null;
};

// 타입 정의
export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string;
  role: 'admin' | 'reviewer' | 'developer';
}

export interface Project {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  language: string;
  repo_url: string;
  status: 'active' | 'archived' | 'deleted';
  webhook_secret: string | null;
  total_issues: number;
  open_issues: number;
  created_at: string;
}

export interface AnalysisRun {
  id: string;
  project_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  source_type: 'upload' | 'repo_sync' | 'manual';
  total_files: number;
  analyzed_files: number;
  issues_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  trigger_type: 'manual' | 'ci' | 'api';
  file_hash: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  project_id: string;
  analysis_run_id: string;
  title: string;
  description: string;
  suggestion: string;
  rule_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'bug' | 'performance' | 'code_smell' | 'maintainability' | 'style' | 'documentation' | 'dependency' | 'test_coverage' | 'other';
  priority_score: number;
  file_path: string;
  line_start: number;
  line_end: number;
  code_snippet: string;
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'wont_fix' | 'pending_review';
  assignee_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  confidence_score?: number;
  human_review_required?: boolean;
  rag_references?: { source: string; id: string; title: string }[];
  score_breakdown?: {
    severity_base: number;
    impact_factor: number;
    complexity_inv: number;
    attack_surface: number;
  };
  effort_minutes?: number | null;
}

export interface IssueComment {
  id: string;
  issue_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

// ----------------------------------------------------
// Mock 데이터셋 (연동 전 Fallback 데모용)
// ----------------------------------------------------
export const mockProfiles: Profile[] = [
  { id: 'usr-1', display_name: 'Min-su Kim', avatar_url: '', role: 'admin' },
  { id: 'usr-2', display_name: 'Ji-won Lee', avatar_url: '', role: 'reviewer' },
  { id: 'usr-3', display_name: 'Yeong-ho Park', avatar_url: '', role: 'developer' }
];

export const mockProjects: Project[] = [
  {
    id: 'prj-1',
    name: 'code_reviewer',
    description: '계층적 구조 기반의 자율형 AI 코드 리뷰 및 빌드 검증 자동화 도구',
    owner_id: 'usr-1',
    language: 'Python',
    repo_url: 'https://github.com/sjlim21/code_reviewer',
    status: 'active',
    total_issues: 15,
    open_issues: 9,
    created_at: '2026-05-20T10:00:00Z'
  },
  {
    id: 'prj-2',
    name: 'LLM-Gateway-Proxy',
    description: 'OpenAI 호환 API 연동 분산 레이트 리밋 프록시 게이트웨이',
    owner_id: 'usr-2',
    language: 'Go',
    repo_url: 'https://github.com/sjlim21/llm-gateway-proxy',
    status: 'active',
    total_issues: 8,
    open_issues: 4,
    created_at: '2026-05-25T14:30:00Z'
  }
];

export const mockIssues: Issue[] = [
  {
    id: 'iss-1',
    project_id: 'prj-1',
    analysis_run_id: 'run-1',
    title: 'LLM API 호출 장애 시 Exception 핸들링 누락',
    description: 'LLM 텍스트 생성 모듈에서 API 호출 에러(Timeout, Rate Limit 등)가 발생할 때 예외 처리가 없어 전체 리뷰 프로세스가 중간에 비정상 중단됩니다. 백오프(Exponential Backoff) 및 재시도(Retry) 메커니즘 도입이 필요합니다.',
    suggestion: `# AS-IS
def call_llm(prompt):
    response = openai.ChatCompletion.create(model="gpt-4o", messages=[{"role": "user", "content": prompt}])
    return response.choices[0].message.content

# TO-BE
import time
from openai.error import OpenAIError

def call_llm(prompt, retries=3, delay=2):
    for attempt in range(retries):
        try:
            response = openai.ChatCompletion.create(model="gpt-4o", messages=[{"role": "user", "content": prompt}])
            return response.choices[0].message.content
        except OpenAIError as e:
            if attempt == retries - 1:
                raise e
            time.sleep(delay * (2 ** attempt))`,
    rule_id: 'bug/unhandled-api-exception',
    severity: 'critical',
    category: 'bug',
    priority_score: 94,
    file_path: 'src/reviewer/llm.py',
    line_start: 34,
    line_end: 45,
    code_snippet: `def call_llm(prompt):
    # WARNING: Direct API call without connection fault tolerance
    response = openai.ChatCompletion.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content`,
    status: 'open',
    assignee_id: 'usr-3',
    resolved_by: null,
    resolved_at: null,
    created_at: '2026-05-30T14:05:00Z'
  },
  {
    id: 'iss-2',
    project_id: 'prj-1',
    analysis_run_id: 'run-1',
    title: '빌드 러너 셸 명령어 쉘 주입(Command Injection) 취약점',
    description: '테스트 빌드 툴 실행 시 shell=True 옵션을 사용해 입력값 검증 없이 셸 문자열을 직접 조립하고 있어, 악의적인 사용자가 세미콜론(;) 등을 주입하여 임의의 OS 명령어를 실행할 수 있는 중대한 보안 리스크입니다.',
    suggestion: `# AS-IS
import subprocess
def run_build_test(test_cmd):
    return subprocess.Popen(f"npm run {test_cmd}", shell=True)

# TO-BE
import subprocess
import shlex
def run_build_test(test_cmd):
    # shell=False 설정 및 매개변수 리스트 전달
    safe_args = ["npm", "run"] + shlex.split(test_cmd)
    return subprocess.Popen(safe_args, shell=False)`,
    rule_id: 'security/command-injection-shell-true',
    severity: 'critical',
    category: 'security',
    priority_score: 97,
    file_path: 'src/reviewer/executor.py',
    line_start: 112,
    line_end: 118,
    code_snippet: `def run_build_test(test_cmd):
    # Vulnerable process spawn with shell=True
    process = subprocess.Popen(
        f"npm run {test_cmd}",
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    return process.communicate()`,
    status: 'open',
    assignee_id: null,
    resolved_by: null,
    resolved_at: null,
    created_at: '2026-05-30T14:06:00Z'
  }
];

export const mockComments: IssueComment[] = [
  {
    id: 'cmt-1',
    issue_id: 'iss-1',
    author_id: 'usr-2',
    content: '이 취약점은 프로덕션 릴리즈 전 반드시 수정되어야 합니다. RLS뿐만 아니라 게이트웨이 파싱단에서 none을 하드 드롭해야 합니다.',
    created_at: '2026-05-30T14:30:00Z'
  }
];
