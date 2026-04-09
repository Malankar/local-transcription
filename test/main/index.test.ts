import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mainMocks = vi.hoisted(() => {
  const browserWindowInstances: Array<{
    webContents: {
      send: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
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

  const chunkQueue = {
    on: vi.fn(),
    setMode: vi.fn(),
    clear: vi.fn(),
    enqueue: vi.fn(),
  }

  const sourceDiscovery = {
    getSources: vi.fn(() => []),
  }

  const whisperEngine = {
    setModel: vi.fn(),
    transcribe: vi.fn(),
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
      muteWhileRecording: false,
      historyLimit: 5,
      autoDeleteRecordings: 'never',
      keepStarredUntilDeleted: true,
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
  const ChunkQueue = vi.fn(function ChunkQueue() {
    return chunkQueue
  })
  const ModelManager = vi.fn(function ModelManager() {
    return modelManager
  })
  const WhisperEngine = vi.fn(function WhisperEngine() {
    return whisperEngine
  })

  return {
    app,
    BrowserWindow,
    Tray,
    Menu,
    nativeImage,
    globalShortcut,
    logger,
    audioCapture,
    chunkQueue,
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
    ChunkQueue,
    ModelManager,
    WhisperEngine,
    browserWindowInstances,
  }
})

vi.mock('electron', () => ({
  app: mainMocks.app,
  BrowserWindow: mainMocks.BrowserWindow,
  Tray: mainMocks.Tray,
  Menu: mainMocks.Menu,
  nativeImage: mainMocks.nativeImage,
  globalShortcut: mainMocks.globalShortcut,
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

vi.mock('../../src/main/transcription/ChunkQueue', () => ({
  ChunkQueue: mainMocks.ChunkQueue,
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
        show: false,
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
