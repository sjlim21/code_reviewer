import { useState } from 'react';
import { getSupabaseClient, type Issue, type Project } from '../../supabase';
import { analyzeCodeWithGemini, triageByConfidence } from '../../geminiAnalyzer';
import { analyzeCodeWithClaude } from '../../claudeAnalyzer';
import { getValidationStatus } from './StagedFilesList';

interface UseAnalysisOptions {
  selectedProject: Project | null;
  session: { user?: { id?: string | undefined } | null; provider_token?: string | null | undefined } | null;
  projects: Project[];
  aiProvider: string;
  onProjectSelected: ((project: Project) => void) | null;
  onProjectCreated: (project: Project) => void;
  onAnalysisComplete: (issues: Issue[]) => void;
}

export const useAnalysis = ({
  selectedProject,
  session,
  projects,
  aiProvider,
  onProjectSelected,
  onProjectCreated,
  onAnalysisComplete,
}: UseAnalysisOptions) => {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFilesCount, setTotalFilesCount] = useState(0);
  const [currentScanningFile, setCurrentScanningFile] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const performFolderAnalysis = async (filesList: File[]) => {
    const filesToAnalyze = filesList.filter(file => getValidationStatus(file).valid);

    if (filesToAnalyze.length === 0) {
      setErrorMsg('분석 가능한 코드 파일이 존재하지 않거나 모두 2MB를 초과했습니다.');
      return;
    }

    const totalBytes = filesToAnalyze.reduce((acc, f) => acc + f.size, 0);
    const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
    if (totalBytes > MAX_TOTAL_BYTES) {
      setErrorMsg(`프로젝트 전체 크기(${(totalBytes / 1024 / 1024).toFixed(1)}MB)가 브라우저 분석 한도(10MB)를 초과합니다. 일부 파일을 제외하거나 CLI를 사용해 주세요.`);
      return;
    }

    setUploadStatus('uploading');
    setProgress(5);
    setErrorMsg('');
    setTotalFilesCount(filesToAnalyze.length);

    let activeProjId = selectedProject?.id || '';
    let isNewProjectCreated = false;
    let runId: string | null = null;

    try {
      let folderName = 'Local Project';
      const sampleFile = filesToAnalyze.find(f => f.webkitRelativePath);
      if (sampleFile && sampleFile.webkitRelativePath) {
        const parts = sampleFile.webkitRelativePath.split('/');
        if (parts.length > 0 && parts[0]) folderName = parts[0];
      }

      const supabase = getSupabaseClient();
      if (supabase && !session?.user?.id) {
        throw new Error("분석을 수행하려면 로그인 세션이 필요합니다.");
      }
      activeProjId = selectedProject?.id || '';
      isNewProjectCreated = false;

      setProgress(15);
      const existingProj = projects?.find(p => p.name === folderName);

      if (existingProj) {
        activeProjId = existingProj.id;
        if (onProjectSelected) onProjectSelected(existingProj);
        console.log(`Matched existing project: ${folderName}`);
      } else if (supabase) {
        const newProjId = crypto.randomUUID();
        const mainLanguage = filesToAnalyze[0]?.name.split('.').pop()?.toUpperCase() || 'Multi';
        const newProj: Project = {
          id: newProjId,
          name: folderName,
          description: `로컬 폴더 '${folderName}' 선택을 통해 자동 매핑된 프로젝트`,
          owner_id: session?.user?.id || 'demo-user',
          language: mainLanguage,
          repo_url: 'https://github.com',
          status: 'active',
          total_issues: 0,
          open_issues: 0,
          created_at: new Date().toISOString()
        };
        const { error: insertProjError } = await supabase.from('projects').insert(newProj);
        if (insertProjError) throw insertProjError;
        activeProjId = newProjId;
        isNewProjectCreated = true;
        if (onProjectCreated) onProjectCreated(newProj);
        console.log(`Created new project: ${folderName}`);
      } else {
        const mockProj: Project = {
          id: `prj-${Date.now()}`,
          name: folderName,
          description: `[데모] 로컬 폴더 '${folderName}' 기반 가상 프로젝트`,
          owner_id: 'demo-user',
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

      setProgress(25);
      runId = crypto.randomUUID();

      if (supabase) {
        const { error: runError } = await supabase.from('analysis_runs').insert({
          id: runId,
          project_id: activeProjId,
          triggered_by: session?.user?.id || 'demo-user',
          status: 'running',
          source_type: 'upload',
          total_files: filesToAnalyze.length,
          file_storage_path: `code-uploads/${activeProjId}/${runId}/${folderName}`
        });
        if (runError) {
          if (isNewProjectCreated) {
            console.warn(`Deleting project ${activeProjId} due to analysis run creation failure.`);
            await supabase.from('projects').delete().eq('id', activeProjId);
          }
          throw runError;
        }
      }

      setUploadStatus('analyzing');
      const allDetectedIssues: Issue[] = [];

      let completedCount = 0;
      const scanFile = async (file: File) => {
        try {
          let codeContent: string | null = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string || '');
            reader.onerror = (err) => reject(err);
            reader.readAsText(file);
          });

          const detectedIssues = aiProvider === 'claude'
            ? await analyzeCodeWithClaude(file.name, codeContent, activeProjId, runId || '')
            : await analyzeCodeWithGemini(file.name, codeContent, activeProjId, runId || '', session?.provider_token || undefined);

          codeContent = null;
          allDetectedIssues.push(...detectedIssues);
        } catch (scanErr) {
          console.error(`File analysis failed for ${file.name}:`, scanErr);
          const errMsg = scanErr instanceof Error ? scanErr.message : String(scanErr);
          throw new Error(`파일 스캔 실패 (${file.name}): ${errMsg}`, { cause: scanErr });
        } finally {
          completedCount++;
          setCurrentFileIndex(completedCount);
          setCurrentScanningFile(file.name);
          const currentProgress = 30 + Math.floor((completedCount / filesToAnalyze.length) * 55);
          setProgress(currentProgress);
        }
      };

      const concurrencyLimit = 4;
      const executing = new Set<Promise<void>>();
      for (const file of filesToAnalyze) {
        const p: Promise<void> = scanFile(file).then(() => { executing.delete(p); });
        executing.add(p);
        if (executing.size >= concurrencyLimit) await Promise.race(executing);
      }
      await Promise.all(executing);

      setProgress(85);
      setCurrentScanningFile('Supabase DB 결과 갱신 중...');

      if (supabase) {
        // Apply confidence-based auto-triage before persisting
        const issuesToInsert = triageByConfidence(allDetectedIssues);

        if (issuesToInsert.length > 0) {
          const { error: issuesError } = await supabase.from('issues').insert(
            issuesToInsert.map(issue => ({
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
              status: issue.status,
              confidence_score: issue.confidence_score ?? null,
              human_review_required: issue.human_review_required ?? false
            }))
          );
          if (issuesError) throw issuesError;
        }

        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        allDetectedIssues.forEach(i => { counts[i.severity as keyof typeof counts]++; });

        const { error: updateRunError } = await supabase.from('analysis_runs').update({
          status: 'completed',
          analyzed_files: filesToAnalyze.length,
          issues_found: allDetectedIssues.length,
          critical_count: counts.critical,
          high_count: counts.high,
          medium_count: counts.medium,
          low_count: counts.low,
          info_count: counts.info,
          completed_at: new Date().toISOString()
        }).eq('id', runId);
        if (updateRunError) throw updateRunError;

        const { error: updateProjectError } = await supabase.from('projects').update({
          total_issues: allDetectedIssues.length,
          open_issues: allDetectedIssues.length
        }).eq('id', activeProjId);
        if (updateProjectError) throw updateProjectError;
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setProgress(100);
      setUploadStatus('done');
      onAnalysisComplete(allDetectedIssues);

    } catch (err: unknown) {
      console.error("Folder analysis pipeline error:", err);
      const errorMessage = err instanceof Error ? err.message : '폴더 분석 수행 중 오류가 발생했습니다.';
      setErrorMsg(errorMessage);
      setUploadStatus('idle');

      const supabase = getSupabaseClient();
      if (supabase && runId) {
        try {
          await supabase.from('analysis_runs').update({
            status: 'failed',
            completed_at: new Date().toISOString()
          }).eq('id', runId);

          if (isNewProjectCreated && activeProjId) {
            console.warn(`Deleting project ${activeProjId} due to analysis run failure.`);
            await supabase.from('projects').delete().eq('id', activeProjId);
          }
        } catch (dbErr) {
          console.error("Failed to update failed status in Supabase:", dbErr);
        }
      }
    }
  };

  const resetStatus = () => setUploadStatus('idle');

  return {
    uploadStatus,
    progress,
    currentFileIndex,
    totalFilesCount,
    currentScanningFile,
    errorMsg,
    setErrorMsg,
    performFolderAnalysis,
    resetStatus,
  };
};
