import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Record surface — audio sources', () => {
  test('System Audio / Microphone / Mix toggles show matching device selects', async () => {
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await expect(window.getByText('Source type', { exact: true })).toBeVisible()

      const systemBtn = window.getByRole('button', { name: /^System Audio/ })
      const micBtn = window.getByRole('button', { name: /^Microphone/ })
      const mixedBtn = window.getByRole('button', { name: /^Mix\b/ })
      // Scope to the source controls so the model language select (multilingual models) isn't counted.
      const sourceControls = window
        .locator('div')
        .filter({ has: window.getByText('Source type', { exact: true }) })
        .filter({ has: window.getByTitle('Refresh audio sources') })
        .last()
      const deviceSelects = sourceControls.getByRole('combobox')
      const systemLabel = window.getByText('System audio device', { exact: true })
      const micLabel = window.getByText('Microphone device', { exact: true })

      await mixedBtn.click()
      await expect(systemLabel).toBeVisible()
      await expect(micLabel).toBeVisible()
      await expect(deviceSelects).toHaveCount(2)

      await systemBtn.click()
      await expect(systemLabel).toBeVisible()
      await expect(micLabel).toHaveCount(0)
      await expect(deviceSelects).toHaveCount(1)

      await micBtn.click()
      await expect(micLabel).toBeVisible()
      await expect(systemLabel).toHaveCount(0)
      await expect(deviceSelects).toHaveCount(1)

      await mixedBtn.click()
      await expect(deviceSelects).toHaveCount(2)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })

  test('Refresh devices control is visible and usable while idle', async () => {
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const refreshBtn = window.getByTitle('Refresh audio sources')
      await expect(refreshBtn).toBeVisible()
      await expect(refreshBtn).toBeEnabled()
      await refreshBtn.click()
      await expect(refreshBtn).toBeEnabled()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
