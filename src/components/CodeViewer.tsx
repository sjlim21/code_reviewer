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
  Sparkles
} from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';


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
  }, [issue]);

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
      <div className="w-full lg:w-7/12 bg-slate-900 border-l border-slate-800 h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${getSeverityBadge(issue.severity)}`}>
              {issue.severity}
            </span>
            <h2 className="text-lg font-bold text-slate-200">{issue.title}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all"
          >
            <X size={18} />
          </button>
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
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <ShieldAlert className="text-red-400" size={16} />
              검출된 취약 코드 원문 (AS-IS)
            </h3>
            <div className="rounded-xl overflow-hidden border border-slate-800/60 bg-slate-950">
              <div className="bg-slate-900 px-4 py-2 text-xs text-slate-500 font-mono border-b border-slate-800/60">
                {issue.file_path}
              </div>
              <pre className="p-4 overflow-x-auto text-xs m-0">
                <code className={`language-${issue.file_path.endsWith('.py') ? 'python' : 'typescript'}`}>
                  {issue.code_snippet}
                </code>
              </pre>
            </div>
          </div>

          {/* AI Suggestion Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Sparkles className="text-indigo-400" size={16} />
                AI 개선 가이드 (TO-BE Suggestion)
              </h3>
              
              {/* Fix button - 보안 권고로 인한 비활성화 */}
              {issue.status !== 'resolved' && (
                <button
                  disabled={true}
                  className="bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all"
                  title="보안 권고: 구문 손상 방지 및 안전한 코드 검토를 위해 코드 자동 수정 기능이 완전히 비활성화되었습니다."
                >
                  <GitCommit size={14} />
                  자동 수정 비활성화됨
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-xl overflow-hidden border border-slate-800/60 bg-slate-950">
                <div className="bg-indigo-950/20 px-4 py-2 text-xs text-indigo-400 font-semibold border-b border-slate-800/60 flex items-center gap-2">
                  <Sparkles size={12} />
                  Claude-3.5-Sonnet 자동 개선 코드 제안
                </div>
                <pre className="p-4 overflow-x-auto text-xs m-0">
                  <code className={`language-${issue.file_path.endsWith('.py') ? 'python' : 'typescript'}`}>
                    {issue.suggestion}
                  </code>
                </pre>
              </div>
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
