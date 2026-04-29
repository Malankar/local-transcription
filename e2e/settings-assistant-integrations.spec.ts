import { test, expect, type Locator, type Page } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

function assistantIntegrationsSection(dialog: Locator) {
  const providerHeading = dialog.getByRole('heading', { level: 3, name: 'Assistant provider' })
  return providerHeading.locator('xpath=ancestor::section[1]')
}

/** SettingRow root: flex row with label h3 and control (matches `justify-between` in SettingsView). */
function settingRow(dialog: Locator, label: string) {
  return dialog
    .getByRole('heading', { level: 3, name: label })
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
}

async function openSettingsAndScrollToAssistant(window: Page) {
  await window.getByTitle('Settings').click()
  const dialog = window.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible({
    timeout: 30_000,
  })
  const providerHeading = dialog.getByRole('heading', { level: 3, name: 'Assistant provider' })
  await expect(providerHeading).toBeVisible({ timeout: 30_000 })
  await providerHeading.scrollIntoViewIfNeeded()
  return { dialog, section: assistantIntegrationsSection(dialog) }
}

async function testToggleSetting(window: Page, headingName: string) {
  const { dialog } = await openSettingsAndScrollToAssistant(window)
  await dialog.getByRole('heading', { level: 3, name: headingName }).scrollIntoViewIfNeeded()
  const toggle = settingRow(dialog, headingName).getByRole('switch')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('data-state', 'unchecked')

  await toggle.click()
  await expect(toggle).toHaveAttribute('data-state', 'checked')

  await toggle.click()
  await expect(toggle).toHaveAttribute('data-state', 'unchecked')
}

test.describe('Settings — Assistant & integrations', () => {
  test.describe('Assistant provider select', () => {
    test('shows default and allows choosing another provider', async () => {
      const { electronApp } = await launchApp()
      try {
        const window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')

        const { section } = await openSettingsAndScrollToAssistant(window)

        const providerSelect = section.getByRole('combobox')
        await expect(providerSelect).toBeVisible()
        await expect(providerSelect).toContainText(/local/i)

        await providerSelect.click()
        await window.getByRole('option', { name: 'OpenAI GPT-4', exact: true }).click()
        await expect(providerSelect).toContainText('OpenAI GPT-4')
      } finally {
        await closeLaunchedApp(electronApp)
      }
    })
  })

  test.describe('Enable external assistant toggle', () => {
    test('switches between off and on', async () => {
      const { electronApp } = await launchApp()
      try {
        const window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')
        await testToggleSetting(window, 'Enable external assistant')
      } finally {
        await closeLaunchedApp(electronApp)
      }
    })
  })

  test.describe('Third-party integrations toggle', () => {
    test('switches between off and on', async () => {
      const { electronApp } = await launchApp()
      try {
        const window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')
        await testToggleSetting(window, 'Third-party integrations')
      } finally {
        await closeLaunchedApp(electronApp)
      }
    })
  })
})
