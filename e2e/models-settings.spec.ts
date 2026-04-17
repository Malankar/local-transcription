import { test, expect, type Locator } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('@slow Settings transcription models', () => {
  test.setTimeout(300_000)

  async function openModelsSection() {
    const { electronApp } = await launchApp()
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('navigation').getByTitle('Settings').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible({
      timeout: 30_000,
    })
    const sectionTitle = dialog.getByText('Transcription models')
    await expect(sectionTitle).toBeVisible()
    await sectionTitle.scrollIntoViewIfNeeded()
    return { electronApp, page, dialog }
  }

  function modelCard(dialog: Locator) {
    return (modelId: string) =>
      dialog
        .getByText(modelId, { exact: true })
        .locator('xpath=ancestor::div[@role="button"][1]')
  }

  test('model cards: selection styling', async () => {
    const { electronApp, dialog } = await openModelsSection()
    const card = modelCard(dialog)

    try {
      const tinyCard = card('tiny.en')
      const baseCard = card('base.en')
      await expect(tinyCard).toBeVisible()
      await expect(baseCard).toBeVisible()
      const selectedBorder = /border-foreground\/25/

      await tinyCard.click()
      await expect(tinyCard).toHaveClass(selectedBorder)
      await baseCard.click()
      await expect(baseCard).toHaveClass(selectedBorder)
      await expect(tinyCard).not.toHaveClass(selectedBorder)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })

  test('download: cancel shows destructive alert', async () => {
    const { electronApp, dialog } = await openModelsSection()
    const card = modelCard(dialog)
    const tinyCard = card('tiny.en')

    try {
      await tinyCard.click()
      if (await tinyCard.getByText('Ready', { exact: true }).isVisible()) {
        await tinyCard.getByRole('button', { name: 'Remove' }).click()
      }
      await expect(tinyCard.getByRole('button', { name: 'Download' })).toBeVisible()

      await tinyCard.getByRole('button', { name: 'Download' }).click()
      await expect(tinyCard.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 60_000 })
      await expect(tinyCard.getByText(/Starting download|\d+\s*%\s*[—-]/)).toBeVisible({ timeout: 30_000 })
      await tinyCard.getByRole('button', { name: 'Cancel' }).click()
      const alert = dialog.getByRole('alert')
      await expect(alert).toBeVisible()
      await expect(alert).toHaveClass(/border-red/)
      await expect(alert).toContainText(/canceled/i)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })

  test('download: completes to Ready then Remove', async () => {
    const { electronApp, dialog } = await openModelsSection()
    const card = modelCard(dialog)
    const tinyCard = card('tiny.en')

    try {
      await tinyCard.click()
      if (await tinyCard.getByText('Ready', { exact: true }).isVisible()) {
        await tinyCard.getByRole('button', { name: 'Remove' }).click()
      }
      await expect(tinyCard.getByRole('button', { name: 'Download' })).toBeVisible()

      await tinyCard.getByRole('button', { name: 'Download' }).click()
      await expect(tinyCard.getByText('Ready', { exact: true })).toBeVisible({ timeout: 180_000 })
      await expect(tinyCard.getByRole('button', { name: 'Remove' })).toBeVisible()
      await tinyCard.getByRole('button', { name: 'Remove' }).click()
      await expect(tinyCard.getByRole('button', { name: 'Download' })).toBeVisible()
      await expect(tinyCard.getByText('Ready', { exact: true })).toHaveCount(0)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
