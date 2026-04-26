import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsProvider, useSettingsContext } from '../../../../src/renderer/src/contexts/SettingsContext'
import type { AppSettings, ThemeMode } from '../../../../src/shared/types'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'

function Probe() {
  const { settings, settingsSaving, updateSettings } = useSettingsContext()

  return (
    <div>
      <span data-testid="shortcut">{settings?.voiceToTextShortcut ?? 'missing'}</span>
      <span data-testid="saving">{String(settingsSaving)}</span>
      <button onClick={() => updateSettings({ voiceToTextShortcut: 'Alt+S' }).catch(() => undefined)}>save</button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null
const originalMatchMedia = globalThis.matchMedia

function settingsWithTheme(themeMode: ThemeMode): AppSettings {
  return {
    startHidden: false,
    launchOnStartup: false,
    showTrayIcon: true,
    unloadModelAfterMinutes: 5,
    voiceToTextShortcut: 'Control+Shift+T',
    muteWhileRecording: false,
    themeMode,
    historyLimit: 10,
    autoDeleteRecordings: 'never',
    keepStarredUntilDeleted: true,
    uiFeatures: {
      enableExternalAssistant: false,
      assistantProvider: 'local',
    },
  }
}

function installMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') listeners.add(listener)
      }),
      removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') listeners.delete(listener)
      }),
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
      dispatchEvent: vi.fn(),
    })),
  })

  return {
    setMatches(next: boolean) {
      matches = next
      const event = { matches: next, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
})

describe('SettingsContext', () => {
  it('loads settings on mount and persists updates', async () => {
    const api = installMockApi()
    mounted = await renderIntoDocument(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    )

    await flushMicrotasks()
    expect(api.getSettings).toHaveBeenCalledOnce()
    expect(mounted.container.querySelector('[data-testid="shortcut"]')?.textContent).toBe('Control+Shift+T')

    mounted.container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    expect(api.setSettings).toHaveBeenCalledWith({ voiceToTextShortcut: 'Alt+S' })
    expect(mounted.container.querySelector('[data-testid="shortcut"]')?.textContent).toBe('Alt+S')
    expect(mounted.container.querySelector('[data-testid="saving"]')?.textContent).toBe('false')
  })

  it('applies explicit dark theme to the document root', async () => {
    installMatchMedia(false)
    installMockApi({
      getSettings: vi.fn().mockResolvedValue(settingsWithTheme('dark')),
    })

    mounted = await renderIntoDocument(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    )

    await flushMicrotasks()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('follows system dark preference and reacts to system changes', async () => {
    const media = installMatchMedia(true)
    installMockApi({
      getSettings: vi.fn().mockResolvedValue(settingsWithTheme('system')),
    })

    mounted = await renderIntoDocument(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    )

    await flushMicrotasks()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    media.setMatches(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})
