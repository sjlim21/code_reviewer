import { create } from 'zustand'
import type { Issue } from '../supabase'

type IssueStatus = Issue['status']
type IssueSeverity = Issue['severity'] | 'all'

interface IssueState {
  issues: Issue[]
  selectedIssue: Issue | null
  statusFilter: IssueStatus | 'all'
  severityFilter: IssueSeverity
  setIssues: (issues: Issue[]) => void
  setSelectedIssue: (issue: Issue | null) => void
  setStatusFilter: (filter: IssueStatus | 'all') => void
  setSeverityFilter: (filter: IssueSeverity) => void
  updateIssueStatus: (id: string, status: IssueStatus) => void
  upsertIssue: (issue: Issue) => void
  filteredIssues: () => Issue[]
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: [],
  selectedIssue: null,
  statusFilter: 'all',
  severityFilter: 'all',
  setIssues: (issues) => set({ issues }),
  setSelectedIssue: (selectedIssue) => set({ selectedIssue }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSeverityFilter: (severityFilter) => set({ severityFilter }),
  updateIssueStatus: (id, status) =>
    set((state) => ({
      issues: state.issues.map((i) => (i.id === id ? { ...i, status, created_at: i.created_at } : i)),
    })),
  upsertIssue: (issue) =>
    set((state) => ({
      issues: state.issues.some((i) => i.id === issue.id)
        ? state.issues.map((i) => (i.id === issue.id ? issue : i))
        : [...state.issues, issue],
    })),
  filteredIssues: () => {
    const { issues, statusFilter, severityFilter } = get()
    return issues.filter((i) => {
      const matchStatus = statusFilter === 'all' || i.status === statusFilter
      const matchSeverity = severityFilter === 'all' || i.severity === severityFilter
      return matchStatus && matchSeverity
    })
  },
}))
