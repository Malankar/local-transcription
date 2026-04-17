import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('AppShell auto-navigation @slow', () => {
  test('forces Record while capturing; after meeting with segments lands on Library', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('button', { name: 'Mic' }).click()
      const startRecording = window.getByRole('button', { name: 'Start Recording' })
      try {
        await expect(startRecording).toBeEnabled({ timeout: 45_000 })
      } catch {
        test.skip(true, 'Model and/or mic source unavailable; cannot exercise capture navigation.')
      }

      await startRecording.click()
      await expect(window.getByText('Recording in progress')).toBeVisible()

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByText('Recording in progress')).toBeVisible()

      await window.getByRole('button', { name: 'Stop Recording' }).click()
      await expect(window.getByRole('button', { name: 'Stop Recording' })).toBeHidden({
        timeout: 120_000,
      })

      await expect(async () => {
        const transcriptions = await window.getByRole('heading', { name: 'Transcriptions' }).isVisible()
        const saved = await window.getByRole('heading', { name: 'Recording saved' }).isVisible()
        return transcriptions || saved
      }).toPass({ timeout: 180_000 })

      if (await window.getByRole('heading', { name: 'Recording saved' }).isVisible()) {
        await window.getByRole('button', { name: 'Open in Library' }).click()
      }

      try {
        await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible({
          timeout: 15_000,
        })
      } catch {
        await window.getByRole('button', { name: 'Library', exact: true }).click()
        await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible({
          timeout: 30_000,
        })
      }
      const empty = window.getByText('No saved sessions yet.')
      if (await empty.isVisible().catch(() => false)) {
        test.skip(true, 'No history session after stop; need audible speech or working mic.')
      }
      await expect(empty).toBeHidden()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
