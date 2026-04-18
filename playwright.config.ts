import path from 'node:path'

import { defineConfig } from '@playwright/test'

/*
 * Manual / OS integration (not covered here): tray show/hide and menu actions, global
 * voice shortcut while unfocused, start-hidden / minimize-to-tray launch, single-instance.
 */

/** Hard cap for the full `playwright test` run so the CLI cannot wait indefinitely. */
const GLOBAL_SUITE_MS = Number(process.env.E2E_GLOBAL_TIMEOUT_MS) || 90 * 60 * 1000

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  globalTimeout: GLOBAL_SUITE_MS,
  expect: {
    timeout: 20_000,
  },
  use: {
    actionTimeout: 60_000,
    navigationTimeout: 120_000,
  },
  reporter: [['list']],
})
