import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { type Project } from '../supabase';
import { useAppContext } from '../context/AppContext';
import { FileDropZone } from './uploader/FileDropZone';
import { AnalysisProgress } from './uploader/AnalysisProgress';
import { StagedFilesList } from './uploader/StagedFilesList';
import { useAnalysis } from './uploader/useAnalysis';

export const Uploader: React.FC = () => {
  const {
    selectedProject,
    handleAnalysisComplete,
    session,
    projects,
    setSelectedProject,
    setProjects,
    aiProvider
  } = useAppContext();

  const onProjectCreated = (newProj: Project) => {
    setProjects(prev => [newProj, ...prev]);
    if (setSelectedProject) setSelectedProject(newProj);
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
