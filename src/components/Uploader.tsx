import React, { useState } from 'react';
import { UploadCloud, File, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { getSupabaseClient, type Issue, type Project } from '../supabase';
import { analyzeCodeWithGemini } from '../geminiAnalyzer';

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
  const [errorMsg, setErrorMsg] = useState('');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const performRealAnalysis = async (file: File) => {
    setFileName(file.name);
    setUploadStatus('uploading');
    setProgress(10);
    setErrorMsg('');

    try {
      // 1. 파일의 소스코드 텍스트 내용 읽기
      const codeContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
      });

      setProgress(30);
      setUploadStatus('analyzing');

      const supabase = getSupabaseClient();
      
      // Supabase & Gemini 키 입력 유무 검증 및 시뮬레이션 전환 조건 정의
      if (!supabase) {
        console.warn("Supabase connection info missing, running with local simulation.");
        runSimulation(file.name);
        return;
      }

      // 2. Supabase에 analysis_runs 레코드 삽입 (상태: running)
      setProgress(40);
      const runId = crypto.randomUUID();
      const { error: runError } = await supabase
        .from('analysis_runs')
        .insert({
          id: runId,
          project_id: selectedProject?.id,
          triggered_by: 'usr-1', // Default Admin
          status: 'running',
          source_type: 'upload',
          file_storage_path: `code-uploads/${selectedProject?.id}/${runId}/${file.name}`
        })
        .select();

      if (runError) throw runError;

      // 3. Gemini API를 이용한 코드 취약점 & 결함 진단 가동
      setProgress(60);
      const detectedIssues = await analyzeCodeWithGemini(
        file.name,
        codeContent,
        selectedProject?.id || 'prj-1',
        runId
      );

      // 4. 분석 결과(이슈)들을 Supabase DB에 대량 삽입
      setProgress(85);
      if (detectedIssues.length > 0) {
        const { error: issuesError } = await supabase
          .from('issues')
          .insert(
            detectedIssues.map(issue => ({
              project_id: issue.project_id,
              analysis_run_id: issue.analysis_run_id,
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
            }))
          );
        if (issuesError) throw issuesError;
      }

      // 5. 통계 산출 및 analysis_runs 완료 갱신
      setProgress(95);
      const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      detectedIssues.forEach(i => {
        counts[i.severity as keyof typeof counts]++;
      });

      const { error: updateRunError } = await supabase
        .from('analysis_runs')
        .update({
          status: 'completed',
          issues_found: detectedIssues.length,
          critical_count: counts.critical,
          high_count: counts.high,
          medium_count: counts.medium,
          low_count: counts.low,
          info_count: counts.info,
          completed_at: new Date().toISOString()
        })
        .eq('id', runId);

      if (updateRunError) throw updateRunError;

      // 6. 프로젝트의 전체 이슈 개수 정보 캐시 업데이트
      const { error: updateProjectError } = await supabase
        .from('projects')
        .update({
          total_issues: (selectedProject?.total_issues || 0) + detectedIssues.length,
          open_issues: (selectedProject?.open_issues || 0) + detectedIssues.length
        })
        .eq('id', selectedProject?.id);

      if (updateProjectError) throw updateProjectError;

      setProgress(100);
      setUploadStatus('done');
      onAnalysisComplete(detectedIssues);

    } catch (err: any) {
      console.error("Real analysis failed:", err);
      setErrorMsg(err.message || '분석 과정 중 연결 오류가 발생했습니다.');
      setUploadStatus('idle');
    }
  };

  // 백업 시뮬레이션용 모킹 로직
  const runSimulation = (name: string) => {
    setProgress(50);
    setTimeout(() => {
      setProgress(90);
    }, 1500);

    setTimeout(() => {
      setProgress(100);
      setUploadStatus('done');
      
      const simulationIssues: Issue[] = [
        {
          id: `iss-sim-${Date.now()}-1`,
          project_id: selectedProject?.id || 'prj-1',
          analysis_run_id: `run-sim-${Date.now()}`,
          title: 'Hardcoded AWS Credential 검출 [시뮬레이션]',
          description: '자격 증명 설정 파일 내부에 AWS Access Key가 감지되었습니다.',
          suggestion: `// AS-IS\nconst key = "AKIAEXAMPLE";\n\n// TO-BE\nconst key = process.env.AWS_KEY;`,
          rule_id: 'security/credentials-leak',
          severity: 'critical',
          category: 'security',
          priority_score: 95,
          file_path: name,
          line_start: 5,
          line_end: 10,
          code_snippet: `const accessKey = "AKIAEXAMPLESECRET";`,
          status: 'open',
          assignee_id: null,
          resolved_by: null,
          resolved_at: null,
          created_at: new Date().toISOString()
        }
      ];

      onAnalysisComplete(simulationIssues);
    }, 3000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      performRealAnalysis(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      performRealAnalysis(files[0]);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-xl animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">실시간 Gemini AI 코드 정밀 진단</h3>
        <span className="text-xs text-slate-500">JS, TS, PY, GO, JAVA 지원</span>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      {!selectedProject ? (
        <div className="text-center py-10 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
          왼쪽 프로젝트 목록에서 대상 프로젝트를 선택해 주세요.
        </div>
      ) : uploadStatus === 'idle' ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
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
          />
          <div className="flex flex-col items-center gap-3">
            <div className="p-3.5 bg-slate-900/60 rounded-xl text-indigo-400 border border-slate-800/80 shadow-[0_0_15px_0_rgba(99,102,241,0.1)]">
              <UploadCloud size={28} />
            </div>
            <div>
              <p className="text-xs text-slate-300 font-semibold">
                분석할 소스코드 파일을 올려놓거나 선택하세요
              </p>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Gemini 2.5 Pro/Flash 모델이 구문 분석(AST), 취약점 위협 식별,<br />
                그리고 TO-BE 개선 추천 코드를 실시간 인출합니다.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-slate-800/80 rounded-2xl p-6 bg-slate-950/20 shadow-inner">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-slate-800/80 rounded-xl text-slate-400">
              <File size={22} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-300 truncate max-w-[200px]">
                  {fileName}
                </div>
                <div className="text-[10px] font-bold text-indigo-400 capitalize flex items-center gap-1.5">
                  {uploadStatus === 'uploading' && (
                    <>
                      <RefreshCw size={10} className="animate-spin" />
                      업로드 진행 중
                    </>
                  )}
                  {uploadStatus === 'analyzing' && (
                    <>
                      <RefreshCw size={10} className="animate-spin text-indigo-400" />
                      Gemini 결함 모델 스캔 중...
                    </>
                  )}
                  {uploadStatus === 'done' && (
                    <>
                      <CheckCircle size={10} className="text-emerald-400" />
                      스캔 대성공
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Status details */}
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <AlertCircle size={12} />
                {uploadStatus === 'uploading' && '클라우드 연동 버킷 자산 빌드 중'}
                {uploadStatus === 'analyzing' && 'Gemini LLM 정적 분석 추론 수행 및 SQL 갱신 중'}
                {uploadStatus === 'done' && (
                  <span className="text-emerald-400 font-semibold">
                    분석 완료되었습니다. 대시보드를 새로고침합니다.
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {uploadStatus === 'done' && (
            <button
              onClick={() => setUploadStatus('idle')}
              className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-semibold transition-all"
            >
              새로운 파일 추가 진단
            </button>
          )}
        </div>
      )}
    </div>
  );
};
