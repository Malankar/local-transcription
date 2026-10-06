import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handle, showSaveDialog, writeFile, openExternal, getMediaAccessStatus, askForMediaAccess } =
  vi.hoisted(() => ({
    handle: vi.fn(),
    showSaveDialog: vi.fn(),
    writeFile: vi.fn(),
    openExternal: vi.fn(),
    getMediaAccessStatus: vi.fn(),
    askForMediaAccess: vi.fn(),
  }))

vi.mock('electron', () => ({
  ipcMain: { handle },
  dialog: { showSaveDialog },
  shell: { openExternal },
  systemPreferences: { getMediaAccessStatus, askForMediaAccess },
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

const model = {
  id: 'base',
  engine: 'sherpa',
  languageOptions: [
    { code: 'en', label: 'English' },
    { code: 'de', label: 'German' },
  ],
}

function makeOptions() {
  return {
    audioCapture: { start: vi.fn(), stop: vi.fn(), isRunning: vi.fn(() => false) } as any,
    sourceDiscovery: { getSources: vi.fn(() => [{ id: 'mic-1', label: 'Mic', isMonitor: false }]) } as any,
    whisperEngine: {
      setModel: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
      startSession: vi.fn().mockResolvedValue(undefined),
    } as any,
    modelManager: {
      getSelectedModel: vi.fn().mockResolvedValue('base.en'),
      getModel: vi.fn(() => model),
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
        transcriptionLanguage: 'de',
        historyLimit: 5,
        autoDeleteRecordings: 'never',
        keepStarredUntilDeleted: true,
      }),
      updateSettings: vi.fn().mockResolvedValue({
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
    stopCaptureAndFinish: vi.fn().mockResolvedValue(undefined),
    onModelWarmedUp: vi.fn(),
    onSettingsChanged: vi.fn(),
    sendStatus: vi.fn(),
    sendError: vi.fn(),
  }
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMediaAccessStatus.mockReturnValue('granted')
  })

  it('registers handlers and serves source discovery', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const sourcesGet = getHandler('sources:get')
    await expect(sourcesGet()).resolves.toEqual([{ id: 'mic-1', label: 'Mic', isMonitor: false }])
    expect(options.sendStatus).toHaveBeenCalledWith({ stage: 'discovering', detail: 'Looking up audio sources...' })
    expect(options.sendStatus).toHaveBeenCalledWith({ stage: 'ready', detail: 'Found 1 audio sources' })
  })

  it('starts capture with the selected model and language, then opens a session', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const startCapture = getHandler('capture:start')
    await startCapture({}, { mode: 'mixed', systemSourceId: 'sys', micSourceId: 'mic', profile: 'live' })

    expect(options.whisperEngine.setModel).toHaveBeenCalledWith(model, 'de')
    expect(options.audioCapture.start).toHaveBeenCalledWith({
      mode: 'mixed',
      systemSourceId: 'sys',
      micSourceId: 'mic',
      profile: 'live',
    })
    expect(options.whisperEngine.startSession).toHaveBeenCalled()
    expect(options.onCaptureStarted).toHaveBeenCalledWith('live', expect.any(String))
  })

  it('refuses to start while capture is already running', async () => {
    const options = makeOptions()
    options.audioCapture.isRunning.mockReturnValue(true)
    registerIpcHandlers(options)

    await expect(getHandler('capture:start')({}, { mode: 'mic', micSourceId: 'mic' })).rejects.toThrow(
      'already running'
    )
    expect(options.whisperEngine.startSession).not.toHaveBeenCalled()
  })

  it('stops capture through stopCaptureAndFinish', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    await getHandler('capture:stop')()

    expect(options.stopCaptureAndFinish).toHaveBeenCalledWith('Capture stopped')
  })

  it('warms up the selected model when idle', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    await getHandler('transcription:warmup')()

    expect(options.whisperEngine.setModel).toHaveBeenCalledWith(model, 'de')
    expect(options.whisperEngine.initialize).toHaveBeenCalled()
    expect(options.onModelWarmedUp).toHaveBeenCalled()
  })

  it.runIf(process.platform === 'darwin')('refuses to capture when macOS mic access is denied', async () => {
    getMediaAccessStatus.mockReturnValue('denied')
    askForMediaAccess.mockResolvedValue(false)
    const options = makeOptions()
    registerIpcHandlers(options)

    const startCapture = getHandler('capture:start')
    await expect(startCapture({}, { mode: 'mic', micSourceId: 'mic' })).rejects.toThrow(/Microphone access/)

    expect(askForMediaAccess).toHaveBeenCalledWith('microphone')
    expect(openExternal).toHaveBeenCalled()
    expect(options.audioCapture.start).not.toHaveBeenCalled()
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
