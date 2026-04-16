import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type View = 'recording' | 'models' | 'history' | 'settings'
export type MainTab = 'record' | 'library' | 'models'
export type RecordingSubView = 'meetings' | 'live'

function viewToTab(view: View): MainTab | undefined {
  if (view === 'recording') return 'record'
  if (view === 'history') return 'library'
  if (view === 'models') return 'models'
  return undefined
}

function tabToView(tab: MainTab): View {
  if (tab === 'record') return 'recording'
  if (tab === 'library') return 'history'
  return 'models'
}

interface NavigationContextValue {
  /** Primary shell tab (ref top nav + Models). */
  mainTab: MainTab
  setMainTab: (tab: MainTab) => void
  /** Legacy view id for tests and hooks that still branch on `recording` | `history` | `models`. */
  activeView: View
  recordingSubView: RecordingSubView
  navigateTo: (view: View) => void
  setRecordingSubView: (sub: RecordingSubView) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [mainTab, setMainTab] = useState<MainTab>('record')
  const [recordingSubView, setRecordingSubView] = useState<RecordingSubView>('meetings')
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
    recordingSubView,
    navigateTo,
    setRecordingSubView,
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
