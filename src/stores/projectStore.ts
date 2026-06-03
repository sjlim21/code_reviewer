import { create } from 'zustand'
import type { Project } from '../supabase'

interface ProjectState {
  projects: Project[]
  selectedProject: Project | null
  isUsingRealDB: boolean
  setProjects: (projects: Project[]) => void
  setSelectedProject: (project: Project | null) => void
  setIsUsingRealDB: (value: boolean) => void
  upsertProject: (project: Project) => void
  removeProject: (id: string) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  selectedProject: null,
  isUsingRealDB: false,
  setProjects: (projects) => set({ projects }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  setIsUsingRealDB: (isUsingRealDB) => set({ isUsingRealDB }),
  upsertProject: (project) =>
    set((state) => ({
      projects: state.projects.some((p) => p.id === project.id)
        ? state.projects.map((p) => (p.id === project.id ? project : p))
        : [...state.projects, project],
    })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProject: state.selectedProject?.id === id ? null : state.selectedProject,
    })),
}))
