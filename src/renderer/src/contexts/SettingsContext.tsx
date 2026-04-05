import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppSettings } from '../types'

interface SettingsContextType {
  settings: AppSettings | null
  settingsSaving: boolean
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Initialize settings on mount
  useEffect(() => {
    void window.api.getSettings().then(setSettings)
  }, [])

  async function updateSettings(partial: Partial<AppSettings>): Promise<void> {
    setSettingsSaving(true)
    try {
      const updated = await window.api.setSettings(partial)
      setSettings(updated)
    } finally {
      setSettingsSaving(false)
    }
  }

  const value: SettingsContextType = {
    settings,
    settingsSaving,
    updateSettings,
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettingsContext(): SettingsContextType {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettingsContext must be used within SettingsProvider')
  }
  return context
}
