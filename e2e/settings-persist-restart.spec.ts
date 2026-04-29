import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'
import { generalRow, openSettings } from './fixtures/settingsHelpers'

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
