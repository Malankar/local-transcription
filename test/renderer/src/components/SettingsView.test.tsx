import { describe, expect, it, vi } from 'vitest'

import { SettingsView } from '../../../../src/renderer/src/components/SettingsView'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

describe('SettingsView', () => {
  it('updates the voice shortcut and toggles general settings', async () => {
    const base = {
      startHidden: false,
      launchOnStartup: false,
      showTrayIcon: true,
      unloadModelAfterMinutes: 5,
      voiceToTextShortcut: 'Control+Shift+T',
      muteWhileRecording: false,
      historyLimit: 10,
      autoDeleteRecordings: 'never' as const,
      keepStarredUntilDeleted: true,
      uiFeatures: {
        enableExternalAssistant: false,
        enableIntegrations: false,
        assistantProvider: 'local' as const,
      },
    }
    const setSettings = vi.fn().mockImplementation(async (partial: Record<string, unknown>) => ({
      ...base,
      ...partial,
      uiFeatures: {
        ...base.uiFeatures,
        ...(partial.uiFeatures as object),
      },
    }))

    installMockApi({
      getSettings: vi.fn().mockResolvedValue({
        startHidden: false,
        launchOnStartup: false,
        showTrayIcon: true,
        unloadModelAfterMinutes: 5,
        voiceToTextShortcut: 'Control+Shift+T',
        muteWhileRecording: false,
        historyLimit: 10,
        autoDeleteRecordings: 'never',
        keepStarredUntilDeleted: true,
        uiFeatures: {
          enableExternalAssistant: false,
          enableIntegrations: false,
          assistantProvider: 'local',
        },
      }),
      setSettings,
      platform: 'darwin',
    })

    const { container } = await renderRendererApp(<SettingsView />)
    await flushMicrotasks()

    expect((container.querySelector('input') as HTMLInputElement | null)?.value).toBe('Control+Shift+T')

    const switches = container.querySelectorAll('[role="switch"]')
    switches[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    expect(setSettings).toHaveBeenCalledWith({ startHidden: true })
    expect(container.textContent).toContain('Start hidden')
  })
})
