# Phase 1 — Foundation (Zustand + Component Split + Sidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate AppContext → Zustand stores, split giant components, add sidebar navigation — without breaking existing functionality.

**Architecture:** 4 Zustand stores (authStore, projectStore, issueStore, uiStore) replace single AppContext. Dashboard.tsx/Uploader.tsx split into focused sub-components. App.tsx wraps everything in AppShell with sidebar navigation (Dashboard | Upload | History | Reports | Settings tabs).

**Tech Stack:** React 19, TypeScript, Zustand 5, Vitest + @testing-library/react, Tailwind CSS 4

---

## File Map

### New files (create)
- `src/stores/authStore.ts` — session, isDemoSession, userProfile, Supabase auth subscription
- `src/stores/projectStore.ts` — projects[], selectedProject, CRUD
- `src/stores/issueStore.ts` — issues[], selectedIssue, filters, Supabase realtime
- `src/stores/uiStore.ts` — activeTab, theme, aiProvider, eventLogs (circular 100)
- `src/stores/index.ts` — re-exports
- `src/components/layout/Sidebar.tsx` — fixed left nav (240px)
- `src/components/layout/MainContent.tsx` — right content wrapper
- `src/components/layout/AppShell.tsx` — Sidebar + MainContent composition
- `src/components/dashboard/StatsCards.tsx` — 4 severity count cards
- `src/components/dashboard/TrendChart.tsx` — recharts area/bar chart wrapper
- `src/components/dashboard/IssueTable.tsx` — issue list + sort + filter + pagination
- `src/components/dashboard/ProjectSelector.tsx` — project dropdown
- `src/components/dashboard/IssueFilters.tsx` — severity/status/category filter UI
- `src/components/uploader/FileDropZone.tsx` — drag-and-drop + file validation
- `src/components/uploader/AnalysisProgress.tsx` — 7-stage progress display
- `src/components/uploader/LanguageDetector.tsx` — detected language/framework badges
- `tests/stores/authStore.test.ts`
- `tests/stores/projectStore.test.ts`
- `tests/stores/issueStore.test.ts`
- `tests/stores/uiStore.test.ts`
- `tests/components/Sidebar.test.tsx`
- `tests/components/StatsCards.test.tsx`

### Modified files
- `package.json` — add zustand, vitest, @testing-library/react, @testing-library/jest-dom
- `vite.config.ts` — add vitest config block
- `src/App.tsx` — replace tab nav with AppShell + Zustand uiStore
- `src/components/Dashboard.tsx` — thin composition shell using sub-components
- `src/components/Uploader.tsx` — thin composition shell using sub-components
- `src/components/Settings.tsx` — migrate Context reads → store hooks
- `src/components/Login.tsx` — migrate Context reads → authStore
- `src/components/CodeViewer.tsx` — migrate Context reads → stores

### Deleted files
- `src/context/AppContext.tsx` — removed after all migrations done

---

## Task 1: Install Dependencies + Vitest Setup

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Install packages**

```bash
npm install zustand@5
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Add vitest config to vite.config.ts**

Read current `vite.config.ts` first, then add:

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: false,
  },
})
```

- [ ] **Step 3: Create test setup file**

Create `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to package.json**

In `package.json` scripts section, add:
```json
"test": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 5: Verify setup works**

```bash
npx vitest run --reporter=verbose
```
Expected: "No test files found" (0 tests, exit 0)

- [ ] **Step 6: Commit**

```bash
git add package.json vite.config.ts tests/setup.ts
git commit -m "chore: add Zustand + Vitest + React Testing Library"
```

---

## Task 2: uiStore

**Files:**
- Create: `src/stores/uiStore.ts`
- Create: `tests/stores/uiStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stores/uiStore.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../../src/stores/uiStore'
import { act } from '@testing-library/react'

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'dashboard',
    theme: 'indigo',
    aiProvider: 'gemini',
    eventLogs: [],
  })
})

describe('uiStore', () => {
  it('setActiveTab updates tab', () => {
    act(() => useUiStore.getState().setActiveTab('upload'))
    expect(useUiStore.getState().activeTab).toBe('upload')
  })

  it('setTheme updates theme', () => {
    act(() => useUiStore.getState().setTheme('emerald'))
    expect(useUiStore.getState().theme).toBe('emerald')
  })

  it('addEventLog keeps max 100 entries', () => {
    act(() => {
      for (let i = 0; i < 105; i++) {
        useUiStore.getState().addEventLog({ message: `event ${i}`, type: 'info', timestamp: Date.now() })
      }
    })
    expect(useUiStore.getState().eventLogs).toHaveLength(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/stores/uiStore.test.ts
```
Expected: FAIL — "Cannot find module '../../src/stores/uiStore'"

- [ ] **Step 3: Implement uiStore**

Create `src/stores/uiStore.ts`:
```typescript
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

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'dashboard',
  theme: (localStorage.getItem('theme') as Theme) || 'indigo',
  aiProvider: (localStorage.getItem('aiProvider') as AiProvider) || 'gemini',
  eventLogs: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
  setAiProvider: (aiProvider) => {
    localStorage.setItem('aiProvider', aiProvider)
    set({ aiProvider })
  },
  addEventLog: (log) =>
    set((state) => ({
      eventLogs: [...state.eventLogs.slice(-99), log],
    })),
}))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/stores/uiStore.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/uiStore.ts tests/stores/uiStore.test.ts
git commit -m "feat: add uiStore (Zustand)"
```

---

## Task 3: authStore

**Files:**
- Create: `src/stores/authStore.ts`
- Create: `tests/stores/authStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stores/authStore.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../src/stores/authStore'
import { act } from '@testing-library/react'

beforeEach(() => {
  useAuthStore.setState({
    session: null,
    isDemoSession: false,
    userProfile: null,
  })
})

describe('authStore', () => {
  it('setSession updates session', () => {
    const mockSession = { user: { id: 'user-1', email: 'test@test.com' } } as any
    act(() => useAuthStore.getState().setSession(mockSession))
    expect(useAuthStore.getState().session).toEqual(mockSession)
  })

  it('setDemoSession sets isDemoSession true', () => {
    act(() => useAuthStore.getState().setDemoSession(true))
    expect(useAuthStore.getState().isDemoSession).toBe(true)
  })

  it('signOut clears session and demo flag', () => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as any, isDemoSession: true })
    act(() => useAuthStore.getState().signOut())
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().isDemoSession).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/stores/authStore.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement authStore**

Create `src/stores/authStore.ts`:
```typescript
import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../supabase'

interface AuthState {
  session: Session | null
  isDemoSession: boolean
  userProfile: Profile | null
  setSession: (session: Session | null) => void
  setDemoSession: (value: boolean) => void
  setUserProfile: (profile: Profile | null) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isDemoSession: false,
  userProfile: null,
  setSession: (session) => set({ session }),
  setDemoSession: (isDemoSession) => set({ isDemoSession }),
  setUserProfile: (userProfile) => set({ userProfile }),
  signOut: () => set({ session: null, isDemoSession: false, userProfile: null }),
}))
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/stores/authStore.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/authStore.ts tests/stores/authStore.test.ts
git commit -m "feat: add authStore (Zustand)"
```

---

## Task 4: projectStore

**Files:**
- Create: `src/stores/projectStore.ts`
- Create: `tests/stores/projectStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stores/projectStore.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../src/stores/projectStore'
import { act } from '@testing-library/react'
import type { Project } from '../../src/supabase'

const mockProject: Project = {
  id: 'proj-1',
  name: 'Test Project',
  description: '',
  owner_id: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  issue_count: 0,
  critical_count: 0,
  high_count: 0,
  medium_count: 0,
  low_count: 0,
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/stores/projectStore.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement projectStore**

Create `src/stores/projectStore.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/stores/projectStore.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/projectStore.ts tests/stores/projectStore.test.ts
git commit -m "feat: add projectStore (Zustand)"
```

---

## Task 5: issueStore

**Files:**
- Create: `src/stores/issueStore.ts`
- Create: `tests/stores/issueStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stores/issueStore.test.ts`:
```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { useIssueStore } from '../../src/stores/issueStore'
import { act } from '@testing-library/react'
import type { Issue } from '../../src/supabase'

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'issue-1',
  project_id: 'proj-1',
  title: 'SQL Injection',
  description: 'desc',
  severity: 'critical',
  category: 'security',
  status: 'open',
  file_path: 'src/db.ts',
  line_number: 42,
  code_snippet: '',
  suggested_fix: '',
  priority_score: 90,
  confidence_score: 0.9,
  effort_minutes: 30,
  score_breakdown: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/stores/issueStore.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement issueStore**

Create `src/stores/issueStore.ts`:
```typescript
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
      issues: state.issues.map((i) => (i.id === id ? { ...i, status, updated_at: new Date().toISOString() } : i)),
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/stores/issueStore.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/issueStore.ts tests/stores/issueStore.test.ts
git commit -m "feat: add issueStore (Zustand)"
```

---

## Task 6: stores/index.ts

**Files:**
- Create: `src/stores/index.ts`

- [ ] **Step 1: Create index**

```typescript
export { useAuthStore } from './authStore'
export { useProjectStore } from './projectStore'
export { useIssueStore } from './issueStore'
export { useUiStore } from './uiStore'
export type { Theme, AiProvider, TabName, EventLog } from './uiStore'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/index.ts
git commit -m "feat: add stores/index.ts barrel export"
```

---

## Task 7: Sidebar + AppShell Layout

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/MainContent.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `tests/components/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/Sidebar.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { Sidebar } from '../../src/components/layout/Sidebar'
import { useUiStore } from '../../src/stores/uiStore'

beforeEach(() => {
  useUiStore.setState({ activeTab: 'dashboard', theme: 'indigo', aiProvider: 'gemini', eventLogs: [] })
})

describe('Sidebar', () => {
  it('renders all nav items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('clicking Upload sets activeTab to upload', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByText('Upload'))
    expect(useUiStore.getState().activeTab).toBe('upload')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/components/Sidebar.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement Sidebar**

Create `src/components/layout/Sidebar.tsx`:
```typescript
import { LayoutDashboard, Upload, History, FileText, Settings } from 'lucide-react'
import { useUiStore, type TabName } from '../../stores/uiStore'

const NAV_ITEMS: { tab: TabName; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { tab: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { tab: 'upload', label: 'Upload', Icon: Upload },
  { tab: 'history', label: 'History', Icon: History },
  { tab: 'reports', label: 'Reports', Icon: FileText },
  { tab: 'settings', label: 'Settings', Icon: Settings },
]

export function Sidebar() {
  const { activeTab, setActiveTab, theme } = useUiStore()

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#0a0f1a] border-r border-white/5 flex flex-col z-10">
      <div className="p-5 border-b border-white/5">
        <span className="text-lg font-bold text-white">CodeEye</span>
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ tab, label, Icon }) => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left transition-colors ${
                isActive
                  ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 4: Implement MainContent + AppShell**

Create `src/components/layout/MainContent.tsx`:
```typescript
export function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main className="ml-60 min-h-screen bg-[#080c14] p-6">
      {children}
    </main>
  )
}
```

Create `src/components/layout/AppShell.tsx`:
```typescript
import { Sidebar } from './Sidebar'
import { MainContent } from './MainContent'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/components/Sidebar.test.tsx
```
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add AppShell sidebar layout"
```

---

## Task 8: Split Dashboard.tsx

**Files:**
- Create: `src/components/dashboard/StatsCards.tsx`
- Create: `src/components/dashboard/TrendChart.tsx`
- Create: `src/components/dashboard/IssueFilters.tsx`
- Create: `src/components/dashboard/ProjectSelector.tsx`
- Create: `src/components/dashboard/IssueTable.tsx`
- Modify: `src/components/Dashboard.tsx`
- Create: `tests/components/StatsCards.test.tsx`

- [ ] **Step 1: Read Dashboard.tsx to understand current structure**

Read `src/components/Dashboard.tsx`. Identify:
- Stats card rendering section → extract to StatsCards
- Chart rendering section → extract to TrendChart
- Filter controls → extract to IssueFilters
- Project dropdown → extract to ProjectSelector
- Issue list table → extract to IssueTable

- [ ] **Step 2: Write StatsCards test**

Create `tests/components/StatsCards.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatsCards } from '../../src/components/dashboard/StatsCards'

describe('StatsCards', () => {
  it('renders all 4 severity counts', () => {
    render(<StatsCards critical={3} high={7} medium={12} low={5} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/components/StatsCards.test.tsx
```
Expected: FAIL

- [ ] **Step 4: Create StatsCards.tsx**

Create `src/components/dashboard/StatsCards.tsx`:
```typescript
interface StatsCardsProps {
  critical: number
  high: number
  medium: number
  low: number
}

const CARDS = [
  { key: 'critical' as const, label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10' },
  { key: 'high' as const, label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { key: 'medium' as const, label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { key: 'low' as const, label: 'Low', color: 'text-blue-400', bg: 'bg-blue-500/10' },
]

export function StatsCards({ critical, high, medium, low }: StatsCardsProps) {
  const counts = { critical, high, medium, low }
  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map(({ key, label, color, bg }) => (
        <div key={key} className={`rounded-xl border border-white/5 p-4 ${bg}`}>
          <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{counts[key]}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run StatsCards test**

```bash
npx vitest run tests/components/StatsCards.test.tsx
```
Expected: PASS

- [ ] **Step 6: Extract TrendChart, IssueFilters, ProjectSelector, IssueTable from Dashboard.tsx**

For each sub-component:
1. Read the relevant section in Dashboard.tsx
2. Create the sub-component file under `src/components/dashboard/`
3. The sub-component receives data/callbacks as props (no direct store access in pure display components)
4. Replace the section in Dashboard.tsx with `<SubComponent ... />`

`TrendChart.tsx` — receives `data: ChartDataPoint[]`, `chartType: 'area' | 'bar'` props
`IssueFilters.tsx` — receives `statusFilter`, `severityFilter`, `onStatusChange`, `onSeverityChange` props
`ProjectSelector.tsx` — reads `useProjectStore()` directly (it's navigation, not display)
`IssueTable.tsx` — receives `issues: Issue[]`, `onIssueClick: (issue: Issue) => void` props

- [ ] **Step 7: Verify Dashboard.tsx is under 200 lines**

```bash
wc -l src/components/Dashboard.tsx
```
Expected: < 200

- [ ] **Step 8: Run all tests + build**

```bash
npx vitest run
npm run build
```
Expected: all tests pass, build succeeds

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/ src/components/Dashboard.tsx
git commit -m "refactor: split Dashboard.tsx into sub-components"
```

---

## Task 9: Split Uploader.tsx

**Files:**
- Create: `src/components/uploader/FileDropZone.tsx`
- Create: `src/components/uploader/AnalysisProgress.tsx`
- Create: `src/components/uploader/LanguageDetector.tsx`
- Modify: `src/components/Uploader.tsx`

- [ ] **Step 1: Read Uploader.tsx to identify sections**

Read `src/components/Uploader.tsx`. Identify:
- Drag-and-drop file input section → FileDropZone
- Stage 1-7 progress display → AnalysisProgress
- Language badge display → LanguageDetector

- [ ] **Step 2: Create FileDropZone.tsx**

`src/components/uploader/FileDropZone.tsx`:
```typescript
interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void
  isAnalyzing: boolean
  accept?: string[]
}

export function FileDropZone({ onFilesSelected, isAnalyzing, accept = ['.ts','.tsx','.js','.jsx','.py','.go','.java','.cpp','.cs'] }: FileDropZoneProps) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    onFilesSelected(files)
  }
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFilesSelected(Array.from(e.target.files))
  }
  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-white/10 rounded-xl p-12 text-center hover:border-[var(--theme-accent)]/50 transition-colors"
    >
      <input type="file" multiple onChange={handleChange} className="hidden" id="file-input"
        accept={accept.join(',')} disabled={isAnalyzing} />
      <label htmlFor="file-input" className="cursor-pointer">
        <p className="text-white/40 text-sm">Drop files here or click to browse</p>
        <p className="text-white/20 text-xs mt-1">{accept.join(', ')}</p>
      </label>
    </div>
  )
}
```

- [ ] **Step 3: Create AnalysisProgress.tsx**

`src/components/uploader/AnalysisProgress.tsx`:
```typescript
const STAGE_LABELS = [
  'Parsing code',
  'Detecting language',
  'Running specialist analysis',
  'Searching knowledge base',
  'Verifying findings',
  'Scoring issues',
  'Generating report',
]

interface AnalysisProgressProps {
  currentStage: number  // 0 = not started, 1-7 = stage number, 8 = done
  stageName?: string
}

export function AnalysisProgress({ currentStage, stageName }: AnalysisProgressProps) {
  if (currentStage === 0) return null
  return (
    <div className="space-y-2">
      {STAGE_LABELS.map((label, i) => {
        const stage = i + 1
        const isDone = currentStage > stage
        const isActive = currentStage === stage
        return (
          <div key={stage} className={`flex items-center gap-3 text-sm ${isActive ? 'text-[var(--theme-accent)]' : isDone ? 'text-white/40' : 'text-white/20'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border ${isActive ? 'border-[var(--theme-accent)] text-[var(--theme-accent)]' : isDone ? 'border-white/20 bg-white/10' : 'border-white/10'}`}>
              {isDone ? '✓' : stage}
            </span>
            {label}{isActive && stageName ? `: ${stageName}` : ''}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Create LanguageDetector.tsx**

`src/components/uploader/LanguageDetector.tsx`:
```typescript
interface LanguageDetectorProps {
  languages: string[]
}

const LANG_COLORS: Record<string, string> = {
  typescript: 'bg-blue-500/20 text-blue-300',
  javascript: 'bg-yellow-500/20 text-yellow-300',
  python: 'bg-green-500/20 text-green-300',
  go: 'bg-cyan-500/20 text-cyan-300',
  java: 'bg-orange-500/20 text-orange-300',
  cpp: 'bg-purple-500/20 text-purple-300',
  csharp: 'bg-indigo-500/20 text-indigo-300',
}

export function LanguageDetector({ languages }: LanguageDetectorProps) {
  if (languages.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {languages.map((lang) => (
        <span key={lang} className={`px-2 py-1 rounded text-xs font-medium ${LANG_COLORS[lang.toLowerCase()] ?? 'bg-white/10 text-white/60'}`}>
          {lang}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Refactor Uploader.tsx to thin shell**

Replace content sections in `src/components/Uploader.tsx` with the new sub-components. Import and use `FileDropZone`, `AnalysisProgress`, `LanguageDetector`. Uploader.tsx should only handle state + call `geminiAnalyzer`.

- [ ] **Step 6: Verify Uploader.tsx under 150 lines**

```bash
wc -l src/components/Uploader.tsx
```
Expected: < 150

- [ ] **Step 7: Build check**

```bash
npm run build
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/components/uploader/ src/components/Uploader.tsx
git commit -m "refactor: split Uploader.tsx into sub-components"
```

---

## Task 10: Migrate AppContext → Zustand Stores

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Login.tsx`
- Modify: `src/components/Settings.tsx`
- Modify: `src/components/CodeViewer.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/Uploader.tsx`
- Delete: `src/context/AppContext.tsx`

- [ ] **Step 1: Migrate App.tsx**

Read `src/App.tsx`. Replace:
- `AppProvider` wrapper → remove, replace with `AppShell`
- `useAppContext()` hook calls → `useAuthStore()`, `useUiStore()` as appropriate
- Tab routing via `activeTab` → `useUiStore(s => s.activeTab)`
- Theme application → `useUiStore(s => s.theme)` → apply CSS vars in `useEffect`
- Supabase auth subscription → move to `authStore` `initAuth()` action

Add `initAuth` to authStore — first add import at top of `src/stores/authStore.ts`:
```typescript
import { getSupabaseClient } from '../supabase'
```

Then add to the `AuthState` interface:
```typescript
initAuth: () => ReturnType<ReturnType<typeof getSupabaseClient>['auth']['onAuthStateChange']>
```

Then add the action inside `create<AuthState>`:
```typescript
initAuth: () => {
  getSupabaseClient().auth.getSession().then(({ data: { session } }) => {
    useAuthStore.getState().setSession(session)
  })
  return getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session)
  })
},
```

Call in `App.tsx`:
```typescript
useEffect(() => {
  const { data: { subscription } } = useAuthStore.getState().initAuth()
  return () => subscription.unsubscribe()
}, [])
```

- [ ] **Step 2: Migrate Login.tsx**

Replace `useAppContext()` → `useAuthStore()`. Read the file first to identify exact usage.

- [ ] **Step 3: Migrate Settings.tsx**

Replace `useAppContext()` → `useUiStore()` and `useAuthStore()` as appropriate. Read file first.

- [ ] **Step 4: Migrate CodeViewer.tsx**

Replace `useAppContext()` → `useIssueStore()`. Read file first.

- [ ] **Step 5: Migrate Dashboard.tsx**

Replace `useAppContext()` → appropriate store hooks. `issues` → `useIssueStore()`, `projects` → `useProjectStore()`, `activeTab` → `useUiStore()`. Read file first.

- [ ] **Step 6: Migrate Uploader.tsx**

Replace `useAppContext()` → appropriate store hooks. Read file first.

- [ ] **Step 7: Verify no AppContext imports remain**

```bash
grep -r "AppContext\|useAppContext" src/
```
Expected: no output

- [ ] **Step 8: Delete AppContext**

```bash
rm src/context/AppContext.tsx
rmdir src/context 2>/dev/null || true
```

- [ ] **Step 9: Run full test suite + build**

```bash
npx vitest run
npm run build
```
Expected: all tests pass, build succeeds

- [ ] **Step 10: Manual smoke test**

```bash
npm run dev
```
- Open http://localhost:5173
- Verify: login page renders, demo mode works, dashboard loads, tab switching works, theme switching works, issue list renders

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: complete Zustand migration, remove AppContext"
```

---

## Task 11: Wire AppShell into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current App.tsx routing**

Read `src/App.tsx` to see how tab routing currently works.

- [ ] **Step 2: Replace with AppShell**

Replace the top-level layout in `App.tsx`:
```typescript
import { AppShell } from './components/layout/AppShell'
import { useUiStore } from './stores/uiStore'
import Dashboard from './components/Dashboard'
import Uploader from './components/Uploader'
import Settings from './components/Settings'

// In render: replace tab nav with:
<AppShell>
  {activeTab === 'dashboard' && <Dashboard />}
  {activeTab === 'upload' && <Uploader />}
  {activeTab === 'history' && <div className="text-white/40">History — coming in Phase 3</div>}
  {activeTab === 'reports' && <div className="text-white/40">Reports — coming in Phase 3</div>}
  {activeTab === 'settings' && <Settings />}
</AppShell>
```

- [ ] **Step 3: Build + manual test**

```bash
npm run build
npm run dev
```
Verify: sidebar shows 5 items, all existing tabs work, History/Reports show placeholder

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire AppShell sidebar into App.tsx"
```

---

## Task 12: Phase 1 Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run --reporter=verbose
```
Expected: all tests pass

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Production build**

```bash
npm run build
npm run preview
```
Open http://localhost:4173, verify full app works

- [ ] **Step 4: Check bundle size**

```bash
npm run build 2>&1 | grep -E "dist/|kB|MB"
```
Note the total bundle size for comparison with Phase 2.

- [ ] **Step 5: Confirm AppContext is gone**

```bash
grep -r "AppContext" src/ && echo "FOUND - not done" || echo "Clean"
```
Expected: "Clean"

---

## Phase 2 + 3 Plans

Phase 2 (AI pipeline improvements) and Phase 3 (CI/CD + History + Reports) will be written as separate plan files after Phase 1 is complete and deployed.

- Phase 2 plan: `docs/superpowers/plans/2026-06-03-phase2-ai-pipeline.md`
- Phase 3 plan: `docs/superpowers/plans/2026-06-03-phase3-features.md`
