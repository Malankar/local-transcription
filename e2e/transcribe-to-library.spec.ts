import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('@fixture transcribe → library', () => {
  test('seeded meeting session appears in Library with Quick Summary from preview', async () => {
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
        return label.startsWith('E2E ')
      }).toPass({ timeout: 30_000 })

      await expect(window.getByRole('heading', { name: label, level: 3 })).toBeVisible()
      await expect(window.getByRole('heading', { name: 'Quick Summary' })).toBeVisible()
      await expect(
        window.locator('.border-blue-200').getByText(body.slice(0, 80), { exact: false }),
      ).toBeVisible()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
