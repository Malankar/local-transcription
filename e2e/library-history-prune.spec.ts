import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'
import type { AppSettings } from '../src/shared/types'

/** History retention has no settings UI anymore (removed from SettingsView); drive it via the settings IPC. */
async function setHistorySettings(
  window: Page,
  partial: Partial<Pick<AppSettings, 'historyLimit' | 'autoDeleteRecordings' | 'keepStarredUntilDeleted'>>,
) {
  await window.evaluate(async (p) => window.api.setSettings(p), partial)
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

      await setHistorySettings(window, { historyLimit: 10 })
      await setHistorySettings(window, { historyLimit: 5 })

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

      await setHistorySettings(window, { historyLimit: 0 })

      const markers: string[] = []
      for (let i = 0; i < 8; i++) {
        const m = `E2E prune autodel ${i} zebra quartz`
        markers.push(m)
        await window.evaluate(async (t) => window.api.e2eSeedHistoryMeeting(t), m)
      }

      await expect
        .poll(async () => (await window.evaluate(() => window.api.listHistory())).length)
        .toBe(8)

      await setHistorySettings(window, { autoDeleteRecordings: 'keep-latest-5' })

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

      expect((await window.evaluate(() => window.api.getSettings())).keepStarredUntilDeleted).toBe(true)

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

      await setHistorySettings(window, { historyLimit: 10 })
      await setHistorySettings(window, { historyLimit: 5 })

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
