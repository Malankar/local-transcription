import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  coerceAssistantChatFlags,
  type AppStatus,
  type AssistantChatRequest,
  type CaptureStartOptions,
  type ExportResult,
  type HistorySessionMeta,
  type TranscriptSegment,
} from '../../shared/types'
import { OLLAMA_DEFAULT_BASE_URL } from '../../shared/assistantModels'
import {
  assistantReplyChat,
  enrichHistorySessionAfterSave,
  regenerateHistorySessionSummary,
  regenerateHistorySessionTitle,
  scheduleResumePendingHistoryEnrichment,
} from '../assistant/enrichHistorySession'
import { ollamaListTags, ollamaPullModel } from '../assistant/ollamaClient'
import { AudioCapture } from '../audio/AudioCapture'
import { SourceDiscovery } from '../audio/SourceDiscovery'
import { ChunkQueue } from '../transcription/ChunkQueue'
import { WhisperEngine } from '../transcription/WhisperEngine'
import { ModelManager } from '../transcription/ModelManager'
import { TranscriptExporter } from '../export/TranscriptExporter'
import { HistoryManager } from '../history/HistoryManager'
import { SettingsManager } from '../settings/SettingsManager'
import { AppLogger } from '../logging/AppLogger'

/** In-flight Ollama `api/pull` stream; cancel via `assistant:ollamaPullCancel`. */
let ollamaPullAbort: AbortController | null = null
let ollamaActivePull: { model: string; status: string; percent: number | null } | null = null

interface RegisterHandlersOptions {
  audioCapture: AudioCapture
  chunkQueue: ChunkQueue
  sourceDiscovery: SourceDiscovery
  whisperEngine: WhisperEngine
  modelManager: ModelManager
  historyManager: HistoryManager
  settingsManager: SettingsManager
  logger: AppLogger
  getMainWindow: () => BrowserWindow | null
  getTranscriptSegments: () => TranscriptSegment[]
  resetTranscriptSegments: () => void
  onCaptureStarted: (profile: 'meeting' | 'live', startTime: string) => void
  onSettingsChanged: (settings: import('../../shared/types').AppSettings) => void
  sendStatus: (status: AppStatus) => void
  sendError: (message: string) => void
}

export function registerIpcHandlers(options: RegisterHandlersOptions): void {
  const {
    audioCapture,
    chunkQueue,
    sourceDiscovery,
    whisperEngine,
    modelManager,
    historyManager,
    settingsManager,
    logger,
    getMainWindow,
    getTranscriptSegments,
    resetTranscriptSegments,
    onCaptureStarted,
    onSettingsChanged,
    sendStatus,
    sendError,
  } = options

  ipcMain.handle('sources:get', async () => {
    sendStatus({ stage: 'discovering', detail: 'Looking up audio sources...' })

    try {
      const sources = sourceDiscovery.getSources()
      logger.info('Resolved audio sources', {
        count: sources.length,
        sourceIds: sources.map((source) => source.id),
      })
      sendStatus({ stage: 'ready', detail: `Found ${sources.length} audio sources` })
      return sources
    } catch (error) {
      const message = toMessage(error)
      logger.error('Failed to resolve audio sources', error)
      sendError(message)
      throw error
    }
  })

  ipcMain.handle('capture:start', async (_event, captureOptions: CaptureStartOptions) => {
    try {
      const selectedModelId = await modelManager.getSelectedModel()
      if (!selectedModelId) {
        throw new Error('No model selected. Download or configure a transcription model before capturing.')
      }

      const selectedModel = modelManager.getModel(selectedModelId)
      if (!selectedModel) {
        throw new Error(`Selected model "${selectedModelId}" is not available.`)
      }

      logger.info('Received capture:start request', {
        ...captureOptions,
        modelId: selectedModel.id,
        engine: selectedModel.engine,
      })
      whisperEngine.setModel(selectedModel)
      resetTranscriptSegments()
      chunkQueue.setMode(captureOptions.profile === 'live' ? 'realtime' : 'default')
      chunkQueue.clear()
      onCaptureStarted(captureOptions.profile ?? 'meeting', new Date().toISOString())
      sendStatus({ stage: 'initializing-model', detail: 'Preparing transcription engine...' })
      audioCapture.start(captureOptions)
      sendStatus({ stage: 'capturing', detail: 'Capturing audio until a natural pause is detected...' })
    } catch (error) {
      const message = toMessage(error)
      logger.error('Failed to start capture', error)
      sendError(message)
      throw error
    }
  })

  ipcMain.handle('capture:stop', async () => {
    logger.info('Received capture:stop request')
    audioCapture.stop()
    chunkQueue.notifyCaptureEnded()
    sendStatus({ stage: 'stopped', detail: 'Capture stopped' })
  })

  ipcMain.handle('export:txt', async () => {
    return exportTranscript(getMainWindow(), getTranscriptSegments(), 'txt', logger)
  })

  ipcMain.handle('export:srt', async () => {
    return exportTranscript(getMainWindow(), getTranscriptSegments(), 'srt', logger)
  })

  ipcMain.handle('export:vtt', async () => {
    return exportTranscript(getMainWindow(), getTranscriptSegments(), 'vtt', logger)
  })

  ipcMain.handle('models:list', () => {
    return modelManager.getModels()
  })

  ipcMain.handle('models:getSelected', async () => {
    return modelManager.getSelectedModel()
  })

  ipcMain.handle('models:select', async (_event, modelId: string) => {
    await modelManager.selectModel(modelId)
    logger.info('Model selected', { modelId })
  })

  ipcMain.handle('models:download', async (_event, modelId: string) => {
    logger.info('Starting model download', { modelId })
    try {
      await modelManager.downloadModel(modelId)
      logger.info('Model download complete', { modelId })
    } catch (error) {
      logger.error('Model download failed', { modelId, error: toMessage(error) })
      throw error
    }
  })

  ipcMain.handle('models:cancelDownload', async (_event, modelId: string) => {
    modelManager.cancelDownload(modelId)
    logger.info('Model download canceled', { modelId })
  })

  ipcMain.handle('models:remove', async (_event, modelId: string) => {
    if (audioCapture.isRunning()) {
      throw new Error('Cannot remove a model while audio capture is running.')
    }
    if (whisperEngine.getConfiguredModelId() === modelId) {
      whisperEngine.dispose()
    }
    await modelManager.removeDownloadedModel(modelId)
    logger.info('Model removed from disk', { modelId })
  })

  ipcMain.handle('history:list', async () => {
    const list = await historyManager.listSessions()
    scheduleResumePendingHistoryEnrichment({
      historyManager,
      mainWindow: getMainWindow(),
      logger,
    })
    return list
  })

  ipcMain.handle('history:get', async (_event, id: string) => {
    return historyManager.getSession(id)
  })

  ipcMain.handle('history:delete', async (_event, id: string) => {
    await historyManager.deleteSession(id)
    logger.info('History session deleted', { id })
  })

  ipcMain.handle('history:export:txt', async (_event, id: string) => {
    const session = await historyManager.getSession(id)
    if (!session) return { canceled: true }
    return exportTranscript(getMainWindow(), session.segments, 'txt', logger)
  })

  ipcMain.handle('history:export:srt', async (_event, id: string) => {
    const session = await historyManager.getSession(id)
    if (!session) return { canceled: true }
    return exportTranscript(getMainWindow(), session.segments, 'srt', logger)
  })

  ipcMain.handle('history:export:vtt', async (_event, id: string) => {
    const session = await historyManager.getSession(id)
    if (!session) return { canceled: true }
    return exportTranscript(getMainWindow(), session.segments, 'vtt', logger)
  })

  ipcMain.handle('history:star', async (_event, id: string, starred: boolean) => {
    await historyManager.starSession(id, starred)
    logger.info('History session starred', { id, starred })
  })

  ipcMain.handle('history:regenerateTitle', async (_event, sessionId: string) => {
    const id = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!id) throw new Error('Session id required')
    await regenerateHistorySessionTitle({
      sessionId: id,
      historyManager,
      mainWindow: getMainWindow(),
      logger,
    })
  })

  ipcMain.handle('history:regenerateSummary', async (_event, sessionId: string) => {
    const id = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!id) throw new Error('Session id required')
    await regenerateHistorySessionSummary({
      sessionId: id,
      historyManager,
      mainWindow: getMainWindow(),
      logger,
    })
  })

  ipcMain.handle('assistant:chat', async (_event, req: AssistantChatRequest) => {
    const flags = coerceAssistantChatFlags(req)
    const text = await assistantReplyChat({
      sessionTitle: req.sessionTitle,
      transcript: req.transcript,
      userMessages: req.messages,
      thinkingMode: flags.thinkingMode,
      webSearchEnabled: flags.webSearchEnabled,
      logger,
    })
    return { text }
  })

  ipcMain.handle('assistant:ollamaStatus', async () => {
    return ollamaListTags(OLLAMA_DEFAULT_BASE_URL)
  })

  ipcMain.handle('assistant:ollamaPull', async (_event, model: string) => {
    const name = typeof model === 'string' && model.trim() ? model.trim() : ''
    if (!name) throw new Error('Model name required')
    if (ollamaPullAbort) throw new Error('A model pull is already in progress')
    const ac = new AbortController()
    ollamaPullAbort = ac
    ollamaActivePull = { model: name, status: 'Starting…', percent: null }
    const win = getMainWindow()
    try {
      await ollamaPullModel(OLLAMA_DEFAULT_BASE_URL, name, logger, {
        signal: ac.signal,
        onProgress: (p) => {
          ollamaActivePull = {
            model: name,
            status: p.status,
            percent: p.percent,
          }
          win?.webContents.send('assistant:ollamaPullProgress', {
            model: name,
            status: p.status,
            percent: p.percent,
          })
        },
      })
    } catch (e) {
      if (ac.signal.aborted) {
        logger.info('Ollama pull aborted by user', { model: name })
        return
      }
      throw e
    } finally {
      ollamaPullAbort = null
      ollamaActivePull = null
    }
  })

  ipcMain.handle('assistant:ollamaPullCancel', async () => {
    ollamaPullAbort?.abort()
  })

  ipcMain.handle('assistant:ollamaPullState', async () => {
    return ollamaActivePull
  })

  ipcMain.handle('settings:get', async () => {
    return settingsManager.getSettings()
  })

  ipcMain.handle('settings:set', async (_event, partial: Partial<import('../../shared/types').AppSettings>) => {
    const updated = await settingsManager.updateSettings(partial)
    logger.info('Settings updated', { keys: Object.keys(partial) })
    onSettingsChanged(updated)

    // Enforce history pruning when history settings change
    if ('historyLimit' in partial || 'autoDeleteRecordings' in partial || 'keepStarredUntilDeleted' in partial) {
      await historyManager.pruneHistory({
        historyLimit: updated.historyLimit,
        autoDeleteRecordings: updated.autoDeleteRecordings,
        keepStarredUntilDeleted: updated.keepStarredUntilDeleted,
      })
    }

    return updated
  })

  if (process.env.E2E_QUIT_ON_LAST_WINDOW === '1') {
    ipcMain.handle(
      'e2e:seedHistoryMeeting',
      async (_event, body: { text: string }): Promise<HistorySessionMeta> => {
        const text = body?.text?.trim() || 'E2E seeded meeting transcript.'
        const now = new Date().toISOString()
        const segments: TranscriptSegment[] = [
          {
            id: `e2e-${Date.now()}`,
            startMs: 0,
            endMs: 1500,
            text,
            timestamp: now,
          },
        ]
        const meta = await historyManager.saveSession(segments, 'meeting', now)
        getMainWindow()?.webContents.send('history:saved', meta)
        void enrichHistorySessionAfterSave({
          sessionId: meta.id,
          historyManager,
          mainWindow: getMainWindow(),
          logger,
        })
        logger.info('E2E seeded history session', { id: meta.id, label: meta.label })
        return meta
      },
    )
  }
}

async function exportTranscript(
  mainWindow: BrowserWindow | null,
  segments: TranscriptSegment[],
  format: 'txt' | 'srt' | 'vtt',
  logger: AppLogger
): Promise<ExportResult> {
  let content = ''
  if (format === 'txt') content = TranscriptExporter.toTxt(segments)
  else if (format === 'srt') content = TranscriptExporter.toSrt(segments)
  else if (format === 'vtt') content = TranscriptExporter.toVtt(segments)

  if (process.env.E2E_QUIT_ON_LAST_WINDOW === '1') {
    const filePath = join(tmpdir(), `lt-e2e-export-${Date.now()}.${format}`)
    await fs.writeFile(filePath, content, 'utf8')
    logger.info('Transcript exported (E2E auto path)', {
      format,
      path: filePath,
      segmentCount: segments.length,
    })
    return { canceled: false, path: filePath }
  }

  const defaultPath = `transcript.${format}`
  const dialogOptions = {
    defaultPath,
    filters: [
      {
        name: format.toUpperCase(),
        extensions: [format],
      },
    ],
  }
  const response = mainWindow
    ? await dialog.showSaveDialog(mainWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)

  if (response.canceled || !response.filePath) {
    logger.info('Export canceled', { format })
    return { canceled: true }
  }

  await fs.writeFile(response.filePath, content, 'utf8')
  logger.info('Transcript exported', {
    format,
    path: response.filePath,
    segmentCount: segments.length,
  })

  return {
    canceled: false,
    path: response.filePath,
  }
}



function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
