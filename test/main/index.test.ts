import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mainMocks = vi.hoisted(() => {
  const browserWindowInstances: Array<{
    webContents: {
      send: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
      setWindowOpenHandler: ReturnType<typeof vi.fn>
    }
    setMenuBarVisibility: ReturnType<typeof vi.fn>
    loadURL: ReturnType<typeof vi.fn>
    loadFile: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    hide: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    isVisible: ReturnType<typeof vi.fn>
  }> = []

  const app = {
    isPackaged: false,
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    getPath: vi.fn((key: string) => {
      if (key === 'userData') return '/tmp/local-transcription-user-data'
      if (key === 'logs') return '/tmp/local-transcription-logs'
      return '/tmp/local-transcription'
    }),
    quit: vi.fn(),
    setLoginItemSettings: vi.fn(),
  }

  const BrowserWindow = vi.fn(function BrowserWindow(this: unknown, options) {
    const webContents = {
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    }

    const instance = {
      options,
      webContents,
      setMenuBarVisibility: vi.fn(),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      on: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      isVisible: vi.fn(() => false),
    }

    browserWindowInstances.push(instance)
    return instance
  }) as any
  BrowserWindow.getAllWindows = vi.fn(() => browserWindowInstances)

  const Tray = vi.fn()
  const Menu = {
    buildFromTemplate: vi.fn(() => ({})),
  }
  const nativeImage = {
    createFromDataURL: vi.fn(() => ({
      resize: vi.fn(() => ({
        setTemplateImage: vi.fn(),
        isEmpty: vi.fn(() => false),
      })),
    })),
  }
  const globalShortcut = {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  }

  const logger = {
    configureFile: vi.fn(() => '/tmp/local-transcription-logs/localtranscribe.dev.log'),
    configure: vi.fn(() => '/tmp/local-transcription-logs/localtranscribe.log'),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  const audioCapture = {
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(() => false),
  }

  const sourceDiscovery = {
    getSources: vi.fn(() => []),
  }

  const whisperEngine = {
    on: vi.fn(),
    setModel: vi.fn(),
    initialize: vi.fn(),
    startSession: vi.fn(),
    pushAudio: vi.fn(),
    endSession: vi.fn(),
    dispose: vi.fn(),
  }

  const modelManager = {
    setProgressListener: vi.fn(),
    getModels: vi.fn(() => []),
    getSelectedModel: vi.fn(),
    getModel: vi.fn(),
    selectModel: vi.fn(),
    downloadModel: vi.fn(),
    cancelDownload: vi.fn(),
  }

  const historyManager = {
    saveSession: vi.fn(),
    pruneHistory: vi.fn(),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    starSession: vi.fn(),
  }

  const settingsManager = {
    getSettings: vi.fn().mockResolvedValue({
      startHidden: true,
      launchOnStartup: false,
      showTrayIcon: false,
      unloadModelAfterMinutes: 0,
      voiceToTextShortcut: '',
      transcriptionLanguage: 'en',
      themeMode: 'system',
      historyLimit: 5,
      autoDeleteRecordings: 'never',
      keepStarredUntilDeleted: true,
      uiFeatures: {
        enableExternalAssistant: false,
        assistantProvider: 'local',
      },
    }),
    updateSettings: vi.fn(),
  }

  const registerIpcHandlers = vi.fn()
  const AudioCapture = vi.fn(function AudioCapture() {
    return audioCapture
  })
  const SourceDiscovery = vi.fn(function SourceDiscovery() {
    return sourceDiscovery
  })
  const HistoryManager = vi.fn(function HistoryManager() {
    return historyManager
  })
  const AppLogger = vi.fn(function AppLogger() {
    return logger
  })
  const SettingsManager = vi.fn(function SettingsManager() {
    return settingsManager
  })
  const ModelManager = vi.fn(function ModelManager() {
    return modelManager
  })
  const WhisperEngine = vi.fn(function WhisperEngine() {
    return whisperEngine
  })

  return {
    openExternal: vi.fn(),
    app,
    BrowserWindow,
    Tray,
    Menu,
    nativeImage,
    globalShortcut,
    logger,
    audioCapture,
    sourceDiscovery,
    whisperEngine,
    modelManager,
    historyManager,
    settingsManager,
    registerIpcHandlers,
    AudioCapture,
    SourceDiscovery,
    HistoryManager,
    AppLogger,
    SettingsManager,
    ModelManager,
    WhisperEngine,
    browserWindowInstances,
  }
})

vi.mock('electron-updater', () => ({
  autoUpdater: { on: vi.fn(), checkForUpdatesAndNotify: vi.fn(() => Promise.resolve(null)) },
}))

vi.mock('electron', () => ({
  app: mainMocks.app,
  BrowserWindow: mainMocks.BrowserWindow,
  Tray: mainMocks.Tray,
  Menu: mainMocks.Menu,
  nativeImage: mainMocks.nativeImage,
  globalShortcut: mainMocks.globalShortcut,
  shell: { openExternal: mainMocks.openExternal },
}))

vi.mock('../../src/main/audio/AudioCapture', () => ({
  AudioCapture: mainMocks.AudioCapture,
}))

vi.mock('../../src/main/audio/SourceDiscovery', () => ({
  SourceDiscovery: mainMocks.SourceDiscovery,
}))

vi.mock('../../src/main/history/HistoryManager', () => ({
  HistoryManager: mainMocks.HistoryManager,
}))

vi.mock('../../src/main/ipc/handlers', () => ({
  registerIpcHandlers: mainMocks.registerIpcHandlers,
}))

vi.mock('../../src/main/logging/AppLogger', () => ({
  AppLogger: mainMocks.AppLogger,
}))

vi.mock('../../src/main/settings/SettingsManager', () => ({
  SettingsManager: mainMocks.SettingsManager,
}))

vi.mock('../../src/main/transcription/ModelManager', () => ({
  ModelManager: mainMocks.ModelManager,
}))

vi.mock('../../src/main/transcription/WhisperEngine', () => ({
  WhisperEngine: mainMocks.WhisperEngine,
}))

async function importMain(): Promise<void> {
  await import('../../src/main/index')
  await new Promise((resolve) => setImmediate(resolve))
}

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mainMocks.browserWindowInstances.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens target=_blank https links in the browser and never in an app window', async () => {
    await importMain()

    const handler = mainMocks.browserWindowInstances[0].webContents.setWindowOpenHandler.mock.calls[0][0]
    expect(handler({ url: 'https://ollama.com/download' })).toEqual({ action: 'deny' })
    expect(mainMocks.openExternal).toHaveBeenCalledWith('https://ollama.com/download')

    mainMocks.openExternal.mockClear()
    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(mainMocks.openExternal).not.toHaveBeenCalled()
  })

  it('applies settings, registers IPC handlers, and creates the hidden main window', async () => {
    await importMain()

    expect(mainMocks.app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
    expect(mainMocks.registerIpcHandlers).toHaveBeenCalledTimes(1)
    expect(mainMocks.BrowserWindow).toHaveBeenCalledTimes(1)

    const windowOptions = mainMocks.BrowserWindow.mock.calls[0][0]
    expect(windowOptions).toEqual(
      expect.objectContaining({
        width: 1200,
        height: 840,
        minWidth: 980,
        minHeight: 720,
        autoHideMenuBar: true,
        show: true,
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
        }),
      })
    )

    expect(mainMocks.browserWindowInstances[0].setMenuBarVisibility).toHaveBeenCalledWith(false)
    expect(mainMocks.browserWindowInstances[0].loadFile).toHaveBeenCalled()
    expect(mainMocks.browserWindowInstances[0].webContents.send).toHaveBeenCalledWith(
      'status',
      expect.objectContaining({
        stage: 'idle',
        detail: expect.stringContaining('Ready to load audio sources'),
      })
    )

    const registeredOptions = mainMocks.registerIpcHandlers.mock.calls[0][0]
    expect(registeredOptions.getMainWindow()).toBe(mainMocks.browserWindowInstances[0])
    expect(registeredOptions.getTranscriptSegments()).toEqual([])
    expect(mainMocks.app.on).toHaveBeenCalledWith('activate', expect.any(Function))
  })

  it('feeds capture frames to the engine and filters engine segments before sending them', async () => {
    await importMain()

    expect(mainMocks.WhisperEngine).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.stringContaining('silero_vad.onnx')
    )

    const onChunk = mainMocks.audioCapture.on.mock.calls.find(([event]) => event === 'chunk')?.[1]
    const chunk = { audio: new Float32Array(1600), startMs: 0, endMs: 100 }
    onChunk(chunk)
    expect(mainMocks.whisperEngine.pushAudio).toHaveBeenCalledWith(chunk)

    const onSegment = mainMocks.whisperEngine.on.mock.calls.find(([event]) => event === 'segment')?.[1]
    const send = mainMocks.browserWindowInstances[0].webContents.send
    const base = { startMs: 0, endMs: 1000, timestamp: 'T1' }

    onSegment({ ...base, id: 'noise', text: '  42 ' })
    onSegment({ ...base, id: 'real', text: 'I write typescript' })

    const sent = send.mock.calls.filter(([channel]) => channel === 'transcript:segment').map(([, s]) => s)
    expect(sent).toEqual([{ ...base, id: 'real', text: 'I write TypeScript' }])
    const registeredOptions = mainMocks.registerIpcHandlers.mock.calls[0][0]
    expect(registeredOptions.getTranscriptSegments()).toEqual(sent)
  })

  it('stops capture and quits on window-all-closed outside macOS', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

    await importMain()

    const windowAllClosed = mainMocks.app.on.mock.calls.find(([event]) => event === 'window-all-closed')?.[1]
    expect(windowAllClosed).toEqual(expect.any(Function))

    windowAllClosed()

    expect(mainMocks.audioCapture.stop).toHaveBeenCalledOnce()
    expect(mainMocks.whisperEngine.dispose).toHaveBeenCalledOnce()
    expect(mainMocks.app.quit).toHaveBeenCalledOnce()
  })
})
