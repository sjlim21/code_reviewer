import React, { useState } from 'react';
import { FolderOpen, Folder, FileCode, AlertCircle, CheckCircle, RefreshCw, Trash2, Play } from 'lucide-react';
import { getSupabaseClient, type Issue, type Project } from '../supabase';
import { analyzeCodeWithGemini } from '../geminiAnalyzer';
import { analyzeCodeWithClaude } from '../claudeAnalyzer';


interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader: () => FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries: (successCallback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: DOMException) => void) => void;
}

const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.h', '.cs', '.java', '.py', '.go', '.js', '.jsx', '.ts', '.tsx'];

const traverseFileTree = async (entry: FileSystemEntry, path: string = ''): Promise<File[]> => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      fileEntry.file((file: File) => {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + entry.name,
          writable: true,
          configurable: true
        });
        resolve([file]);
      }, () => resolve([]));
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const dirReader = dirEntry.createReader();
      const allEntries: FileSystemEntry[] = [];
      const readAll = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            const filePromises = allEntries.map(e => traverseFileTree(e, path + entry.name + '/'));
            resolve((await Promise.all(filePromises)).flat());
            return;
          }
          allEntries.push(...entries);
          readAll();
        }, () => resolve([]));
      };
      readAll();
    } else {
      resolve([]);
    }
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getLanguageFromExtension = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'c': return 'C';
    case 'cpp':
    case 'cc':
    case 'h': return 'C/C++';
    case 'cs': return 'C#';
    case 'java': return 'Java';
    case 'py': return 'Python';
    case 'go': return 'Go';
    case 'js':
    case 'jsx': return 'JavaScript';
    case 'ts':
    case 'tsx': return 'TypeScript';
    default: return 'Unknown';
  }
};

const getFileBadgeColor = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'c':
    case 'cpp':
    case 'cc':
    case 'h': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'cs': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    case 'java': return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'py': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    case 'go': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    case 'js':
    case 'jsx': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'ts':
    case 'tsx': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
    default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  }
};

const getValidationStatus = (file: File) => {
  const name = file.name.toLowerCase();
  const isSupported = SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
  if (!isSupported) {
    return { valid: false, reason: 'Unsupported Lang' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { valid: false, reason: 'Exceeds 2MB' };
  }
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
        current.children[part] = {
          name: part,
          relativePath: accumulatedPath,
          children: {}
        };
      }

      if (isLast) {
        current.children[part].file = file;
      }

      current = current.children[part];
    });
  });

  return root;
};

import { useAppContext } from '../context/AppContext';

export const Uploader: React.FC = () => {
  const {
    selectedProject,
    handleAnalysisComplete: onAnalysisComplete,
    session,
    projects,
    setSelectedProject: onProjectSelected,
    setProjects,
    aiProvider
  } = useAppContext();

  // Helper for creating a new project in context
  const onProjectCreated = (newProj: Project) => {
    setProjects(prev => [newProj, ...prev]);
    if (onProjectSelected) onProjectSelected(newProj);
  };
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFilesCount, setTotalFilesCount] = useState(0);
  const [currentScanningFile, setCurrentScanningFile] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>({});

  const toggleFolder = (path: string) => {
    setCollapsedPaths(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const renderTreeNode = (node: FileTreeNode): React.ReactNode => {
    const isDirectory = Object.keys(node.children).length > 0;
    const path = node.relativePath;
    const isCollapsed = collapsedPaths[path];

    if (isDirectory) {
      return (
        <div key={path} className="space-y-1">
          {/* Directory Row */}
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

          {/* Children container with indent guide line */}
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

    // File Row
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
          <span className="text-xs text-slate-300 truncate font-mono" title={node.name}>
            {node.name}
          </span>
          <span className="text-[10px] text-slate-500 font-mono shrink-0">
            ({formatFileSize(file.size)})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded border text-[9px] font-bold font-mono tracking-wide ${badgeStyle}`}>
            {lang}
          </span>
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


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg('');

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const promises: Promise<File[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          if (typeof item.webkitGetAsEntry === 'function') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
              promises.push(traverseFileTree(entry));
            }
          } else {
            const file = item.getAsFile();
            if (file) {
              promises.push(Promise.resolve([file]));
            }
          }
        }
      }
      const filesArrays = await Promise.all(promises);
      const allFiles = filesArrays.flat();
      if (allFiles.length > 0) {
        setStagedFiles(allFiles);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setStagedFiles(Array.from(e.dataTransfer.files));
    }
  };

  // webkitdirectory 속성이 동작할 수 있도록 커스텀 Props 타입 우회
  const inputProps = {
    webkitdirectory: "",
    directory: "",
    multiple: true
  } as React.InputHTMLAttributes<HTMLInputElement>;

  const performFolderAnalysis = async (filesList: File[]) => {
    // 1. 지원 가능한 다국어 소스코드 확장자 파일 필터링
    const filesToAnalyze = filesList.filter(file => {
      const status = getValidationStatus(file);
      return status.valid;
    });

    if (filesToAnalyze.length === 0) {
      setErrorMsg('분석 가능한 코드 파일이 존재하지 않거나 모두 2MB를 초과했습니다.');
      return;
    }

    const totalBytes = filesToAnalyze.reduce((acc, f) => acc + f.size, 0);
    const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10MB
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
      if (supabase && !session?.user?.id) {
        throw new Error("분석을 수행하려면 로그인 세션이 필요합니다.");
      }
      activeProjId = selectedProject?.id || '';
      isNewProjectCreated = false;

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
          owner_id: session?.user?.id || 'demo-user',
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
        isNewProjectCreated = true;
        if (onProjectCreated) onProjectCreated(newProj);
        console.log(`Created new project: ${folderName}`);
      } else {
        // 데모 시뮬레이션 프로젝트 생성
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

      // 4. Supabase에 analysis_runs 레코드 삽입 (상태: running)
      setProgress(25);
      runId = crypto.randomUUID();
      
      if (supabase) {
        const { error: runError } = await supabase
          .from('analysis_runs')
          .insert({
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

      // 5. 각 소스코드 파일 동시 스캔 루프 (최대 4개 동시 진행)
      let completedCount = 0;
      const scanFile = async (file: File) => {
        try {
          // 파일 텍스트 추출
          let codeContent: string | null = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string || '');
            reader.onerror = (err) => reject(err);
            reader.readAsText(file);
          });

          // AI 제공자에 따라 분석 엔진 선택
          const detectedIssues = aiProvider === 'claude'
            ? await analyzeCodeWithClaude(file.name, codeContent, activeProjId, runId || '')
            : await analyzeCodeWithGemini(file.name, codeContent, activeProjId, runId || '', session?.provider_token || undefined);
          
          // Free string reference immediately to allow garbage collection
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
          
          // 현재 파일의 진행도 갱신 (30% ~ 85%)
          const currentProgress = 30 + Math.floor((completedCount / filesToAnalyze.length) * 55);
          setProgress(currentProgress);
        }
      };

      const concurrencyLimit = 4;
      const executing = new Set<Promise<void>>();

      for (const file of filesToAnalyze) {
        const p: Promise<void> = scanFile(file).then(() => {
          executing.delete(p);
        });
        executing.add(p);

        if (executing.size >= concurrencyLimit) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);

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
      setStagedFiles([]);
      onAnalysisComplete(allDetectedIssues);

    } catch (err: unknown) {
      console.error("Folder analysis pipeline error:", err);
      const errorMessage = err instanceof Error ? err.message : '폴더 분석 수행 중 오류가 발생했습니다.';
      setErrorMsg(errorMessage);
      setUploadStatus('idle');

      const supabase = getSupabaseClient();
      if (supabase && runId) {
        try {
          await supabase
            .from('analysis_runs')
            .update({ 
              status: 'failed', 
              completed_at: new Date().toISOString() 
            })
            .eq('id', runId);

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

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setStagedFiles(Array.from(files));
    }
  };

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
          <div className="border border-slate-800/80 rounded-2xl p-6 bg-slate-950/20 shadow-inner space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Staged Files ({stagedFiles.length})
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {stagedFiles.find(f => f.webkitRelativePath)?.webkitRelativePath.split('/')[0] || 'Local Project'} 폴더 구조가 감지되었습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStagedFiles([])}
                className="text-[10px] text-slate-500 hover:text-rose-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Reset Staging
              </button>
            </div>

            {/* Staged files statistics summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 text-center">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Total Files</span>
                <span className="text-sm font-bold text-slate-300">{stagedFiles.length}</span>
              </div>
              <div className="bg-emerald-950/10 p-2.5 rounded-lg border border-emerald-900/20 text-center">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Ready to Scan</span>
                <span className="text-sm font-bold text-emerald-400">
                  {stagedFiles.filter(f => getValidationStatus(f).valid).length}
                </span>
              </div>
              <div className="bg-rose-950/10 p-2.5 rounded-lg border border-rose-900/20 text-center">
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Ignored</span>
                <span className="text-sm font-bold text-rose-400">
                  {stagedFiles.filter(f => !getValidationStatus(f).valid).length}
                </span>
              </div>
            </div>

            {/* Scrollable File Tree */}
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
              onClick={() => performFolderAnalysis(stagedFiles)}
              disabled={stagedFiles.filter(f => getValidationStatus(f).valid).length === 0}
              className={`w-full font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-300 shadow-lg active:scale-[0.98] ${
                stagedFiles.filter(f => getValidationStatus(f).valid).length > 0
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <Play size={13} />
              <span>CodeEye 로컬 보안 진단 시작하기</span>
            </button>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('folder-input')?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
              isDragging 
                ? 'border-indigo-500 bg-indigo-950/40 backdrop-blur-md scale-[1.01] drag-active-glow' 
                : 'border-slate-800 hover:border-slate-700/80 hover:bg-slate-900/10'
            }`}
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
                  분석할 로컬 프로젝트 폴더를 선택하거나 여기에 끌어다 놓으세요
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
        )
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
