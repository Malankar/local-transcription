import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

function generalRow(page: Page, label: string) {
  return page
    .getByRole('dialog')
    .locator('div.flex.items-start.justify-between')
    .filter({ has: page.getByRole('heading', { level: 3, name: label }) })
}

async function openSettings(page: Page) {
  await page.getByTitle('Settings').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible()
}

test.describe('Settings persist across restart', () => {
  test('Start hidden survives relaunch with same userDataDir', async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'local-transcribe-e2e-persist-'))

    const first = await launchApp({ userDataDir })
    try {
      const page = await first.electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Start hidden')
      const sw = row.getByRole('switch')
      await expect(sw).not.toBeChecked()
      await sw.click()
      await expect(sw).toBeChecked()
    } finally {
      await closeLaunchedApp(first.electronApp)
    }

    const second = await launchApp({ userDataDir })
    try {
      const page = await second.electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Start hidden')
      await expect(row.getByRole('switch')).toBeChecked()

      const after = await page.evaluate(() => globalThis.api.getSettings())
      expect(after.startHidden).toBe(true)
    } finally {
      await closeLaunchedApp(second.electronApp)
    }
  })
})
