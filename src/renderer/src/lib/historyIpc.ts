import type { LocalTranscribeApi } from '../../../shared/types'

/**
 * Summary regeneration — uses typed preload API, then ipcInvoke fallback (same preload build).
 * If both missing, preload predates this feature: fully quit Electron and restart `pnpm dev`.
 */
export async function invokeRegenerateHistorySummary(sessionId: string): Promise<void> {
  const api = window.api as LocalTranscribeApi
  if (typeof api.regenerateHistorySummary === 'function') {
    await api.regenerateHistorySummary(sessionId)
    return
  }
  if (typeof api.ipcInvoke === 'function') {
    await api.ipcInvoke('history:regenerateSummary', sessionId)
    return
  }
  throw new Error(
    'Preload has no regenerateHistorySummary/ipcInvoke. Quit the app completely and run `pnpm dev` again (preload only loads at startup).',
  )
}
