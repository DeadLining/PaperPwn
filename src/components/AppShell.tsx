import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Settings, Library, FileText, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RecentPapers } from '@/components/RecentPapers'
import { usePaperStore } from '@/lib/stores/paper-store'
import paperMateLogo from '@/assets/papermate-logo.png'

interface RightPanelContextType {
  isOpen: boolean
  content: ReactNode | null
  openPanel: (content: ReactNode) => void
  closePanel: () => void
}

const RightPanelContext = createContext<RightPanelContextType>({
  isOpen: false,
  content: null,
  openPanel: () => null,
  closePanel: () => null,
})

export function useRightPanel() {
  return useContext(RightPanelContext)
}

export function AppShell() {
  const [rightPanel, setRightPanel] = useState<{
    isOpen: boolean
    content: ReactNode | null
  }>({ isOpen: false, content: null })

  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  const currentPaper = usePaperStore((s) => s.currentPaper)

  const openPanel = (content: ReactNode) => setRightPanel({ isOpen: true, content })
  const closePanel = () => setRightPanel({ isOpen: false, content: null })

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const navItems = [
    { to: '/',  label: 'Library' , icon: Library },
    ...(currentPaper
      ? [{ to: `/reader/${currentPaper.id}`, label: 'Reader' , icon: FileText }]
      : []),
    { to: '/settings' , label: 'Settings' , icon: Settings },
  ]

  return (
    <TooltipProvider>
      <RightPanelContext.Provider value={{ ...rightPanel, openPanel, closePanel }}>
        <div className="flex h-screen w-screen overflow-hidden bg-background">
          {/* Offline indicator */}
          {isOffline && (
            <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-900 text-sm font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-md">
              <WifiOff className="h-4 w-4" />
              当前处于离线状态，AI 功能不可用
            </div>
          )}

          {/* Left Sidebar */}
          <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <img src={paperMateLogo} alt="PaperMate logo" className="h-7 w-7 rounded-md object-cover" />
                <h1 className="text-lg font-semibold text-foreground">PaperMate</h1>
              </div>
            </div>
            <nav className="p-2 space-y-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors' ,
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <Separator className="my-2" />
            <RecentPapers />
            <div className="flex-1" />
            <div className="p-4 border-t border-border">
              <p className="text-xs text-muted-foreground">PaperMate v0.1.0</p>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col overflow-hidden">
            <Outlet />
          </main>

          {/* Optional Right Panel */}
          {rightPanel.isOpen && (
            <aside className="w-64 shrink-0 border-l border-border bg-card overflow-auto">
              <div className="p-3 flex items-center justify-between border-b border-border">
                <h3 className="text-sm font-medium text-foreground">Details</h3>
                <button
                  onClick={closePanel}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
              <div className="p-3">
                {rightPanel.content}
              </div>
            </aside>
          )}
        </div>
      </RightPanelContext.Provider>
    </TooltipProvider>
  )
}
