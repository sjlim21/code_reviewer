import { type ComponentType } from 'react'
import { LayoutDashboard, Upload, History, FileText, Settings } from 'lucide-react'
import { useUiStore, type TabName } from '../../stores/uiStore'

const NAV_ITEMS: { tab: TabName; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { tab: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { tab: 'upload', label: 'Upload', Icon: Upload },
  { tab: 'history', label: 'History', Icon: History },
  { tab: 'reports', label: 'Reports', Icon: FileText },
  { tab: 'settings', label: 'Settings', Icon: Settings },
]

export function Sidebar() {
  const { activeTab, setActiveTab } = useUiStore()

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
