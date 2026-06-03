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
