import React, { useState } from 'react';
import { UploadCloud, File, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import type { Issue, Project } from '../supabase';

interface UploaderProps {
  selectedProject: Project | null;
  onAnalysisComplete: (newIssues: Issue[]) => void;
}

export const Uploader: React.FC<UploaderProps> = ({
  selectedProject,
  onAnalysisComplete
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const startMockAnalysis = (name: string) => {
    setFileName(name);
    setUploadStatus('uploading');
    setProgress(15);

    // 1. Uploading logic
    setTimeout(() => {
      setProgress(45);
      setUploadStatus('analyzing');
    }, 1500);

    // 2. Analyzing logic
    let currentProgress = 45;
    const interval = setInterval(() => {
      currentProgress += 10;
      if (currentProgress >= 95) {
        clearInterval(interval);
      } else {
        setProgress(currentProgress);
      }
    }, 400);

    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setUploadStatus('done');
      
      // 3. Mock Issues generated based on analysis
      const runId = `run-${Date.now()}`;
      const generatedIssues: Issue[] = [
        {
          id: `iss-new-1`,
          project_id: selectedProject?.id || 'prj-1',
          analysis_run_id: runId,
          title: 'Hardcoded AWS Secret Access Key 검출',
          description: '설정 파일 또는 소스코드 내부에 AWS Access Key ID 및 Secret Access Key가 플레인 텍스트 형식으로 검출되었습니다. 이는 소스 레포지토리가 유출될 시 심각한 클라우드 해킹 공격을 초래할 수 있습니다.',
          suggestion: `// AS-IS
const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
};

// TO-BE
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};`,
          rule_id: 'security/hardcoded-aws-credential',
          severity: 'critical',
          category: 'security',
          priority_score: 98,
          file_path: 'config/aws.js',
          line_start: 3,
          line_end: 8,
          code_snippet: `// AWS Client Configuration
export const clientConfig = {
  region: "ap-northeast-2",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
};`,
          status: 'open',
          assignee_id: null,
          resolved_by: null,
          resolved_at: null,
          created_at: new Date().toISOString()
        },
        {
          id: `iss-new-2`,
          project_id: selectedProject?.id || 'prj-1',
          analysis_run_id: runId,
          title: '비암호화 민감 세션 전송 (HTTP)',
          description: '쿠키 플래그 설정 중 Secure 속성이 지정되지 않아 세션 토큰이 암호화되지 않은 HTTP 프로토콜로 전송되어 패킷 스니핑 위협에 취약합니다.',
          suggestion: `// AS-IS
res.cookie('sessionId', id, { httpOnly: true });

// TO-BE
res.cookie('sessionId', id, { httpOnly: true, secure: true });`,
          rule_id: 'security/cookie-secure-missing',
          severity: 'medium',
          category: 'security',
          priority_score: 62,
          file_path: 'src/controllers/session.ts',
          line_start: 78,
          line_end: 82,
          code_snippet: `export const setSession = (res: Response, id: string) => {
  // Missing secure flag for production
  res.cookie('session_token', id, {
    httpOnly: true,
    maxAge: 3600000
  });
};`,
          status: 'open',
          assignee_id: null,
          resolved_by: null,
          resolved_at: null,
          created_at: new Date().toISOString()
        }
      ];

      onAnalysisComplete(generatedIssues);
    }, 4000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      startMockAnalysis(files[0].name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      startMockAnalysis(files[0].name);
    }
  };

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">신규 코드 업로드 및 분석</h3>
        <span className="text-xs text-slate-500">ZIP, JS, TS, PY 파일 지원</span>
      </div>

      {!selectedProject ? (
        <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
          왼쪽 프로젝트 목록에서 대상 프로젝트를 먼저 선택해 주세요.
        </div>
      ) : uploadStatus === 'idle' ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragOver 
              ? 'border-indigo-500 bg-indigo-500/5' 
              : 'border-slate-800 hover:border-slate-700/80 hover:bg-slate-900/10'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".zip,.js,.ts,.py"
          />
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-slate-800/60 rounded-full text-indigo-400">
              <UploadCloud size={28} />
            </div>
            <div>
              <p className="text-xs text-slate-300 font-medium">
                파일을 드래그해서 올려놓거나 클릭하여 업로드
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                코드 메타데이터 추출 및 AI 취약점 정밀 진단 즉시 수행
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-slate-800/80 rounded-xl p-6 bg-slate-950/20">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-slate-800/80 rounded-lg text-slate-400">
              <File size={22} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-300 truncate max-w-[200px]">
                  {fileName}
                </div>
                <div className="text-[10px] font-medium text-indigo-400 capitalize flex items-center gap-1.5">
                  {uploadStatus === 'uploading' && (
                    <>
                      <RefreshCw size={10} className="animate-spin" />
                      업로드 중...
                    </>
                  )}
                  {uploadStatus === 'analyzing' && (
                    <>
                      <RefreshCw size={10} className="animate-spin" />
                      코드 분석 파이프라인 가동 중...
                    </>
                  )}
                  {uploadStatus === 'done' && (
                    <>
                      <CheckCircle size={10} className="text-emerald-400" />
                      분석 완료
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800/60 rounded-full h-1.5">
                <div 
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Status details */}
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <AlertCircle size={12} />
                {uploadStatus === 'uploading' && '코드를 수집하여 저장소 백업 구성 중'}
                {uploadStatus === 'analyzing' && 'Linter 검사 및 Claude 3.5 보안 취약점 대조 중'}
                {uploadStatus === 'done' && (
                  <span className="text-emerald-400 font-semibold">
                    성공: 2개의 신규 이슈가 검출되었습니다. 대시보드를 확인하세요.
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {uploadStatus === 'done' && (
            <button
              onClick={() => setUploadStatus('idle')}
              className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded-lg text-xs font-semibold transition-all"
            >
              다시 업로드하기
            </button>
          )}
        </div>
      )}
    </div>
  );
};
