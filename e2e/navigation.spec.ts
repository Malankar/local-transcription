import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('@smoke navigation shell', () => {
  test('window title, #root, Record/Library tabs, Settings dialog dismiss', async () => {
    const { electronApp } = await launchApp()

    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForLoadState('load')

      await expect(page).toHaveTitle(/LocalTranscribe/i)
      await expect(page.locator('#root')).toBeAttached()

      await test.step('Record tab shows record surface', async () => {
        await page.getByRole('button', { name: 'Record', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Start Recording' })).toBeVisible()
      })

      await test.step('Library tab shows library surface', async () => {
        await page.getByRole('button', { name: 'Library', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()
        await expect(page.getByText('No saved sessions yet.')).toBeVisible()
      })

      const openSettings = async () => {
        await page.getByRole('navigation').getByTitle('Settings').click()
      }

      await test.step('Settings opens as dialog with Settings heading', async () => {
        await openSettings()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
      })

      await test.step('Close settings with X', async () => {
        await page.getByRole('dialog').getByTitle('Close').click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      await test.step('Close settings with Cancel', async () => {
        await openSettings()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      await test.step('Close settings with Save Settings', async () => {
        await openSettings()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByRole('button', { name: 'Save Settings' }).click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      await test.step('Reopen settings after dismiss', async () => {
        await openSettings()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByTitle('Close').click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      })
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
