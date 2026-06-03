import React from 'react';
import { FolderOpen } from 'lucide-react';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isAnalyzing: boolean;
  accept?: string[];
}

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

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onFilesSelected, isAnalyzing }) => {
  const [isDragging, setIsDragging] = React.useState(false);

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
        onFilesSelected(allFiles);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  // webkitdirectory 속성이 동작할 수 있도록 커스텀 Props 타입 우회
  const inputProps = {
    webkitdirectory: "",
    directory: "",
    multiple: true
  } as React.InputHTMLAttributes<HTMLInputElement>;

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isAnalyzing && document.getElementById('folder-input')?.click()}
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
  );
};
