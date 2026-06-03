import { create } from 'zustand'

export type Theme = 'indigo' | 'emerald' | 'amber'
export type AiProvider = 'gemini' | 'claude'
export type TabName = 'dashboard' | 'upload' | 'history' | 'reports' | 'settings'

export interface EventLog {
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: number
}

interface UiState {
  activeTab: TabName
  theme: Theme
  aiProvider: AiProvider
  eventLogs: EventLog[]
  setActiveTab: (tab: TabName) => void
  setTheme: (theme: Theme) => void
  setAiProvider: (provider: AiProvider) => void
  addEventLog: (log: EventLog) => void
}

const getInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem('codeeye-theme')
    if (stored === 'emerald' || stored === 'amber' || stored === 'indigo') return stored
  } catch {}
  return 'indigo'
}

const getInitialAiProvider = (): AiProvider => {
  try {
    const stored = localStorage.getItem('codeeye-ai-provider')
    if (stored === 'claude' || stored === 'gemini') return stored
  } catch {}
  return 'gemini'
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'dashboard',
  theme: getInitialTheme(),
  aiProvider: getInitialAiProvider(),
  eventLogs: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('codeeye-theme', theme)
    } catch {
      // localStorage not available in some environments
    }
    set({ theme })
  },
  setAiProvider: (aiProvider) => {
    try {
      localStorage.setItem('codeeye-ai-provider', aiProvider)
    } catch {
      // localStorage not available in some environments
    }
    set({ aiProvider })
  },
  addEventLog: (log) =>
    set((state) => ({
      eventLogs: [...state.eventLogs.slice(-99), log],
    })),
}))
