import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('@fixture transcribe → library', () => {
  test('seeded meeting session appears in Library with Summary from preview', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const body =
        'Deterministic e2e library seed text for preview slice and list visibility checks.'
      await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), body)

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()

      let label = ''
      await expect(async () => {
        const m = await window.evaluate(() => window.api.listHistory())
        label = m[0]?.label ?? ''
        expect(label).toMatch(/^E2E /)
      }).toPass({ timeout: 30_000 })

      await expect(window.getByRole('heading', { name: label, level: 3 })).toBeVisible()
      const summaryHeading = window.getByRole('heading', { name: 'Summary', exact: true })
      await expect(summaryHeading).toBeVisible()
      await expect(
        window
          .locator('[data-slot="card"]')
          .filter({ has: summaryHeading })
          .getByText(body.slice(0, 80), { exact: false }),
      ).toBeVisible()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
