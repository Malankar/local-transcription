import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Library assistant', () => {
  test('greeting tracks session; send gets mock reply; switching session resets chat', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const textB =
        'Bravo charlie delta echo foxtrot golf hotel india juliet kilo lima metro nova.'
      const textA =
        'Oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu.'

      await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), textB)
      await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), textA)

      const metas = await window.evaluate(() => window.api.listHistory())
      expect(metas.length).toBeGreaterThanOrEqual(2)

      const newer = metas[0]
      const older = metas[1]

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()

      const assistant = window
        .locator('div')
        .filter({ has: window.getByText('Ask about this transcript') })
        .first()

      await expect(assistant.getByText(`"${newer.label}"`, { exact: false })).toBeVisible()

      await window
        .getByRole('button')
        .filter({ has: window.getByRole('heading', { level: 3, name: older.label }) })
        .click()

      await expect(assistant.getByText(`"${older.label}"`, { exact: false })).toBeVisible()

      await window.getByPlaceholder('Ask a question...').fill('Give me a summary')
      await window.getByPlaceholder('Ask a question...').press('Enter')
      await expect(assistant.getByText(/key points/i)).toBeVisible({ timeout: 5000 })
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
