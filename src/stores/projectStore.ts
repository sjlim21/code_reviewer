import { create } from 'zustand'
import type { Project } from '../supabase'

interface ProjectState {
  projects: Project[]
  selectedProject: Project | null
  setProjects: (projects: Project[]) => void
  setSelectedProject: (project: Project | null) => void
  upsertProject: (project: Project) => void
  removeProject: (id: string) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProject: null,
  setProjects: (projects) => set({ projects }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
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
