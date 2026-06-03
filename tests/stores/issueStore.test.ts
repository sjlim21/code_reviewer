import { beforeEach, describe, expect, it } from 'vitest'
import { useIssueStore } from '../../src/stores/issueStore'
import { act } from '@testing-library/react'
import type { Issue } from '../../src/supabase'

// Mock Issue factory matching the actual Issue interface from src/supabase.ts
const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'issue-1',
  project_id: 'proj-1',
  analysis_run_id: 'run-1',
  title: 'SQL Injection',
  description: 'desc',
  suggestion: 'suggestion',
  rule_id: 'security/sql-injection',
  severity: 'critical',
  category: 'security',
  priority_score: 90,
  file_path: 'src/db.ts',
  line_start: 42,
  line_end: 45,
  code_snippet: '',
  status: 'open',
  assignee_id: null,
  resolved_by: null,
  resolved_at: null,
  created_at: new Date().toISOString(),
  ...overrides,
})

beforeEach(() => {
  useIssueStore.setState({ issues: [], selectedIssue: null, statusFilter: 'all', severityFilter: 'all' })
})

describe('issueStore', () => {
  it('setIssues replaces list', () => {
    act(() => useIssueStore.getState().setIssues([makeIssue()]))
    expect(useIssueStore.getState().issues).toHaveLength(1)
  })

  it('updateIssueStatus updates matching issue', () => {
    useIssueStore.setState({ issues: [makeIssue()] })
    act(() => useIssueStore.getState().updateIssueStatus('issue-1', 'resolved'))
    expect(useIssueStore.getState().issues[0].status).toBe('resolved')
  })

  it('filteredIssues filters by severity', () => {
    useIssueStore.setState({
      issues: [makeIssue({ severity: 'critical' }), makeIssue({ id: 'issue-2', severity: 'low' })],
      severityFilter: 'critical',
    })
    expect(useIssueStore.getState().filteredIssues()).toHaveLength(1)
  })
})
