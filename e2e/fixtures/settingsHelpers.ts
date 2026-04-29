import { expect, type Locator, type Page } from '@playwright/test'

export async function openSettingsDialog(window: Page) {
  await window.getByTitle('Settings').click()
  const dialog = window.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible({
    timeout: 30_000,
  })
  return dialog
}

export function historyBlock(dialog: Locator) {
  const historyHeading = dialog.getByRole('heading', { level: 2, name: 'History' })
  return historyHeading.locator('xpath=ancestor::section[1]')
}

export function generalRow(page: Page, label: string) {
  return page
    .getByRole('dialog')
    .locator('div.flex.items-start.justify-between')
    .filter({ has: page.getByRole('heading', { level: 3, name: label }) })
}

export async function openSettings(page: Page) {
  await page.getByTitle('Settings').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible()
}
