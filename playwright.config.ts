import path from 'node:path'

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
})
