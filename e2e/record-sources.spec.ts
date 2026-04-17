import { test, expect } from '@playwright/test'

import { closeLaunchedApp, launchApp } from './fixtures/launchApp'

test.describe('Record surface — audio sources', () => {
  test('System / Mic / Mixed toggles show matching device selects', async () => {
    const { electronApp } = await launchApp()

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await expect(window.getByText('Audio Input', { exact: true })).toBeVisible()

      const systemBtn = window.getByRole('button', { name: 'System' })
      const micBtn = window.getByRole('button', { name: 'Mic' })
      const mixedBtn = window.getByRole('button', { name: 'Mixed' })

      await mixedBtn.click()
      await expect(window.getByText('System Source', { exact: true })).toBeVisible()
      await expect(window.getByText('Microphone', { exact: true })).toBeVisible()
      await expect(window.getByRole('combobox')).toHaveCount(2)

      await systemBtn.click()
      await expect(window.getByText('System Source', { exact: true })).toBeVisible()
      await expect(window.getByText('Microphone', { exact: true })).toHaveCount(0)
      await expect(window.getByRole('combobox')).toHaveCount(1)

      await micBtn.click()
      await expect(window.getByText('Microphone', { exact: true })).toBeVisible()
      await expect(window.getByText('System Source', { exact: true })).toHaveCount(0)
      await expect(window.getByRole('combobox')).toHaveCount(1)

      await mixedBtn.click()
      await expect(window.getByRole('combobox')).toHaveCount(2)
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
