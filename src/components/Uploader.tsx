import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { type Project, type Issue } from '../supabase';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
import { useIssueStore } from '../stores/issueStore';
import { useUiStore } from '../stores/uiStore';
import { FileDropZone } from './uploader/FileDropZone';
import { AnalysisProgress } from './uploader/AnalysisProgress';
import { StagedFilesList } from './uploader/StagedFilesList';
import { useAnalysis } from './uploader/useAnalysis';

const deobfuscateStr = (str: string): string => {
  if (!str) return '';
  try { return decodeURIComponent(atob(str)); } catch { return ''; }
};

export const Uploader: React.FC = () => {
  const { session } = useAuthStore();
  const { selectedProject, projects, setSelectedProject, setProjects } = useProjectStore();
  const { issues, setIssues } = useIssueStore();
  const { aiProvider, setActiveTab, addLog } = useUiStore();

  const onProjectCreated = (newProj: Project) => {
    setProjects([newProj, ...projects]);
    setSelectedProject(newProj);
  };

  const handleAnalysisComplete = (newIssues: Issue[]) => {
    setIssues([...newIssues, ...issues].sort((a, b) => b.priority_score - a.priority_score));
    setActiveTab('dashboard');
    addLog(`[진단 완료] 정적 진단이 완료되었습니다. (감지된 결함: ${newIssues.length}건)`, 'success');

    if (newIssues.length > 0) {
      const slack = deobfuscateStr(sessionStorage.getItem('code_eye_slack_webhook_url') || '');
      const discord = deobfuscateStr(sessionStorage.getItem('code_eye_discord_webhook_url') || '');
      if (slack || discord) {
        addLog('[웹훅 연동] 새로운 취약점 발견 알림 웹훅 전송 시작...', 'info');
        const payload = JSON.stringify({ text: `[CodeEye] 분석 완료: ${newIssues.length}건 취약점 감지` });
        if (slack) {
          fetch(slack, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
            .then(() => addLog(`[웹훅 연동] Slack 채널로 분석 알림 전송 완료 (${newIssues.length}건 감지)`, 'success'))
            .catch((e) => addLog(`[웹훅 연동] Slack 알림 전송 실패: ${String(e)}`, 'error'));
        }
        if (discord) {
          fetch(discord, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
            .then(() => addLog(`[웹훅 연동] Discord 채널로 분석 알림 전송 완료 (${newIssues.length}건 감지)`, 'success'))
            .catch((e) => addLog(`[웹훅 연동] Discord 알림 전송 실패: ${String(e)}`, 'error'));
        }
      }
    }
  };

  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const {
    uploadStatus,
    progress,
    currentFileIndex,
    totalFilesCount,
    currentScanningFile,
    errorMsg,
    setErrorMsg,
    performFolderAnalysis,
    resetStatus,
  } = useAnalysis({
    selectedProject,
    session,
    projects,
    aiProvider,
    onProjectSelected: setSelectedProject,
    onProjectCreated,
    onAnalysisComplete: (issues) => {
      setStagedFiles([]);
      handleAnalysisComplete(issues);
    },
  });

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-xl animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">실시간 CodeEye 로컬 폴더 정밀 분석</h3>
        <span className="text-xs text-slate-500">탐색기 폴더 단위 업로드</span>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      {uploadStatus === 'idle' ? (
        stagedFiles.length > 0 ? (
          <StagedFilesList
            stagedFiles={stagedFiles}
            onClear={() => setStagedFiles([])}
            onStartAnalysis={performFolderAnalysis}
          />
        ) : (
          <FileDropZone
            onFilesSelected={(files) => { setErrorMsg(''); setStagedFiles(files); }}
            isAnalyzing={false}
          />
        )
      ) : (
        <AnalysisProgress
          uploadStatus={uploadStatus as 'uploading' | 'analyzing' | 'done'}
          progress={progress}
          currentFileIndex={currentFileIndex}
          totalFilesCount={totalFilesCount}
          currentScanningFile={currentScanningFile}
          onReset={resetStatus}
        />
      )}
    </div>
  );
};
