import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handle, showSaveDialog, showOpenDialog, writeFile } = vi.hoisted(() => ({
  handle: vi.fn(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle },
  dialog: { showSaveDialog, showOpenDialog },
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

async function* chunkStream() {
  yield { audio: new Float32Array([0.1, 0.2]), startMs: 0, endMs: 2000 }
  yield { audio: new Float32Array([0.2, 0.3]), startMs: 2000, endMs: 4000 }
}

function makeOptions() {
  return {
    audioCapture: { start: vi.fn(), stop: vi.fn(), isRunning: vi.fn(() => false) } as any,
    chunkQueue: { setMode: vi.fn(), clear: vi.fn(), enqueue: vi.fn(), isIdle: vi.fn(() => true) } as any,
    sourceDiscovery: { getSources: vi.fn(() => [{ id: 'mic-1', label: 'Mic', isMonitor: false }]) } as any,
    whisperEngine: { setModel: vi.fn() } as any,
    modelManager: {
      getSelectedModel: vi.fn().mockResolvedValue('base.en'),
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
    onInputAccepted: vi.fn(),
    onSettingsChanged: vi.fn(),
    sendStatus: vi.fn(),
    sendError: vi.fn(),
    chunkMeetingFile: vi.fn(() => chunkStream()),
    meetingImportService: {
      listConnectors: vi.fn(() => [
        { id: 'google-workspace', label: 'Google Meet / Workspace', enabled: false, reason: 'disabled' },
      ]),
      discoverCandidates: vi.fn().mockResolvedValue([]),
      resolveImportFilePath: vi.fn().mockResolvedValue('/tmp/imported-from-google.wav'),
    } as any,
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

  it('starts capture with the selected model and default queue mode', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const startCapture = getHandler('capture:start')
    await startCapture({}, { mode: 'mixed', systemSourceId: 'sys', micSourceId: 'mic' })

    expect(options.whisperEngine.setModel).toHaveBeenCalledWith({ id: 'base.en', engine: 'whisper' })
    expect(options.chunkQueue.setMode).toHaveBeenCalledWith('default')
    expect(options.audioCapture.start).toHaveBeenCalledWith({
      mode: 'mixed',
      systemSourceId: 'sys',
      micSourceId: 'mic',
    })
    expect(options.onInputAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'record',
        acceptedAtIso: expect.any(String),
      }),
    )
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

  it('queues an uploaded meeting file for transcription', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const transcribeMeetingFile = getHandler('meeting:transcribeFile')
    await transcribeMeetingFile({}, '/tmp/meeting.wav')

    expect(options.chunkMeetingFile).toHaveBeenCalledWith('/tmp/meeting.wav')
    expect(options.chunkQueue.enqueue).toHaveBeenCalledTimes(2)
    expect(options.sendStatus).toHaveBeenCalledWith({
      stage: 'processing',
      detail: 'Transcribing uploaded meeting audio...',
    })
    expect(options.onInputAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'upload',
        acceptedAtIso: expect.any(String),
      }),
    )
  })

  it('opens a file picker when no upload path is provided', async () => {
    const options = makeOptions()
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/dialog-selected.wav'] })
    registerIpcHandlers(options)

    const transcribeMeetingFile = getHandler('meeting:transcribeFile')
    await transcribeMeetingFile({})

    expect(showOpenDialog).toHaveBeenCalled()
    expect(options.chunkMeetingFile).toHaveBeenCalledWith('/tmp/dialog-selected.wav')
  })

  it('rejects uploaded transcription while queue is still active', async () => {
    const options = makeOptions()
    options.chunkQueue.isIdle.mockReturnValue(false)
    registerIpcHandlers(options)

    const transcribeMeetingFile = getHandler('meeting:transcribeFile')
    await expect(transcribeMeetingFile({}, '/tmp/meeting.wav')).rejects.toThrow(
      'Please wait for current transcription processing to finish before importing a file.'
    )
    expect(options.chunkMeetingFile).not.toHaveBeenCalled()
    expect(options.sendError).toHaveBeenCalledWith(
      'Please wait for current transcription processing to finish before importing a file.'
    )
  })

  it('returns meeting import connector descriptors', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const listConnectors = getHandler('meetingImport:listConnectors')
    await expect(listConnectors()).resolves.toEqual([
      { id: 'google-workspace', label: 'Google Meet / Workspace', enabled: false, reason: 'disabled' },
    ])
    expect(options.meetingImportService.listConnectors).toHaveBeenCalled()
  })

  it('imports a meeting via integration and queues resolved file', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const importMeeting = getHandler('meetingImport:import')
    await importMeeting({}, { connectorId: 'google-workspace', meetingId: 'file:/tmp/incoming.wav' })

    expect(options.meetingImportService.resolveImportFilePath).toHaveBeenCalledWith({
      connectorId: 'google-workspace',
      meetingId: 'file:/tmp/incoming.wav',
    })
    expect(options.chunkMeetingFile).toHaveBeenCalledWith('/tmp/imported-from-google.wav')
    expect(options.chunkQueue.enqueue).toHaveBeenCalledTimes(2)
    expect(options.onInputAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'integration',
        acceptedAtIso: expect.any(String),
      }),
    )
  })

  it('stops active capture and updates status', async () => {
    const options = makeOptions()
    registerIpcHandlers(options)

    const stopCapture = getHandler('capture:stop')
    await stopCapture()

    expect(options.audioCapture.stop).toHaveBeenCalledTimes(1)
    expect(options.sendStatus).toHaveBeenCalledWith({
      stage: 'stopped',
      detail: 'Capture stopped',
    })
  })
})
