import { test, expect, type Page } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

/** Whisper.cpp catalog IDs (download-managed). First not present on disk yields no-model gating. */
const MANAGED_MODEL_IDS = ['tiny.en', 'base.en', 'small.en', 'medium.en', 'large-v3-turbo'] as const

async function ensureTinyModelDownloaded(window: Page) {
  await window.getByTitle('Settings').click()
  const modal = window.getByRole('dialog')
  await expect(modal.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(modal.getByRole('heading', { level: 3, name: 'Start hidden' })).toBeVisible({
    timeout: 30_000,
  })
  await modal.getByText('Transcription models').scrollIntoViewIfNeeded()
  const tinyCard = modal
    .getByText('tiny.en', { exact: true })
    .locator('xpath=ancestor::div[@role="button"][1]')
  await expect(tinyCard).toBeVisible()
  await tinyCard.click()
  if (await tinyCard.getByText('Ready', { exact: true }).isVisible()) {
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()
    return
  }
  await tinyCard.getByRole('button', { name: 'Download' }).click()
  await expect(tinyCard.getByText('Ready', { exact: true })).toBeVisible({ timeout: 120_000 })
  await modal.getByRole('button', { name: 'Cancel' }).click()
  await expect(modal).toBeHidden()
}

test.describe('Record surface gating', () => {
  test('shows no-sources copy when model is ready but sources are incomplete', async ({}, testInfo) => {
    test.setTimeout(300_000)
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await ensureTinyModelDownloaded(window)

      if (await window.getByRole('button', { name: /start recording/i }).isEnabled()) {
        testInfo.skip(
          true,
          'Start Recording already enabled (sources complete for current mode); incomplete-sources hint not shown.',
        )
      }

      await expect(window.getByText('Select audio sources above.')).toBeVisible()
      await expect(window.getByRole('button', { name: /start recording/i })).toBeDisabled()
      const importBtn = window.getByRole('button', { name: /import file/i })
      await expect(importBtn).toBeDisabled()
      await expect(importBtn).toHaveAttribute('title', 'Import file is not available in this build')
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })

  test('shows no-model copy; inline Settings opens modal; Import File stays disabled', async () => {
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      let gating = window.locator('p').filter({ hasText: /Download a transcription model/ })
      for (const modelId of MANAGED_MODEL_IDS) {
        await window.locator('nav').getByTitle('Settings').click()
        const modal = window.getByRole('dialog')
        await expect(modal.getByRole('heading', { name: 'Settings' })).toBeVisible()
        await modal.getByText('Transcription models').scrollIntoViewIfNeeded()
        const card = modal.locator('[role="button"]').filter({ hasText: modelId }).first()
        await expect(card).toBeVisible()
        await card.click()
        await modal.getByRole('button', { name: 'Cancel' }).click()
        await expect(modal).toBeHidden()
        gating = window.locator('p').filter({ hasText: /Download a transcription model/ })
        if (await gating.isVisible()) break
      }

      await expect(gating).toBeVisible()
      await expect(gating.getByRole('button', { name: 'Settings' })).toBeVisible()

      await gating.getByRole('button', { name: 'Settings' }).click()
      await expect(window.getByRole('dialog')).toBeVisible()
      await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible()

      const importBtn = window.getByRole('button', { name: /import file/i })
      await expect(importBtn).toBeDisabled()
      await expect(importBtn).toHaveAttribute('title', 'Import file is not available in this build')
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
