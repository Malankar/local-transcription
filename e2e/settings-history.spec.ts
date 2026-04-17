import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

async function openSettingsDialog(window: Page) {
  await window.getByTitle('Settings').click()
  const dialog = window.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible({
    timeout: 30_000,
  })
  return dialog
}

/** History block: SectionLabel `History` (h2) plus the card with session / auto-delete / keep starred controls. */
function historyBlock(dialog: Locator) {
  const historyHeading = dialog.getByRole('heading', { level: 2, name: 'History' })
  return historyHeading.locator('xpath=ancestor::section[1]')
}

test.describe('Settings — History', () => {
  test.describe('Session limit', () => {
    test('select updates the session limit value', async () => {
      const { electronApp } = await launchApp()
      try {
        const window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')
        const dialog = await openSettingsDialog(window)
        const section = historyBlock(dialog)
        await section.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

        const sessionLimit = section.getByRole('combobox').first()
        await expect(sessionLimit).toContainText('5 sessions')

        await sessionLimit.click()
        await window.getByRole('option', { name: '10 sessions' }).click()
        await expect(sessionLimit).toContainText('10 sessions')
      } finally {
        await closeLaunchedApp(electronApp)
      }
    })
  })

  test.describe('Auto-delete recordings', () => {
    test('select updates the auto-delete policy', async () => {
      const { electronApp } = await launchApp()
      try {
        const window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')
        const dialog = await openSettingsDialog(window)
        const section = historyBlock(dialog)
        await section.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

        const autoDelete = section.getByRole('combobox').nth(1)
        await expect(autoDelete).toContainText('Never')

        await autoDelete.click()
        await window.getByRole('option', { name: 'Keep latest 10' }).click()
        await expect(autoDelete).toContainText('Keep latest 10')
      } finally {
        await closeLaunchedApp(electronApp)
      }
    })
  })

  test.describe('Keep starred recordings', () => {
    test('switch toggles starred retention', async () => {
      const { electronApp } = await launchApp()
      try {
        const window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')
        const dialog = await openSettingsDialog(window)
        const section = historyBlock(dialog)
        await section.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

        const keepStarred = section.getByRole('switch')
        await expect(keepStarred).toBeChecked()

        await keepStarred.click()
        await expect(keepStarred).not.toBeChecked()

        await keepStarred.click()
        await expect(keepStarred).toBeChecked()
      } finally {
        await closeLaunchedApp(electronApp)
      }
    })
  })
})
