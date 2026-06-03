import React, { useState } from 'react';
import { FolderOpen, Folder, FileCode, Play, Trash2 } from 'lucide-react';
import { getLanguageFromExtension, getFileBadgeColor } from './LanguageDetector';

const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.h', '.cs', '.java', '.py', '.go', '.js', '.jsx', '.ts', '.tsx'];

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getValidationStatus = (file: File) => {
  const name = file.name.toLowerCase();
  const isSupported = SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
  if (!isSupported) return { valid: false, reason: 'Unsupported Lang' };
  if (file.size > 2 * 1024 * 1024) return { valid: false, reason: 'Exceeds 2MB' };
  return { valid: true, reason: 'Ready' };
};

interface FileTreeNode {
  name: string;
  relativePath: string;
  file?: File;
  children: Record<string, FileTreeNode>;
}

const buildFileTree = (files: File[]): FileTreeNode => {
  const root: FileTreeNode = { name: 'root', relativePath: '', children: {} };
  files.forEach(file => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    let current = root;
    let accumulatedPath = '';
    parts.forEach((part, index) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isLast = index === parts.length - 1;
      if (!current.children[part]) {
        current.children[part] = { name: part, relativePath: accumulatedPath, children: {} };
      }
      if (isLast) current.children[part].file = file;
      current = current.children[part];
    });
  });
  return root;
};

interface StagedFilesListProps {
  stagedFiles: File[];
  onClear: () => void;
  onStartAnalysis: (files: File[]) => void;
}

export const StagedFilesList: React.FC<StagedFilesListProps> = ({
  stagedFiles,
  onClear,
  onStartAnalysis,
}) => {
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});

  const toggleFolder = (path: string) => {
    setCollapsedPaths(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTreeNode = (node: FileTreeNode): React.ReactNode => {
    const isDirectory = Object.keys(node.children).length > 0;
    const path = node.relativePath;
    const isCollapsed = collapsedPaths[path];

    if (isDirectory) {
      return (
        <div key={path} className="space-y-1">
          <div
            onClick={() => toggleFolder(path)}
            className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-900/40 rounded-lg cursor-pointer transition-colors text-slate-300 font-medium select-none"
            style={{ paddingLeft: '8px' }}
          >
            <span className="text-slate-500 shrink-0">
              {isCollapsed ? (
                <svg className="w-3 h-3 transform -rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </span>
            {isCollapsed ? (
              <Folder size={14} className="text-[var(--theme-accent,#6366f1)] shrink-0" />
            ) : (
              <FolderOpen size={14} className="text-[var(--theme-accent,#6366f1)] shrink-0" />
            )}
            <span className="text-xs truncate">{node.name}</span>
            <span className="text-[9px] text-slate-600 font-mono shrink-0 ml-1">
              ({Object.keys(node.children).length} items)
            </span>
          </div>
          {!isCollapsed && (
            <div className="border-l border-slate-800/80 ml-3.5 pl-2.5 space-y-1">
              {Object.values(node.children)
                .sort((a, b) => {
                  const aIsDir = Object.keys(a.children).length > 0;
                  const bIsDir = Object.keys(b.children).length > 0;
                  if (aIsDir && !bIsDir) return -1;
                  if (!aIsDir && aIsDir !== bIsDir) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map(child => renderTreeNode(child))
              }
            </div>
          )}
        </div>
      );
    }

    const file = node.file;
    if (!file) return null;
    const status = getValidationStatus(file);
    const lang = getLanguageFromExtension(file.name);
    const badgeStyle = getFileBadgeColor(file.name);

    return (
      <div
        key={path}
        className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-900/30 rounded-lg transition-colors border border-transparent hover:border-slate-800/40"
        style={{ paddingLeft: '8px' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileCode size={13} className={`shrink-0 ${file.name.split('.').pop()?.toLowerCase() ? badgeStyle.split(' ')[0] : 'text-slate-500'}`} />
          <span className="text-xs text-slate-300 truncate font-mono" title={node.name}>{node.name}</span>
          <span className="text-[10px] text-slate-500 font-mono shrink-0">({formatFileSize(file.size)})</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded border text-[9px] font-bold font-mono tracking-wide ${badgeStyle}`}>{lang}</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
            status.valid
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {status.reason}
          </span>
        </div>
      </div>
    );
  };

  const readyCount = stagedFiles.filter(f => getValidationStatus(f).valid).length;
  const ignoredCount = stagedFiles.length - readyCount;
  const folderName = stagedFiles.find(f => f.webkitRelativePath)?.webkitRelativePath.split('/')[0] || 'Local Project';

  return (
    <div className="border border-slate-800/80 rounded-2xl p-6 bg-slate-950/20 shadow-inner space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
        <div>
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Staged Files ({stagedFiles.length})
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {folderName} 폴더 구조가 감지되었습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-slate-500 hover:text-rose-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Trash2 size={12} />
          Reset Staging
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 text-center">
          <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Total Files</span>
          <span className="text-sm font-bold text-slate-300">{stagedFiles.length}</span>
        </div>
        <div className="bg-emerald-950/10 p-2.5 rounded-lg border border-emerald-900/20 text-center">
          <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Ready to Scan</span>
          <span className="text-sm font-bold text-emerald-400">{readyCount}</span>
        </div>
        <div className="bg-rose-950/10 p-2.5 rounded-lg border border-rose-900/20 text-center">
          <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Ignored</span>
          <span className="text-sm font-bold text-rose-400">{ignoredCount}</span>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto border border-slate-800/60 bg-slate-950/60 rounded-xl p-4 pr-2 space-y-2">
        {(() => {
          const rootNode = buildFileTree(stagedFiles);
          const topLevelNodes = Object.values(rootNode.children);
          return topLevelNodes.length > 0 ? (
            topLevelNodes
              .sort((a, b) => {
                const aIsDir = Object.keys(a.children).length > 0;
                const bIsDir = Object.keys(b.children).length > 0;
                if (aIsDir && !bIsDir) return -1;
                if (!aIsDir && aIsDir !== bIsDir) return 1;
                return a.name.localeCompare(b.name);
              })
              .map(node => renderTreeNode(node))
          ) : (
            <div className="text-center text-xs text-slate-500 py-4">
              대기 중인 파일이 없습니다.
            </div>
          );
        })()}
      </div>

      <button
        type="button"
        onClick={() => onStartAnalysis(stagedFiles)}
        disabled={readyCount === 0}
        className={`w-full font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-300 shadow-lg active:scale-[0.98] ${
          readyCount > 0
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
        }`}
      >
        <Play size={13} />
        <span>CodeEye 로컬 보안 진단 시작하기</span>
      </button>
    </div>
  );
};
