import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handle, showSaveDialog, writeFile } = vi.hoisted(() => ({
  handle: vi.fn(),
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle },
  dialog: { showSaveDialog },
  BrowserWindow: vi.fn(),
}))

vi.mock('node:fs', () => ({
  promises: { writeFile },
  default: { promises: { writeFile } },
}))

import { registerIpcHandlers } from '../../../src/main/ipc/handlers'

function getHandler(channel: string) {
  const entry = handle.mock.calls.find(([name]) => name === channel)
  return entry?.[1]
}

function makeOptions() {
  return {
    audioCapture: { start: vi.fn(), stop: vi.fn() } as any,
    chunkQueue: { setMode: vi.fn(), clear: vi.fn() } as any,
    sourceDiscovery: { getSources: vi.fn(() => [{ id: 'mic-1', label: 'Mic', isMonitor: false }]) } as any,
    whisperEngine: { setModel: vi.fn(), setPreferGpuAcceleration: vi.fn() } as any,
    modelManager: {
      getSelectedModel: vi.fn().mockResolvedValue('base.en'),
      getSelectedModelForProfile: vi.fn().mockResolvedValue('base.en'),
      getModelSelection: vi.fn().mockResolvedValue({ meeting: 'base.en', live: 'base.en' }),
      getModel: vi.fn(() => ({ id: 'base.en', engine: 'whisper' })),
      getModels: vi.fn(() => []),
      selectModel: vi.fn().mockResolvedValue(undefined),
      downloadModel: vi.fn().mockResolvedValue(undefined),
      cancelDownload: vi.fn(),
    } as any,
    historyManager: {
      listSessions: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      starSession: vi.fn().mockResolvedValue(undefined),
      pruneHistory: vi.fn().mockResolvedValue(undefined),
    } as any,
    settingsManager: {
      getSettings: vi.fn().mockResolvedValue({
        startHidden: false,
        launchOnStartup: false,
        showTrayIcon: true,
        unloadModelAfterMinutes: 5,
        voiceToTextShortcut: '',
        muteWhileRecording: false,
        preferGpuAcceleration: false,
        historyLimit: 5,
        autoDeleteRecordings: 'never',
        keepStarredUntilDeleted: true,
      }),
      updateSettings: vi.fn().mockResolvedValue({
        startHidden: false,
        launchOnStartup: false,
        showTrayIcon: true,
        unloadModelAfterMinutes: 5,
        voiceToTextShortcut: '',
        muteWhileRecording: false,
        preferGpuAcceleration: false,
        historyLimit: 25,
        autoDeleteRecordings: 'never',
        keepStarredUntilDeleted: true,
      }),
    } as any,
    logger: { info: vi.fn(), error: vi.fn() } as any,
    getMainWindow: vi.fn(() => null),
    getTranscriptSegments: vi.fn(() => [{ id: '1', startMs: 0, endMs: 1000, text: 'Hello', timestamp: 'T1' }]),
    resetTranscriptSegments: vi.fn(),
    onCaptureStarted: vi.fn(),
    onSettingsChanged: vi.fn(),
    sendStatus: vi.fn(),
    sendError: vi.fn(),
  }
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers handlers and serves source discovery', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const sourcesGet = getHandler('sources:get')
    await expect(sourcesGet()).resolves.toEqual([{ id: 'mic-1', label: 'Mic', isMonitor: false }])
    expect(options.sendStatus).toHaveBeenCalledWith({ stage: 'discovering', detail: 'Looking up audio sources...' })
    expect(options.sendStatus).toHaveBeenCalledWith({ stage: 'ready', detail: 'Found 1 audio sources' })
  })

  it('starts capture with the selected model and profile-aware queue mode', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const startCapture = getHandler('capture:start')
    await startCapture({}, { mode: 'mixed', systemSourceId: 'sys', micSourceId: 'mic', profile: 'live' })

    expect(options.whisperEngine.setPreferGpuAcceleration).toHaveBeenCalledWith(false)
    expect(options.modelManager.getSelectedModelForProfile).toHaveBeenCalledWith('live')
    expect(options.whisperEngine.setModel).toHaveBeenCalledWith({ id: 'base.en', engine: 'whisper' })
    expect(options.chunkQueue.setMode).toHaveBeenCalledWith('realtime')
    expect(options.audioCapture.start).toHaveBeenCalledWith({
      mode: 'mixed',
      systemSourceId: 'sys',
      micSourceId: 'mic',
      profile: 'live',
    })
    expect(options.onCaptureStarted).toHaveBeenCalled()
  })

  it('prunes history when history-related settings change', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const setSettings = getHandler('settings:set')
    await setSettings({}, { historyLimit: 25 })

    expect(options.settingsManager.updateSettings).toHaveBeenCalledWith({ historyLimit: 25 })
    expect(options.historyManager.pruneHistory).toHaveBeenCalledWith({
      historyLimit: 25,
      autoDeleteRecordings: 'never',
      keepStarredUntilDeleted: true,
    })
  })

  it('exports the current transcript to disk', async () => {
    const options = makeOptions()
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/transcript.txt' })
    registerIpcHandlers(options)

    const exportTxt = getHandler('export:txt')
    await expect(exportTxt()).resolves.toEqual({ canceled: false, path: '/tmp/transcript.txt' })

    expect(writeFile).toHaveBeenCalledWith('/tmp/transcript.txt', 'Hello', 'utf8')
  })
})
