import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppSettings, ThemeMode } from '../types'

interface SettingsContextType {
  settings: AppSettings | null
  settingsSaving: boolean
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

function applyTheme(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

function prefersDark(): boolean {
  return globalThis.matchMedia?.(SYSTEM_DARK_QUERY).matches ?? false
}

export function SettingsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const themeMode: ThemeMode = settings?.themeMode ?? 'system'

  // Initialize settings on mount
  useEffect(() => {
    void globalThis.window.api.getSettings().then(setSettings)
  }, [])

  useLayoutEffect(() => {
    function syncTheme(): void {
      applyTheme(themeMode === 'dark' || (themeMode === 'system' && prefersDark()))
    }

    syncTheme()

    if (themeMode !== 'system' || typeof globalThis.matchMedia !== 'function') return

    const media = globalThis.matchMedia(SYSTEM_DARK_QUERY)
    media.addEventListener('change', syncTheme)
    return () => media.removeEventListener('change', syncTheme)
  }, [themeMode])

  const updateSettings = useCallback(async (partial: Partial<AppSettings>): Promise<void> => {
    setSettingsSaving(true)
    try {
      const updated = await globalThis.window.api.setSettings(partial)
      setSettings(updated)
    } finally {
      setSettingsSaving(false)
    }
  }, [])

  const value: SettingsContextType = useMemo(
    () => ({
      settings,
      settingsSaving,
      updateSettings,
    }),
    [settings, settingsSaving, updateSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettingsContext(): SettingsContextType {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettingsContext must be used within SettingsProvider')
  }
  return context
}
