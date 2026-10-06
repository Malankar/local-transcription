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

      let metas = await window.evaluate(() => window.api.listHistory())
      // toPass only retries on a thrown assertion, so assert (don't return a boolean) until the
      // stub AI titles have replaced the placeholder labels.
      await expect(async () => {
        metas = await window.evaluate(() => window.api.listHistory())
        expect(metas.length).toBeGreaterThanOrEqual(2)
        expect(metas[0]?.label).toMatch(/^E2E /)
        expect(metas[1]?.label).toMatch(/^E2E /)
      }).toPass({ timeout: 30_000 })

      const newer = metas[0]!
      const older = metas[1]!

      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()

      // Innermost div holding both the Assistant heading and the chat input = the chat panel.
      const assistant = window
        .locator('div')
        .filter({ has: window.getByRole('heading', { name: 'Assistant', exact: true }) })
        .filter({ has: window.getByPlaceholder('Ask a question...') })
        .last()

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
