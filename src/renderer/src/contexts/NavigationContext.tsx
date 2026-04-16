import { createContext, useContext, useState, type ReactNode } from 'react'

export type View = 'recording' | 'models' | 'history' | 'settings'

interface NavigationContextValue {
  activeView: View
  navigateTo: (view: View) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<View>('recording')

  const navigateTo = (view: View) => {
    setActiveView(view)
  }

  const value: NavigationContextValue = {
    activeView,
    navigateTo,
  }

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigationContext must be used inside NavigationProvider')
  return ctx
}
