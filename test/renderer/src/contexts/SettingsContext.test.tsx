import { afterEach, describe, expect, it } from 'vitest'

import { SettingsProvider, useSettingsContext } from '../../../../src/renderer/src/contexts/SettingsContext'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'

function Probe() {
  const { settings, settingsSaving, updateSettings } = useSettingsContext()

  return (
    <div>
      <span data-testid="shortcut">{settings?.voiceToTextShortcut ?? 'missing'}</span>
      <span data-testid="saving">{String(settingsSaving)}</span>
      <button onClick={() => void updateSettings({ voiceToTextShortcut: 'Alt+S' })}>save</button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
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
})
