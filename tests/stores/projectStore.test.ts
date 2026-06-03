import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../src/stores/projectStore'
import { act } from '@testing-library/react'
import type { Project } from '../../src/supabase'

const mockProject: Project = {
  id: 'proj-1',
  name: 'Test Project',
  description: 'A test project',
  owner_id: 'user-1',
  language: 'TypeScript',
  repo_url: 'https://github.com/test/project',
  status: 'active',
  total_issues: 5,
  open_issues: 3,
  created_at: new Date().toISOString(),
}

beforeEach(() => {
  useProjectStore.setState({ projects: [], selectedProject: null })
})

describe('projectStore', () => {
  it('setProjects updates projects list', () => {
    act(() => useProjectStore.getState().setProjects([mockProject]))
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })

  it('setSelectedProject updates selection', () => {
    act(() => useProjectStore.getState().setSelectedProject(mockProject))
    expect(useProjectStore.getState().selectedProject?.id).toBe('proj-1')
  })

  it('removeProject removes from list and clears selection if selected', () => {
    useProjectStore.setState({ projects: [mockProject], selectedProject: mockProject })
    act(() => useProjectStore.getState().removeProject('proj-1'))
    expect(useProjectStore.getState().projects).toHaveLength(0)
    expect(useProjectStore.getState().selectedProject).toBeNull()
  })
})
