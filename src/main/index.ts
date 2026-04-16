import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'node:path'

import type { AppSettings, AppStatus, ModelDownloadProgress, TranscriptSegment } from '../shared/types'
import { AudioCapture } from './audio/AudioCapture'
import { chunkMeetingFile } from './audio/MeetingFileChunker'
import { SourceDiscovery } from './audio/SourceDiscovery'
import { HistoryManager } from './history/HistoryManager'
import { GoogleWorkspaceConnector } from './integrations/googleWorkspace/GoogleWorkspaceConnector'
import { isGoogleWorkspaceImportEnabled, MeetingImportService } from './integrations/googleWorkspace/MeetingImportService'
import { registerIpcHandlers } from './ipc/handlers'
import { AppLogger } from './logging/AppLogger'
import { SettingsManager } from './settings/SettingsManager'
import {
  buildMeetingOutputCompleteness,
  type MeetingInputKpiState,
  toMeetingInputKpiState,
} from './telemetry/meetingKpis'
import { ChunkQueue } from './transcription/ChunkQueue'
import { ModelManager } from './transcription/ModelManager'
import { WhisperEngine } from './transcription/WhisperEngine'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const transcriptSegments: TranscriptSegment[] = []
const logger = new AppLogger()

let captureStartTime: string | null = null
let pendingMeetingInputKpi: MeetingInputKpiState | null = null
let modelUnloadTimer: ReturnType<typeof setTimeout> | null = null
let registeredShortcut: string | null = null
let lastAppliedTrayVisibility: boolean | null = null
let trayCreateTimer: ReturnType<typeof setTimeout> | null = null

function createTrayIcon() {
  const traySvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="5" y="4" width="22" height="24" rx="6" fill="#1f2937"/>
      <rect x="10" y="9" width="12" height="2.5" rx="1.25" fill="#f9fafb"/>
      <rect x="10" y="14.75" width="12" height="2.5" rx="1.25" fill="#f9fafb"/>
      <rect x="10" y="20.5" width="8" height="2.5" rx="1.25" fill="#f9fafb"/>
    </svg>
  `.trim()
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(traySvg)}`
  const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 20, height: 20 })

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  return icon
}

const sendStatus = (status: AppStatus): void => {
  logger.info('Status update', status)
  mainWindow?.webContents.send('status', status)
}

const sendError = (message: string): void => {
  logger.error('Application error', { message })
  mainWindow?.webContents.send('capture:error', message)
  sendStatus({ stage: 'error', detail: message })
}

const modelManager = new ModelManager(app.getPath('userData'))
const historyManager = new HistoryManager(app.getPath('userData'))
const settingsManager = new SettingsManager(app.getPath('userData'))

modelManager.setProgressListener((progress: ModelDownloadProgress) => {
  mainWindow?.webContents.send('models:downloadProgress', progress)
})

const whisperEngine = new WhisperEngine(
  (detail) => {
    sendStatus({
      stage: detail.includes('ready') ? 'model-ready' : 'initializing-model',
      detail,
    })
  },
  (message, context) => {
    logger.info(message, context)
  }
)

const chunkQueue = new ChunkQueue(async (chunk) => {
  sendStatus({ stage: 'processing', detail: 'Transcribing queued audio...' })
  return whisperEngine.transcribe(chunk)
})

const audioCapture = new AudioCapture()
const sourceDiscovery = new SourceDiscovery()
const meetingImportService = new MeetingImportService({
  googleWorkspaceEnabled: isGoogleWorkspaceImportEnabled(),
  connectors: [new GoogleWorkspaceConnector()],
})

audioCapture.on('chunk', (chunk) => {
  cancelModelUnload()
  logger.debug('Audio chunk captured', {
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    sampleCount: chunk.audio.length,
  })
  chunkQueue.enqueue(chunk)
})

audioCapture.on('error', (error) => {
  logger.error('Audio capture emitted error', error)
  sendError(error.message)
})

audioCapture.on('status', (detail) => {
  logger.info('Audio capture status', { detail })
  sendStatus({ stage: audioCapture.isRunning() ? 'capturing' : 'ready', detail })
})

audioCapture.on('stopped', () => {
  logger.info('Audio capture stopped')
  sendStatus({ stage: 'stopped', detail: 'Audio capture has stopped' })
})

chunkQueue.on('segment', (segment) => {
  logger.info('Transcript segment emitted', {
    id: segment.id,
    startMs: segment.startMs,
    endMs: segment.endMs,
    textLength: segment.text.length,
  })
  transcriptSegments.push(segment)
  if (pendingMeetingInputKpi) {
    const timeToOutputMs = Math.max(0, Date.now() - pendingMeetingInputKpi.acceptedAtMs)
    logger.info('KPI time_to_output', {
      metric: 'time_to_output_ms',
      inputSource: pendingMeetingInputKpi.source,
      timeToOutputMs,
      segmentId: segment.id,
      segmentEndMs: segment.endMs,
    })
    pendingMeetingInputKpi = null
  }
  mainWindow?.webContents.send('transcript:segment', segment)
})

chunkQueue.on('error', (error) => {
  // Individual chunk transcription failures are non-fatal — the queue resumes automatically.
  // Don't call sendError here as that would send stage:'error' and stop the capture UI.
  logger.error('Chunk queue emitted error', error)
})

chunkQueue.on('status', (detail) => {
  logger.info('Chunk queue status', { detail })
  sendStatus({ stage: 'processing', detail })
})

chunkQueue.on('drained', () => {
  logger.info('Chunk queue drained', { isCapturing: audioCapture.isRunning() })
  if (!audioCapture.isRunning()) {
    sendStatus({ stage: 'ready', detail: 'Waiting for the next capture' })

    if (transcriptSegments.length > 0 && captureStartTime !== null) {
      const segmentsToSave = [...transcriptSegments]
      const startTime = captureStartTime
      captureStartTime = null
      void (async () => {
        try {
          const settings = await settingsManager.getSettings()
          const meta = await historyManager.saveSession(segmentsToSave, 'meeting', startTime)
          const completeness = buildMeetingOutputCompleteness(segmentsToSave, {
            // Session assistant quick prompts are always visible for saved meetings.
            summaryVisible: true,
            actionsVisible: true,
          })
          logger.info('KPI meeting_output_completeness', {
            metric: 'meeting_output_completeness',
            sessionId: meta.id,
            ...completeness,
          })
          logger.info('Session saved to history', { id: meta.id, label: meta.label })
          mainWindow?.webContents.send('history:saved', meta)
          await historyManager.pruneHistory({
            historyLimit: settings.historyLimit,
            autoDeleteRecordings: settings.autoDeleteRecordings,
            keepStarredUntilDeleted: settings.keepStarredUntilDeleted,
          })
          scheduleModelUnload(settings.unloadModelAfterMinutes)
        } catch (error) {
          logger.error('Failed to save session to history', error)
        }
      })()
    } else {
      void settingsManager.getSettings().then((s) => scheduleModelUnload(s.unloadModelAfterMinutes))
    }
  }
})

function scheduleModelUnload(minutes: number): void {
  if (modelUnloadTimer) {
    clearTimeout(modelUnloadTimer)
    modelUnloadTimer = null
  }
  if (minutes <= 0) return
  modelUnloadTimer = setTimeout(
    () => {
      logger.info('Unloading model after idle timeout', { minutes })
      whisperEngine.dispose()
      modelUnloadTimer = null
    },
    minutes * 60 * 1000,
  )
}

function cancelModelUnload(): void {
  if (modelUnloadTimer) {
    clearTimeout(modelUnloadTimer)
    modelUnloadTimer = null
  }
}

function applyVoiceShortcut(shortcut: string): void {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
    registeredShortcut = null
  }
  if (!shortcut) return
  const ok = globalShortcut.register(shortcut, () => {
    if (audioCapture.isRunning()) {
      audioCapture.stop()
      sendStatus({ stage: 'stopped', detail: 'Capture stopped via shortcut' })
    } else {
      // Trigger start via renderer.
      mainWindow?.webContents.send('shortcut:voice-to-text')
    }
  })
  if (ok) {
    registeredShortcut = shortcut
    logger.info('Global voice shortcut registered', { shortcut })
  } else {
    logger.error('Failed to register global shortcut', { shortcut })
  }
}

function applyTray(show: boolean): void {
  if (show && !tray) {
    const icon = createTrayIcon()
    tray = new Tray(icon)
    tray.setToolTip('LocalTranscribe')
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      { label: 'Quit', click: () => app.quit() },
    ])
    tray.setContextMenu(menu)
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
    logger.info('Tray icon created', { platform: process.platform, iconEmpty: icon.isEmpty() })
  } else if (!show && tray) {
    tray.destroy()
    tray = null
    logger.info('Tray icon removed')
  }
}

function clearTrayCreateTimer(): void {
  if (trayCreateTimer) {
    clearTimeout(trayCreateTimer)
    trayCreateTimer = null
  }
}

function safeApplyTray(show: boolean): void {
  try {
    applyTray(show)
  } catch (error) {
    logger.error('Failed to apply tray visibility', { show, error })
  }
}

function syncTrayVisibility(show: boolean): void {
  clearTrayCreateTimer()

  // On Linux, recreating a Tray after destroy causes D-Bus "already exported" errors
  // from Chromium's internal D-Bus layer (Electron bug with KDE StatusNotifierItem).
  // Apply the tray setting only once at startup; mid-session changes require a restart.
  if (process.platform === 'linux' && lastAppliedTrayVisibility !== null) {
    return
  }

  if (lastAppliedTrayVisibility === show) {
    return
  }

  if (!show) {
    safeApplyTray(false)
    lastAppliedTrayVisibility = false
    return
  }

  if (process.platform === 'linux') {
    trayCreateTimer = setTimeout(() => {
      trayCreateTimer = null
      safeApplyTray(true)
      lastAppliedTrayVisibility = true
    }, 200)
    logger.info('Scheduling tray icon creation for Linux', { delayMs: 200 })
    return
  }

  safeApplyTray(true)
  lastAppliedTrayVisibility = true
}

function applySettings(settings: AppSettings): void {
  app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup })
  applyVoiceShortcut(settings.voiceToTextShortcut)
  syncTrayVisibility(settings.showTrayIcon)
  // Reset unload timer using current setting (only when not capturing)
  if (!audioCapture.isRunning()) {
    scheduleModelUnload(settings.unloadModelAfterMinutes)
  }
}

function createWindow(startHidden: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#f4f1e8',
    autoHideMenuBar: true,
    show: !startHidden,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info('Renderer console message', {
      level,
      message,
      line,
      sourceId,
    })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process exited unexpectedly', details)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('Renderer failed to load content', {
      errorCode,
      errorDescription,
      validatedURL,
    })
  })

  mainWindow.on('closed', () => {
    logger.info('Main window closed')
    mainWindow = null
  })
}

app.whenReady().then(() => {
  const logFilePath = isDev
    ? logger.configureFile(join(process.cwd(), 'logs', 'localtranscribe.dev.log'))
    : logger.configure(app.getPath('logs'))
  logger.info('Application starting', {
    isDev,
    platform: process.platform,
    versions: process.versions,
    logFilePath,
  })

  void settingsManager.getSettings().then((settings) => {
    applySettings(settings)

    registerIpcHandlers({
      audioCapture,
      chunkQueue,
      sourceDiscovery,
      whisperEngine,
      modelManager,
      historyManager,
      settingsManager,
      logger,
      getMainWindow: () => mainWindow,
      getTranscriptSegments: () => transcriptSegments,
      resetTranscriptSegments: () => {
        transcriptSegments.length = 0
      },
      onInputAccepted: (event) => {
        captureStartTime = event.acceptedAtIso
        pendingMeetingInputKpi = toMeetingInputKpiState(event)
      },
      onSettingsChanged: (updated) => {
        applySettings(updated)
      },
      sendStatus,
      sendError,
      chunkMeetingFile,
      meetingImportService,
    })

    createWindow(settings.startHidden)
    sendStatus({ stage: 'idle', detail: `Ready to load audio sources. Logs: ${logFilePath}` })

    app.on('activate', () => {
      logger.info('Application activate event received')
      if (BrowserWindow.getAllWindows().length === 0) {
        void settingsManager.getSettings().then((s) => createWindow(s.startHidden))
      }
    })
  })
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason)
})

app.on('window-all-closed', () => {
  logger.info('All windows closed')
  audioCapture.stop()
  whisperEngine.dispose()
  if (process.platform !== 'darwin') {
    logger.info('Quitting application because platform is not macOS')
    app.quit()
  }
})

app.on('will-quit', () => {
  clearTrayCreateTimer()
  globalShortcut.unregisterAll()
})
