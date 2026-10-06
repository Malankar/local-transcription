import { expect, test } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'
import { generalRow, openSettings } from './fixtures/settingsHelpers'

test.describe('Settings — General — Start hidden', () => {
  test('toggle persists switch state in UI', async () => {
    const { electronApp } = await launchApp()
    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Start hidden')
      const sw = row.getByRole('switch')
      await expect(sw).not.toBeChecked()
      await sw.click()
      await expect(sw).toBeChecked()
      await sw.click()
      await expect(sw).not.toBeChecked()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})

test.describe('Settings — General — Launch on startup', () => {
  test('toggle updates Launch on startup switch', async () => {
    const { electronApp } = await launchApp()
    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Launch on startup')
      const sw = row.getByRole('switch')
      await expect(sw).not.toBeChecked()
      await sw.click()
      await expect(sw).toBeChecked()
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})

test.describe('Settings — General — Theme', () => {
  test('select changes document theme', async () => {
    const { electronApp } = await launchApp()
    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Theme')
      const trigger = row.getByRole('combobox')
      await expect(trigger).toContainText('System')

      await trigger.click()
      await page.getByRole('option', { name: 'Dark' }).click()
      await expect(page.locator('html')).toHaveClass(/dark/)

      await trigger.click()
      await page.getByRole('option', { name: 'Light' }).click()
      await expect(page.locator('html')).not.toHaveClass(/dark/)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})

test.describe('Settings — General — Show tray icon', () => {
  test('toggle updates tray switch; on Linux shows restart hint and disables control', async () => {
    const { electronApp } = await launchApp()
    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Show tray icon')
      const sw = row.getByRole('switch')
      await expect(sw).toBeChecked()

      await sw.click()
      await expect(sw).not.toBeChecked()

      if (process.platform === 'linux') {
        await expect(row.getByText('Restart to apply')).toBeVisible()
        await expect(sw).toBeDisabled()
      } else {
        await sw.click()
        await expect(sw).toBeChecked()
      }
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})

test.describe('Settings — General — Start and stop recording shortcut', () => {
  test('shortcut input captures a new key combination', async () => {
    const { electronApp } = await launchApp()
    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await openSettings(page)

      const row = generalRow(page, 'Start and stop recording shortcut')
      const input = row.getByRole('textbox')
      await input.click()
      await expect(input).toHaveValue('Press keys…')

      await page.keyboard.press('Control+Shift+KeyB')
      await expect(input).toHaveValue('Control+Shift+B')
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
