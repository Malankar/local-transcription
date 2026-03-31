import { app, BrowserWindow } from 'electron'
import { join } from 'path'

import type { AppStatus, TranscriptSegment } from '../shared/types'
import { AudioCapture } from './audio/AudioCapture'
import { SourceDiscovery } from './audio/SourceDiscovery'
import { registerIpcHandlers } from './ipc/handlers'
import { AppLogger } from './logging/AppLogger'
import { ChunkQueue } from './transcription/ChunkQueue'
import { WhisperEngine } from './transcription/WhisperEngine'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
const transcriptSegments: TranscriptSegment[] = []
const logger = new AppLogger()

const sendStatus = (status: AppStatus): void => {
  logger.info('Status update', status)
  mainWindow?.webContents.send('status', status)
}

const sendError = (message: string): void => {
  logger.error('Application error', { message })
  mainWindow?.webContents.send('capture:error', message)
  sendStatus({ stage: 'error', detail: message })
}

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

audioCapture.on('chunk', (chunk) => {
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
  mainWindow?.webContents.send('transcript:segment', segment)
})

chunkQueue.on('error', (error) => {
  logger.error('Chunk queue emitted error', error)
  sendError(error.message)
})

chunkQueue.on('status', (detail) => {
  logger.info('Chunk queue status', { detail })
  sendStatus({ stage: 'processing', detail })
})

chunkQueue.on('drained', () => {
  logger.info('Chunk queue drained', { isCapturing: audioCapture.isRunning() })
  if (!audioCapture.isRunning()) {
    sendStatus({ stage: 'ready', detail: 'Waiting for the next capture' })
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

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

  registerIpcHandlers({
    audioCapture,
    chunkQueue,
    sourceDiscovery,
    logger,
    getMainWindow: () => mainWindow,
    getTranscriptSegments: () => transcriptSegments,
    resetTranscriptSegments: () => {
      transcriptSegments.length = 0
    },
    sendStatus,
    sendError,
  })

  createWindow()
  sendStatus({ stage: 'idle', detail: `Ready to load audio sources. Logs: ${logFilePath}` })

  app.on('activate', () => {
    logger.info('Application activate event received')
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
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
