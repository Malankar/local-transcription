import { createContext, useContext, useState, type ReactNode } from 'react'

export type View = 'recording' | 'models' | 'history' | 'settings'
export type RecordingSubView = 'meetings' | 'live'

interface NavigationContextValue {
  activeView: View
  recordingSubView: RecordingSubView
  navigateTo: (view: View) => void
  setRecordingSubView: (sub: RecordingSubView) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<View>('recording')
  const [recordingSubView, setRecordingSubView] = useState<RecordingSubView>('meetings')

  const navigateTo = (view: View) => {
    setActiveView(view)
  }

  const value: NavigationContextValue = {
    activeView,
    recordingSubView,
    navigateTo,
    setRecordingSubView,
  }

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigationContext must be used inside NavigationProvider')
  return ctx
}
