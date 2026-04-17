import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Library empty list', () => {
  test('shows Transcriptions heading and empty state for fresh profile', async () => {
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('button', { name: 'Library', exact: true }).click()

      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()
      await expect(window.getByText('No saved sessions yet.')).toBeVisible()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
