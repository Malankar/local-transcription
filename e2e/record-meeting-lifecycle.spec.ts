import { test } from '@playwright/test'

import { assertMeetingLifecycle } from './fixtures/recordingLifecycle'
import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('record meeting lifecycle @slow', () => {
  test('start/stop, timer, completion card, open in library', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('button', { name: 'Mic' }).click()
      await assertMeetingLifecycle(window, 'microphone source')
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
