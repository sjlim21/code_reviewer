import React from 'react';

interface LanguageDetectorProps {
  languages: string[];
}

export const getLanguageFromExtension = (filename: string): string => {
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

export const getFileBadgeColor = (filename: string): string => {
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

const LANGUAGE_BADGE_COLORS: Record<string, string> = {
  'C': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'C/C++': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'C#': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Java': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Python': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Go': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'JavaScript': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'TypeScript': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
};

export const LanguageDetector: React.FC<LanguageDetectorProps> = ({ languages }) => {
  if (languages.length === 0) return null;

  const uniqueLanguages = Array.from(new Set(languages)).filter(l => l !== 'Unknown');

  if (uniqueLanguages.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {uniqueLanguages.map(lang => {
        const colorClass = LANGUAGE_BADGE_COLORS[lang] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20';
        return (
          <span
            key={lang}
            className={`px-2 py-0.5 rounded border text-[9px] font-bold font-mono tracking-wide ${colorClass}`}
          >
            {lang}
          </span>
        );
      })}
    </div>
  );
};
