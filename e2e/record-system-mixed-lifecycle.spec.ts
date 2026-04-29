import { test } from '@playwright/test'

import { assertMeetingLifecycle } from './fixtures/recordingLifecycle'
import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('record system lifecycle @slow', () => {
  test('System source start/stop reaches library when devices allow', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('button', { name: 'System' }).click()
      await assertMeetingLifecycle(window, 'system audio source')
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})

test.describe('record mixed lifecycle @slow', () => {
  test('Mixed source start/stop reaches library when devices allow', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('button', { name: 'Mixed' }).click()
      await assertMeetingLifecycle(window, 'system + microphone sources')
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
