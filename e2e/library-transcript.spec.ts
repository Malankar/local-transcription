import { test, expect } from '@playwright/test'

import { readLatestE2eExportAfter } from './fixtures/e2eExportFile'
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

  test('export SRT writes e2e auto path with subtitle content', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const line = 'Library transcript e2e SRT export seed line.'
      await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), line)

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Quick Summary' })).toBeVisible()

      const beforeExport = Date.now() - 500
      await window.getByRole('button', { name: 'Export SRT' }).click()

      await expect
        .poll(() => {
          try {
            const body = readLatestE2eExportAfter('srt', beforeExport)
            if (!body.includes(line)) return null
            if (!/^\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/.test(body)) return null
            return body
          } catch {
            return null
          }
        }, { timeout: 15_000 })
        .not.toBeNull()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
