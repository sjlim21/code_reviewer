import React from 'react';
import { FileCode, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

interface AnalysisProgressProps {
  uploadStatus: 'uploading' | 'analyzing' | 'done';
  progress: number;
  currentFileIndex: number;
  totalFilesCount: number;
  currentScanningFile: string;
  onReset: () => void;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  uploadStatus,
  progress,
  currentFileIndex,
  totalFilesCount,
  currentScanningFile,
  onReset,
}) => {
  return (
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
                  로컬 보안 결함 스캔 중
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
            {uploadStatus === 'analyzing' && '코드에 포함된 보안 허점과 리스크를 로컬 정적 분석 엔진이 실시간 진단하는 중입니다.'}
            {uploadStatus === 'done' && (
              <span className="text-emerald-400 font-semibold">
                분석 완료되었습니다. 대시보드를 새로고침합니다.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Laser Container for scanning effect during analysis */}
      {uploadStatus === 'analyzing' && (
        <div className="mt-5 border border-slate-800/80 bg-slate-950/50 rounded-xl p-4 laser-container max-h-40 overflow-hidden relative">
          <div className="laser-line"></div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Active Laser Scanner
          </div>
          <div className="space-y-1.5">
            {/* Show a few lines of files with the current scanning one highlighted */}
            <div className="flex items-center justify-between text-xs py-1 px-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 rounded-lg font-mono animate-pulse">
              <span className="truncate flex items-center gap-2">
                <FileCode size={12} className="text-indigo-400" />
                {currentScanningFile || 'Scanning...'}
              </span>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Scanning</span>
            </div>
          </div>
        </div>
      )}

      {uploadStatus === 'done' && (
        <button
          onClick={onReset}
          className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-semibold transition-all"
        >
          다른 폴더 추가 진단
        </button>
      )}
    </div>
  );
};
