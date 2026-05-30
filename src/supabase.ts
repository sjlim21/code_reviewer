import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 실제 Supabase와 연동될 클라이언트
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Mock 데이터 생성을 위한 타입 정의
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
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'wont_fix';
  assignee_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface IssueComment {
  id: string;
  issue_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

// Mock 데이터 정의 (데모 실행용)
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

export const mockAnalysisRuns: AnalysisRun[] = [
  {
    id: 'run-1',
    project_id: 'prj-1',
    status: 'completed',
    source_type: 'repo_sync',
    total_files: 24,
    analyzed_files: 24,
    issues_found: 9,
    critical_count: 2,
    high_count: 3,
    medium_count: 3,
    low_count: 1,
    info_count: 0,
    created_at: '2026-05-30T14:00:00Z'
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
  },
  {
    id: 'iss-3',
    project_id: 'prj-1',
    analysis_run_id: 'run-1',
    title: '분석 임시 파일 핸들 릭(Resource Leak) 방지 필요',
    description: '코드 파싱 후 생성된 임시 파일 오브젝트가 예외 상황 발생 시 닫히지 않고 프로세스 메모리에 해제되지 않고 남아 있어 대규모 배치 분석 시 리소스 누수를 발생시킵니다.',
    suggestion: `# AS-IS
def load_code_file(path):
    f = open(path, 'r')
    data = f.read()
    f.close()
    return data

# TO-BE
def load_code_file(path):
    # context manager (with 구문) 사용 보장
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()`,
    rule_id: 'code_smell/unclosed-file-handle',
    severity: 'medium',
    category: 'code_smell',
    priority_score: 58,
    file_path: 'src/reviewer/parser.py',
    line_start: 74,
    line_end: 80,
    code_snippet: `def parse_function_blocks(file_path):
    f = open(file_path, 'r')
    content = f.read()
    # If error happens below, file handle remains open
    ast_tree = ast.parse(content)
    f.close()
    return ast_tree`,
    status: 'in_progress',
    assignee_id: 'usr-1',
    resolved_by: null,
    resolved_at: null,
    created_at: '2026-05-30T14:10:00Z'
  }
];

export const mockComments: IssueComment[] = [
  {
    id: 'cmt-1',
    issue_id: 'iss-1',
    author_id: 'usr-2',
    content: '이 취약점은 프로덕션 릴리즈 전 반드시 수정되어야 합니다. RLS뿐만 아니라 게이트웨이 파싱단에서 none을 하드 드롭해야 합니다.',
    created_at: '2026-05-29T18:30:00Z'
  },
  {
    id: 'cmt-2',
    issue_id: 'iss-1',
    author_id: 'usr-3',
    content: '확인했습니다. 알려주신 TO-BE 가이드로 반영하여 브랜치 업데이트하겠습니다.',
    created_at: '2026-05-29T19:00:00Z'
  }
];
