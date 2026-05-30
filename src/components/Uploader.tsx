import React, { useState } from 'react';
import { FolderOpen, FileCode, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { getSupabaseClient, type Issue, type Project } from '../supabase';
import { analyzeCodeWithGemini } from '../geminiAnalyzer';

interface UploaderProps {
  selectedProject: Project | null;
  onAnalysisComplete: (newIssues: Issue[]) => void;
  session?: any;
  projects?: Project[];
  onProjectCreated?: (newProj: Project) => void;
  onProjectSelected?: (proj: Project) => void;
}

export const Uploader: React.FC<UploaderProps> = ({
  selectedProject,
  onAnalysisComplete,
  session,
  projects,
  onProjectCreated,
  onProjectSelected
}) => {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFilesCount, setTotalFilesCount] = useState(0);
  const [currentScanningFile, setCurrentScanningFile] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // webkitdirectory 속성이 동작할 수 있도록 커스텀 Props 타입 우회
  const inputProps = {
    webkitdirectory: "",
    directory: "",
    multiple: true
  } as React.InputHTMLAttributes<HTMLInputElement>;

  const performFolderAnalysis = async (allFiles: FileList) => {
    // 1. 지원 가능한 다국어 소스코드 확장자 파일 필터링
    const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.h', '.cs', '.java', '.py', '.go', '.js', '.jsx', '.ts', '.tsx'];
    const filesToAnalyze = Array.from(allFiles).filter(file => {
      const name = file.name.toLowerCase();
      return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
    });

    if (filesToAnalyze.length === 0) {
      setErrorMsg('선택하신 폴더 내에 지원하는 프로그래밍 언어의 소스코드 파일이 존재하지 않습니다. (C, C++, C#, Python, Go, Java, JS, TS 지원)');
      return;
    }

    setUploadStatus('uploading');
    setProgress(5);
    setErrorMsg('');
    setTotalFilesCount(filesToAnalyze.length);

    try {
      // 2. 파일의 webkitRelativePath 로부터 최상위 폴더 명 추출
      let folderName = 'Local Project';
      const sampleFile = filesToAnalyze.find(f => f.webkitRelativePath);
      if (sampleFile && sampleFile.webkitRelativePath) {
        const parts = sampleFile.webkitRelativePath.split('/');
        if (parts.length > 0 && parts[0]) {
          folderName = parts[0];
        }
      }

      const supabase = getSupabaseClient();
      let activeProjId = selectedProject?.id || '';

      // 3. 폴더명 기반 프로젝트 자동 매핑 / 생성
      setProgress(15);
      const existingProj = projects?.find(p => p.name === folderName);
      
      if (existingProj) {
        activeProjId = existingProj.id;
        if (onProjectSelected) onProjectSelected(existingProj);
        console.log(`Matched existing project: ${folderName}`);
      } else if (supabase) {
        // 새 프로젝트 생성
        const newProjId = crypto.randomUUID();
        const mainLanguage = filesToAnalyze[0]?.name.split('.').pop()?.toUpperCase() || 'Multi';
        
        const newProj: Project = {
          id: newProjId,
          name: folderName,
          description: `로컬 폴더 '${folderName}' 선택을 통해 자동 매핑된 프로젝트`,
          owner_id: session?.user?.id || 'usr-1',
          language: mainLanguage,
          repo_url: 'https://github.com',
          status: 'active',
          total_issues: 0,
          open_issues: 0,
          created_at: new Date().toISOString()
        };

        const { error: insertProjError } = await supabase
          .from('projects')
          .insert(newProj);

        if (insertProjError) throw insertProjError;

        activeProjId = newProjId;
        if (onProjectCreated) onProjectCreated(newProj);
        console.log(`Created new project: ${folderName}`);
      } else {
        // 데모 시뮬레이션 프로젝트 생성
        const mockProj: Project = {
          id: `prj-${Date.now()}`,
          name: folderName,
          description: `[데모] 로컬 폴더 '${folderName}' 기반 가상 프로젝트`,
          owner_id: 'usr-1',
          language: 'Multi',
          repo_url: 'https://github.com',
          status: 'active',
          total_issues: 0,
          open_issues: 0,
          created_at: new Date().toISOString()
        };
        activeProjId = mockProj.id;
        if (onProjectCreated) onProjectCreated(mockProj);
      }

      // 4. Supabase에 analysis_runs 레코드 삽입 (상태: running)
      setProgress(25);
      const runId = crypto.randomUUID();
      
      if (supabase) {
        const { error: runError } = await supabase
          .from('analysis_runs')
          .insert({
            id: runId,
            project_id: activeProjId,
            triggered_by: session?.user?.id || 'usr-1',
            status: 'running',
            source_type: 'upload',
            total_files: filesToAnalyze.length,
            file_storage_path: `code-uploads/${activeProjId}/${runId}/${folderName}`
          });
        if (runError) throw runError;
      }

      setUploadStatus('analyzing');
      const allDetectedIssues: Issue[] = [];

      // 5. 각 소스코드 파일 순차 스캔 루프 돌기
      for (let i = 0; i < filesToAnalyze.length; i++) {
        const file = filesToAnalyze[i];
        setCurrentFileIndex(i + 1);
        setCurrentScanningFile(file.name);
        
        // 현재 파일의 진행도 갱신 (30% ~ 85%)
        const currentProgress = 30 + Math.floor((i / filesToAnalyze.length) * 55);
        setProgress(currentProgress);

        // 파일 텍스트 추출
        const codeContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string || '');
          reader.onerror = (err) => reject(err);
          reader.readAsText(file);
        });

        try {
          // Gemini API 스캔
          const detectedIssues = await analyzeCodeWithGemini(
            file.name,
            codeContent,
            activeProjId,
            runId
          );
          allDetectedIssues.push(...detectedIssues);
        } catch (scanErr) {
          console.warn(`File analysis failed for ${file.name}, skipping.`, scanErr);
        }
      }

      setProgress(85);
      setCurrentScanningFile('Supabase DB 결과 갱신 중...');

      // 6. 감지된 이슈들을 Supabase DB에 일괄 저장
      if (supabase) {
        if (allDetectedIssues.length > 0) {
          const { error: issuesError } = await supabase
            .from('issues')
            .insert(
              allDetectedIssues.map(issue => ({
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

        // 7. analysis_runs 통계 산출 및 최종 갱신
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        allDetectedIssues.forEach(i => {
          counts[i.severity as keyof typeof counts]++;
        });

        const { error: updateRunError } = await supabase
          .from('analysis_runs')
          .update({
            status: 'completed',
            analyzed_files: filesToAnalyze.length,
            issues_found: allDetectedIssues.length,
            critical_count: counts.critical,
            high_count: counts.high,
            medium_count: counts.medium,
            low_count: counts.low,
            info_count: counts.info,
            completed_at: new Date().toISOString()
          })
          .eq('id', runId);

        if (updateRunError) throw updateRunError;

        // 8. projects 통계 업데이트
        const { error: updateProjectError } = await supabase
          .from('projects')
          .update({
            total_issues: allDetectedIssues.length,
            open_issues: allDetectedIssues.length
          })
          .eq('id', activeProjId);

        if (updateProjectError) throw updateProjectError;

      } else {
        // 데모 모드 스캔 마무리 지연 효과 연출
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setProgress(100);
      setUploadStatus('done');
      onAnalysisComplete(allDetectedIssues);

    } catch (err: any) {
      console.error("Folder analysis pipeline error:", err);
      setErrorMsg(err.message || '폴더 분석 수행 중 오류가 발생했습니다.');
      setUploadStatus('idle');
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      performFolderAnalysis(files);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-xl animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">실시간 Gemini 3.5 AI 폴더 정밀 분석</h3>
        <span className="text-xs text-slate-500">탐색기 폴더 단위 업로드</span>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      {uploadStatus === 'idle' ? (
        <div
          className="border-2 border-dashed border-slate-800 hover:border-slate-700/80 hover:bg-slate-900/10 rounded-2xl p-10 text-center cursor-pointer transition-all duration-300"
          onClick={() => document.getElementById('folder-input')?.click()}
        >
          {/* 폴더 선택 전용 Input */}
          <input
            id="folder-input"
            type="file"
            className="hidden"
            onChange={handleFolderChange}
            {...inputProps}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="p-3.5 bg-slate-900/60 rounded-xl text-indigo-400 border border-slate-800/80 shadow-[0_0_15px_0_rgba(99,102,241,0.1)]">
              <FolderOpen size={28} />
            </div>
            <div>
              <p className="text-xs text-slate-300 font-semibold">
                분석할 로컬 프로젝트 폴더를 선택하세요
              </p>
              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                폴더 내의 소스코드 파일들을 자동 분류하여 순차 진단하고,<br />
                **폴더 이름을 감지하여 대시보드 프로젝트로 자동 등록**합니다.
              </p>
            </div>
            <button className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all">
              로컬 폴더 선택하기
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-slate-800/80 rounded-2xl p-6 bg-slate-950/20 shadow-inner">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-slate-800/80 rounded-xl text-indigo-400">
              <FileCode size={22} className={uploadStatus !== 'done' ? 'animate-pulse' : ''} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-300 truncate max-w-[220px]">
                  {uploadStatus === 'analyzing' 
                    ? `[${currentFileIndex}/${totalFilesCount}] ${currentScanningFile}`
                    : currentScanningFile || '폴더 분류 작업 중...'
                  }
                </div>
                <div className="text-[10px] font-bold text-indigo-400 capitalize flex items-center gap-1.5">
                  {uploadStatus === 'uploading' && (
                    <>
                      <RefreshCw size={10} className="animate-spin" />
                      폴더 매핑 중
                    </>
                  )}
                  {uploadStatus === 'analyzing' && (
                    <>
                      <RefreshCw size={10} className="animate-spin text-indigo-400" />
                      Gemini 3.5 결함 스캔 중
                    </>
                  )}
                  {uploadStatus === 'done' && (
                    <>
                      <CheckCircle size={10} className="text-emerald-400" />
                      완료
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
                {uploadStatus === 'uploading' && '프로젝트 및 빌드 런 구성 요소를 분석하는 중입니다.'}
                {uploadStatus === 'analyzing' && '코드에 포함된 보안 허점과 리스크를 Gemini가 자율 진단하는 중입니다.'}
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
              다른 폴더 추가 진단
            </button>
          )}
        </div>
      )}
    </div>
  );
};
