import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type View = 'recording' | 'history' | 'settings'
export type MainTab = 'record' | 'library'

function viewToTab(view: View): MainTab | undefined {
  if (view === 'recording') return 'record'
  if (view === 'history') return 'library'
  return undefined
}

function tabToView(tab: MainTab): View {
  if (tab === 'record') return 'recording'
  return 'history'
}

interface NavigationContextValue {
  /** Primary shell tab (top nav). */
  mainTab: MainTab
  setMainTab: (tab: MainTab) => void
  /** Legacy view id for tests and hooks that still branch on `recording` | `history`. */
  activeView: View
  navigateTo: (view: View) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [mainTab, setMainTab] = useState<MainTab>('record')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const activeView: View = tabToView(mainTab)

  const navigateTo = useCallback((view: View) => {
    if (view === 'settings') {
      setSettingsOpen(true)
      return
    }
    const tab = viewToTab(view)
    if (tab) setMainTab(tab)
  }, [])

  const value: NavigationContextValue = {
    mainTab,
    setMainTab,
    activeView,
    navigateTo,
    settingsOpen,
    setSettingsOpen,
  }

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigationContext must be used inside NavigationProvider')
  return ctx
}
