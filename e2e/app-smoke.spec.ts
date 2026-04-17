import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Electron app', () => {
  test('opens a window and loads LocalTranscribe', async () => {
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      await expect(window).toHaveTitle(/LocalTranscribe/i)
      await expect(window.locator('#root')).toBeAttached()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
