import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { test, expect } from '@playwright/test'
// Playwright exposes `_electron` at runtime; generated typings omit it.
// https://playwright.dev/docs/api/class-electron
import { _electron as electron } from 'playwright'

const projectRoot = path.join(__dirname, '..')
const electronMain = path.join(projectRoot, 'out', 'main', 'index.js')

function launchEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') {
      env[key] = value
    }
  }
  return env
}

test.describe('Electron app', () => {
  test('opens a window and loads LocalTranscribe', async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'local-transcribe-e2e-'))

    const electronApp = await electron.launch({
      cwd: projectRoot,
      args: [`--user-data-dir=${userDataDir}`, electronMain],
      env: launchEnv(),
      timeout: 120_000,
    })

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      await expect(window).toHaveTitle(/LocalTranscribe/i)
      await expect(window.locator('#root')).toBeAttached()
    } finally {
      await electronApp.close()
    }
  })
})
