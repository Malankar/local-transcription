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

function historyBlock(dialog: Locator) {
  const historyHeading = dialog.getByRole('heading', { level: 2, name: 'History' })
  return historyHeading.locator('xpath=ancestor::section[1]')
}

function librarySidebarSessionButtons(window: Page) {
  const section = window.getByRole('heading', { name: 'Transcriptions' }).locator('xpath=..')
  return section.getByRole('button')
}

async function previewSubstringInHistory(window: Page, substring: string): Promise<boolean> {
  return window.evaluate(async (s) => {
    const list = await window.api.listHistory()
    return list.some((x) => x.preview.includes(s))
  }, substring)
}

async function historySessionIdForPreview(window: Page, substring: string): Promise<string | undefined> {
  return window.evaluate(async (s) => {
    const list = await window.api.listHistory()
    return list.find((x) => x.preview.includes(s))?.id
  }, substring)
}

test.describe('Library history prune', () => {
  test('session limit change drops oldest meetings', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const markers: string[] = []
      for (let i = 0; i < 7; i++) {
        const m = `E2E prune limit seed ${i} zebra quartz`
        markers.push(m)
        await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), m)
      }

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(7)

      const dialog = await openSettingsDialog(window)
      const section = historyBlock(dialog)
      await section.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

      const sessionLimit = section.getByRole('combobox').first()
      await sessionLimit.click()
      await window.getByRole('option', { name: '10 sessions', exact: true }).click()
      await expect(sessionLimit).toContainText('10 sessions')

      await sessionLimit.click()
      await window.getByRole('option', { name: '5 sessions', exact: true }).click()
      await expect(sessionLimit).toContainText('5 sessions')

      await dialog.getByTitle('Close').click()
      await expect(window.getByRole('dialog')).toHaveCount(0)

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(5)

      // History list in renderer only refetches on mount / history:saved; reload syncs after main prune.
      await window.reload()
      await window.waitForLoadState('domcontentloaded')
      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()
      await expect(librarySidebarSessionButtons(window)).toHaveCount(5)

      expect(await previewSubstringInHistory(window, markers[0])).toBe(false)
      expect(await previewSubstringInHistory(window, markers[1])).toBe(false)
      expect(await previewSubstringInHistory(window, markers[6])).toBe(true)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })

  test('auto-delete keep latest removes oldest meetings', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const dialog0 = await openSettingsDialog(window)
      const section0 = historyBlock(dialog0)
      await section0.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

      const sessionLimit0 = section0.getByRole('combobox').first()
      await sessionLimit0.click()
      await window.getByRole('option', { name: 'Unlimited', exact: true }).click()
      await expect(sessionLimit0).toContainText('Unlimited')

      await dialog0.getByTitle('Close').click()
      await expect(window.getByRole('dialog')).toHaveCount(0)

      const markers: string[] = []
      for (let i = 0; i < 8; i++) {
        const m = `E2E prune autodel ${i} zebra quartz`
        markers.push(m)
        await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), m)
      }

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(8)

      const dialog = await openSettingsDialog(window)
      const section = historyBlock(dialog)
      await section.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

      const autoDelete = section.getByRole('combobox').nth(1)
      await autoDelete.click()
      await window.getByRole('option', { name: 'Keep latest 5', exact: true }).click()
      await expect(autoDelete).toContainText('Keep latest 5')

      await dialog.getByTitle('Close').click()
      await expect(window.getByRole('dialog')).toHaveCount(0)

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(5)

      await window.reload()
      await window.waitForLoadState('domcontentloaded')
      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(librarySidebarSessionButtons(window)).toHaveCount(5)

      expect(await previewSubstringInHistory(window, markers[0])).toBe(false)
      expect(await previewSubstringInHistory(window, markers[2])).toBe(false)
      expect(await previewSubstringInHistory(window, markers[7])).toBe(true)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })

  test('session limit keeps oldest when starred and keep-starred setting on', async () => {
    const { electronApp } = await launchApp()
    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const dialog0 = await openSettingsDialog(window)
      const section0 = historyBlock(dialog0)
      await section0.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()
      await expect(section0.getByRole('switch')).toBeChecked()
      await dialog0.getByTitle('Close').click()
      await expect(window.getByRole('dialog')).toHaveCount(0)

      const markers: string[] = []
      for (let i = 0; i < 7; i++) {
        const m = `E2E prune star keep ${i} zebra quartz`
        markers.push(m)
        await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), m)
      }

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(7)

      const oldestId = await historySessionIdForPreview(window, markers[0])
      if (!oldestId) throw new Error('expected seeded oldest session id')
      await window.evaluate(async ({ id }) => window.api.starHistorySession(id, true), { id: oldestId })

      const dialog = await openSettingsDialog(window)
      const section = historyBlock(dialog)
      await section.getByRole('heading', { level: 2, name: 'History' }).scrollIntoViewIfNeeded()

      const sessionLimit = section.getByRole('combobox').first()
      await sessionLimit.click()
      await window.getByRole('option', { name: '10 sessions', exact: true }).click()
      await expect(sessionLimit).toContainText('10 sessions')

      await sessionLimit.click()
      await window.getByRole('option', { name: '5 sessions', exact: true }).click()
      await expect(sessionLimit).toContainText('5 sessions')

      await dialog.getByTitle('Close').click()
      await expect(window.getByRole('dialog')).toHaveCount(0)

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(6)

      await window.reload()
      await window.waitForLoadState('domcontentloaded')
      await window.getByRole('button', { name: 'Library', exact: true }).click()
      await expect(window.getByRole('heading', { name: 'Transcriptions' })).toBeVisible()
      await expect(librarySidebarSessionButtons(window)).toHaveCount(6)

      expect(await previewSubstringInHistory(window, markers[0])).toBe(true)
      expect(await previewSubstringInHistory(window, markers[1])).toBe(false)
      expect(await previewSubstringInHistory(window, markers[6])).toBe(true)
    } finally {
      await closeLaunchedApp(electronApp)
    }
  })
})
