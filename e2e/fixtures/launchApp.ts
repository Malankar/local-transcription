import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Playwright exposes `_electron` at runtime; generated typings omit it.
// https://playwright.dev/docs/api/class-electron
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'

export const projectRoot = path.join(__dirname, '..', '..')
export const electronMain = path.join(projectRoot, 'out', 'main', 'index.js')

function launchEnv(): Record<string, string> {
  const env: Record<string, string> = {
    /** Lets macOS builds call app.quit() when the last window closes so Playwright can exit. */
    E2E_QUIT_ON_LAST_WINDOW: '1',
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') {
      env[key] = value
    }
  }
  return env
}

/**
 * Playwright's electronApp.close() can hang if the app keeps running (tray, macOS dock
 * behavior, or stuck subprocess). Quit from main first, then close with a hard kill fallback.
 */
export async function closeLaunchedApp(electronApp: ElectronApplication): Promise<void> {
  try {
    await electronApp.evaluate(({ app }) => app.quit())
  } catch {
    // IPC may already be torn down
  }

  const timeoutMs = 20_000
  try {
    await Promise.race([
      electronApp.close(),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('electronApp.close timed out')), timeoutMs)
      }),
    ])
  } catch {
    try {
      electronApp.process()?.kill('SIGKILL')
    } catch {
      /* noop */
    }
  }
}

export async function launchApp(options?: { timeout?: number }) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'local-transcribe-e2e-'))
  const electronApp = await electron.launch({
    cwd: projectRoot,
    args: [`--user-data-dir=${userDataDir}`, electronMain],
    env: launchEnv(),
    timeout: options?.timeout ?? 120_000,
  })
  return { electronApp, userDataDir }
}
