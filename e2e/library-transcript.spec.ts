import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Library transcript viewer', () => {
  test('summary, copy Copied!, export TXT, delete', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const line = 'Library transcript e2e copy export delete seed line.'
      await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), line)

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Quick Summary' })).toBeVisible()
      await expect(window.locator('.border-blue-200').getByText(line, { exact: false })).toBeVisible()

      await window.getByRole('button', { name: 'Copy Transcript' }).click()
      await expect(window.getByRole('button', { name: 'Copied!' })).toBeVisible()

      await window.getByRole('button', { name: 'Export TXT' }).click()

      await window.getByRole('button', { name: 'Delete' }).click()
      await expect(window.getByText('No saved sessions yet.')).toBeVisible()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
