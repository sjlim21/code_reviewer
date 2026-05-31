import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  type Issue, 
  type IssueComment, 
  mockComments, 
  mockProfiles 
} from '../supabase';
import { 
  GitCommit, 
  MessageSquare, 
  Send, 
  ShieldAlert, 
  X,
  Sparkles,
  Columns,
  Rows,
  Maximize2,
  Minimize2,
  Copy,
  Check
} from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';


interface DiffLine {
  type: 'added' | 'removed' | 'normal';
  value: string;
  lineNum: number;
}

function computeLineDiff(A: string[], B: string[]): { originalDiff: DiffLine[]; suggestedDiff: DiffLine[] } {
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (A[i - 1].trim() === B[j - 1].trim()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = n;
  let j = m;
  const originalDiff: DiffLine[] = [];
  const suggestedDiff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1].trim() === B[j - 1].trim()) {
      originalDiff.push({ type: 'normal', value: A[i - 1], lineNum: i });
      suggestedDiff.push({ type: 'normal', value: B[j - 1], lineNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      suggestedDiff.push({ type: 'added', value: B[j - 1], lineNum: j });
      j--;
    } else {
      originalDiff.push({ type: 'removed', value: A[i - 1], lineNum: i });
      i--;
    }
  }

  originalDiff.reverse();
  suggestedDiff.reverse();

  return { originalDiff, suggestedDiff };
}

interface DiffCodeBlockProps {
  code: string;
  otherCode: string;
  isOriginal: boolean;
  filePath: string;
}

const DiffCodeBlock: React.FC<DiffCodeBlockProps> = ({ code, otherCode, isOriginal, filePath }) => {
  const language = filePath.endsWith('.py') ? 'python' : 'typescript';
  const linesOriginal = useMemo(() => code.split('\n'), [code]);
  const linesSuggested = useMemo(() => otherCode.split('\n'), [otherCode]);

  const diffItems = useMemo(() => {
    const { originalDiff, suggestedDiff } = computeLineDiff(linesOriginal, linesSuggested);
    return isOriginal ? originalDiff : suggestedDiff;
  }, [linesOriginal, linesSuggested, isOriginal]);

  return (
    <div className="font-mono text-xs py-2 bg-slate-950 overflow-y-auto max-h-[450px] flex-1">
      {diffItems.map((item, idx) => {
        const highlighted = Prism.languages[language] 
          ? Prism.highlight(item.value, Prism.languages[language], language)
          : item.value;
        const type = item.type;
        return (
          <div 
            key={idx}
            className={`flex items-stretch py-0.5 border-l-2 transition-all duration-150 ${
              type === 'added' 
                ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100 hover:bg-emerald-500/15' 
                : type === 'removed'
                  ? 'bg-rose-500/10 border-rose-500/50 text-slate-100 hover:bg-rose-500/15'
                  : 'border-transparent text-slate-300 hover:bg-slate-900/30'
            }`}
          >
            <div className="w-14 select-none text-right pr-3 text-slate-600 font-mono text-[10px] shrink-0 border-r border-slate-900/60 mr-4 flex items-center justify-between">
              <span className={`text-[10px] font-bold w-3 text-center ${
                type === 'added' ? 'text-emerald-500' : type === 'removed' ? 'text-rose-500' : 'text-slate-700'
              }`}>
                {type === 'added' ? '+' : type === 'removed' ? '-' : ' '}
              </span>
              <span>{item.lineNum}</span>
            </div>
            <div className="flex-1 overflow-x-auto whitespace-pre pr-4">
              <code 
                dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};


interface CodeViewerProps {
  issue: Issue | null;
  onClose: () => void;
  onUpdateStatus: (issueId: string, newStatus: Issue['status']) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  issue,
  onClose,
  onUpdateStatus
}) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [commentTrigger, setCommentTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'split' | 'stacked'>('split');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (!issue?.suggestion) return;
    navigator.clipboard.writeText(issue.suggestion).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const comments = useMemo(() => {
    if (!issue) return [];
    // Reference commentTrigger to satisfy exhaustive-deps lint rule
    void commentTrigger;
    return mockComments.filter(c => c.issue_id === issue.id);
  }, [issue, commentTrigger]);

  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (issue) {
      // Prism 하이라이트 트리거
      setTimeout(() => {
        Prism.highlightAll();
      }, 50);
    }
  }, [issue, viewMode]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  if (!issue) return null;

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment: IssueComment = {
      id: `cmt-${Date.now()}`,
      issue_id: issue.id,
      author_id: 'usr-1', // Default Admin
      content: newCommentText,
      created_at: new Date().toISOString()
    };

    mockComments.push(newComment);
    setNewCommentText('');
    setCommentTrigger(prev => prev + 1);
  };



  const getSeverityBadge = (sev: Issue['severity']) => {
    const classes = {
      critical: 'bg-red-500/10 text-red-400 border border-red-500/20',
      high: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
      medium: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
      low: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      info: 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
    };
    return classes[sev];
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex justify-end transition-all">
      <div className={`w-full bg-slate-900 border-l border-slate-800 h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300 transition-all ${isFullscreen ? 'lg:w-full' : 'lg:w-7/12'}`}>
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${getSeverityBadge(issue.severity)}`}>
              {issue.severity}
            </span>
            <h2 className="text-lg font-bold text-slate-200">{issue.title}</h2>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              title={isFullscreen ? '창 복원 (Restore)' : '전체 화면 (Fullscreen)'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Core Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Issue Meta & Description */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-3">
            <div className="text-slate-400 text-sm">{issue.description}</div>
            <div className="flex flex-wrap gap-4 pt-3 text-xs border-t border-slate-800/60 text-slate-500">
              <div>Rule ID: <span className="font-mono text-slate-400">{issue.rule_id}</span></div>
              <div>File: <span className="font-mono text-slate-400">{issue.file_path} (Lines {issue.line_start}-{issue.line_end})</span></div>
              <div>Priority Score: <span className="font-bold text-indigo-400">{issue.priority_score}/100</span></div>
            </div>
          </div>

          {/* Code snippets & Compare */}
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-red-400" size={16} />
                <span className="text-xs font-semibold text-slate-200">코드 변경 사항 비교</span>
              </div>
              
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`px-3 py-1.5 rounded-md text-[10px] flex items-center gap-1.5 transition-all duration-200 font-bold ${
                    viewMode === 'split' 
                      ? 'bg-indigo-600 text-white shadow-md' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title="나란히 보기 (Split View)"
                >
                  <Columns size={12} />
                  <span>Split View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('stacked')}
                  className={`px-3 py-1.5 rounded-md text-[10px] flex items-center gap-1.5 transition-all duration-200 font-bold ${
                    viewMode === 'stacked' 
                      ? 'bg-indigo-600 text-white shadow-md' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title="위아래로 보기 (Stacked View)"
                >
                  <Rows size={12} />
                  <span>Stacked View</span>
                </button>
              </div>
            </div>

            <div className={viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-4'}>
              {/* AS-IS (Vulnerable original) */}
              <div className="rounded-xl overflow-hidden border border-slate-800/60 bg-slate-950 flex flex-col h-full min-h-[220px]">
                <div className="bg-slate-900/60 px-4 py-2 text-xs text-slate-400 font-mono border-b border-slate-800/60 flex items-center justify-between">
                  <span>AS-IS (취약 코드 원문)</span>
                  <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">Vulnerable</span>
                </div>
                <DiffCodeBlock 
                  code={issue.code_snippet} 
                  otherCode={issue.suggestion} 
                  isOriginal={true} 
                  filePath={issue.file_path} 
                />
              </div>

              {/* TO-BE (AI suggestion) */}
              <div className="rounded-xl overflow-hidden border border-indigo-900/40 bg-slate-950 flex flex-col h-full min-h-[220px]">
                <div className="bg-indigo-950/20 px-4 py-2 text-xs text-indigo-400 font-mono border-b border-indigo-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>TO-BE (자동 개선 제안)</span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-all active:scale-95 shrink-0"
                      title="코드 복사"
                    >
                      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                    <Sparkles size={9} /> Recommended
                  </span>
                </div>
                <DiffCodeBlock 
                  code={issue.code_snippet} 
                  otherCode={issue.suggestion} 
                  isOriginal={false} 
                  filePath={issue.file_path} 
                />
              </div>
            </div>

            {/* AI Security Advisory Notice / Actions */}
            <div className="flex items-center justify-between p-4 bg-slate-950/30 border border-slate-800/80 rounded-xl gap-4">
              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">자동 반영 권장</span>: 코드 자동 수정을 원하시면 개선안 코드를 복사하여 대상 파일에 직접 반영해 주세요.
              </div>
              {issue.status !== 'resolved' && (
                <button
                  disabled={true}
                  className="bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed px-3.5 py-2 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all shrink-0"
                  title="보안 권고: 구문 손상 방지 및 안전한 코드 검토를 위해 코드 자동 수정 기능이 완전히 비활성화되었습니다."
                >
                  <GitCommit size={12} />
                  자동 수정 비활성화됨
                </button>
              )}
            </div>
          </div>

          {/* Comments Section */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <MessageSquare size={16} className="text-slate-400" />
              개발자 리뷰 토론 ({comments.length})
            </h3>
            
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
              {comments.map(c => {
                const author = mockProfiles.find(p => p.id === c.author_id);
                const isSystem = c.content.includes('[System Action]');
                return (
                  <div 
                    key={c.id} 
                    className={`p-3 rounded-lg text-xs ${
                      isSystem 
                        ? 'bg-indigo-950/20 border border-indigo-500/20 text-indigo-300 font-mono' 
                        : 'bg-slate-950/40 border border-slate-800/60 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-slate-300">
                        {author?.display_name || 'System'}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(c.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div>{c.content}</div>
                  </div>
                );
              })}
              <div ref={commentsEndRef} />
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                placeholder="코드리뷰 피드백 남기기..."
                value={newCommentText}
                onChange={e => setNewCommentText(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button 
                type="submit" 
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            상태 변경:
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onUpdateStatus(issue.id, 'resolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                issue.status === 'resolved' 
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => onUpdateStatus(issue.id, 'in_progress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                issue.status === 'in_progress' 
                  ? 'bg-amber-600/20 border-amber-500/40 text-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => onUpdateStatus(issue.id, 'dismissed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                issue.status === 'dismissed' 
                  ? 'bg-red-600/20 border-red-500/40 text-red-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Dismissed
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
