import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Library AI title loader @slow', () => {
  test('shows generating title status then final title after stub enrichment delay', async () => {
    const { electronApp } = await launchApp({
      env: { E2E_ASSISTANT_DELAY_MS: '900' },
    })
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const body = 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.'
      await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), body)

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()

      const generating = window.getByRole('status', { name: 'Generating recording title' })
      await expect(generating.first()).toBeVisible({ timeout: 15_000 })

      await expect(async () => {
        const labels = await window.evaluate(() => window.api.listHistory().then((h) => h.map((s) => s.label)))
        return labels[0]?.startsWith('E2E ') ?? false
      }).toPass({ timeout: 30_000 })

      await expect(window.getByRole('status', { name: 'Generating recording title' })).toHaveCount(0, {
        timeout: 15_000,
      })
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
