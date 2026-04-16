import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'

import type {
  AppStatus,
  CaptureStartOptions,
  ExportResult,
  MeetingInputSource,
  MeetingImportConnectorId,
  MeetingImportRequest,
  TranscriptSegment,
} from '../../shared/types'
import { AudioCapture } from '../audio/AudioCapture'
import { SourceDiscovery } from '../audio/SourceDiscovery'
import { MeetingImportService } from '../integrations/googleWorkspace/MeetingImportService'
import { ChunkQueue } from '../transcription/ChunkQueue'
import { WhisperEngine } from '../transcription/WhisperEngine'
import { ModelManager } from '../transcription/ModelManager'
import { TranscriptExporter } from '../export/TranscriptExporter'
import { HistoryManager } from '../history/HistoryManager'
import { SettingsManager } from '../settings/SettingsManager'
import { AppLogger } from '../logging/AppLogger'

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
  onInputAccepted: (event: { source: MeetingInputSource; acceptedAtIso: string }) => void
  onSettingsChanged: (settings: import('../../shared/types').AppSettings) => void
  sendStatus: (status: AppStatus) => void
  sendError: (message: string) => void
  chunkMeetingFile: (filePath: string) => AsyncIterable<import('../../shared/types').AudioChunk>
  meetingImportService: MeetingImportService
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
    onInputAccepted,
    onSettingsChanged,
    sendStatus,
    sendError,
    chunkMeetingFile,
    meetingImportService,
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
      chunkQueue.setMode('default')
      chunkQueue.clear()
      onInputAccepted({ source: 'record', acceptedAtIso: new Date().toISOString() })
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
    sendStatus({ stage: 'stopped', detail: 'Capture stopped' })
  })

  ipcMain.handle('meeting:transcribeFile', async (_event, requestedPath?: string) => {
    try {
      const filePath = requestedPath ?? (await selectMeetingFile(getMainWindow()))
      if (!filePath) {
        sendStatus({ stage: 'ready', detail: 'Meeting file import canceled.' })
        return
      }
      await queueMeetingFileForTranscription({
        filePath,
        inputSource: 'upload',
        audioCapture,
        chunkQueue,
        modelManager,
        whisperEngine,
        resetTranscriptSegments,
        onInputAccepted,
        sendStatus,
        chunkMeetingFile,
        logger,
      })
    } catch (error) {
      const message = toMessage(error)
      logger.error('Failed to transcribe uploaded meeting file', error)
      sendError(message)
      throw error
    }
  })

  ipcMain.handle('meetingImport:listConnectors', async () => {
    return meetingImportService.listConnectors()
  })

  ipcMain.handle('meetingImport:discover', async (_event, connectorId: MeetingImportConnectorId) => {
    return meetingImportService.discoverCandidates(connectorId)
  })

  ipcMain.handle('meetingImport:import', async (_event, request: MeetingImportRequest) => {
    try {
      const resolvedPath = await meetingImportService.resolveImportFilePath(request)
      await queueMeetingFileForTranscription({
        filePath: resolvedPath,
        inputSource: 'integration',
        audioCapture,
        chunkQueue,
        modelManager,
        whisperEngine,
        resetTranscriptSegments,
        onInputAccepted,
        sendStatus,
        chunkMeetingFile,
        logger,
      })
    } catch (error) {
      const message = toMessage(error)
      logger.error('Failed to import meeting from integration', error)
      sendError(message)
      throw error
    }
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
    return historyManager.listSessions()
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
}

async function selectMeetingFile(mainWindow: BrowserWindow | null): Promise<string | null> {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Audio/Video files', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov', 'mkv', 'webm'] },
        ],
      })
    : await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Audio/Video files', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov', 'mkv', 'webm'] },
        ],
      })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

interface QueueMeetingFileForTranscriptionOptions {
  filePath: string
  inputSource: MeetingInputSource
  audioCapture: AudioCapture
  chunkQueue: ChunkQueue
  modelManager: ModelManager
  whisperEngine: WhisperEngine
  resetTranscriptSegments: () => void
  onInputAccepted: (event: { source: MeetingInputSource; acceptedAtIso: string }) => void
  sendStatus: (status: AppStatus) => void
  chunkMeetingFile: (filePath: string) => AsyncIterable<import('../../shared/types').AudioChunk>
  logger: AppLogger
}

async function queueMeetingFileForTranscription(options: QueueMeetingFileForTranscriptionOptions): Promise<void> {
  const {
    filePath,
    inputSource,
    audioCapture,
    chunkQueue,
    modelManager,
    whisperEngine,
    resetTranscriptSegments,
    onInputAccepted,
    sendStatus,
    chunkMeetingFile,
    logger,
  } = options

  if (audioCapture.isRunning()) {
    throw new Error('Stop the current capture before importing a meeting file.')
  }
  if (!chunkQueue.isIdle()) {
    throw new Error('Please wait for current transcription processing to finish before importing a file.')
  }

  const selectedModelId = await modelManager.getSelectedModel()
  if (!selectedModelId) {
    throw new Error('No model selected. Download or configure a transcription model before importing files.')
  }

  const selectedModel = modelManager.getModel(selectedModelId)
  if (!selectedModel) {
    throw new Error(`Selected model "${selectedModelId}" is not available.`)
  }

  sendStatus({ stage: 'initializing-model', detail: 'Preparing transcription engine...' })
  whisperEngine.setModel(selectedModel)
  resetTranscriptSegments()
  chunkQueue.setMode('default')
  chunkQueue.clear()
  onInputAccepted({ source: inputSource, acceptedAtIso: new Date().toISOString() })

  let queuedChunks = 0

  logger.info('Queueing uploaded meeting file for transcription', {
    filePath,
    modelId: selectedModel.id,
  })
  sendStatus({ stage: 'processing', detail: 'Transcribing uploaded meeting audio...' })
  for await (const chunk of chunkMeetingFile(filePath)) {
    chunkQueue.enqueue(chunk)
    queuedChunks += 1
  }

  if (queuedChunks === 0) {
    throw new Error('The selected file does not contain decodable audio.')
  }

  logger.info('Uploaded meeting file queued', { filePath, chunkCount: queuedChunks, modelId: selectedModel.id })
}

async function exportTranscript(
  mainWindow: BrowserWindow | null,
  segments: TranscriptSegment[],
  format: 'txt' | 'srt' | 'vtt',
  logger: AppLogger
): Promise<ExportResult> {
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

  let content = ''
  if (format === 'txt') content = TranscriptExporter.toTxt(segments)
  else if (format === 'srt') content = TranscriptExporter.toSrt(segments)
  else if (format === 'vtt') content = TranscriptExporter.toVtt(segments)

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
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'number' || typeof error === 'boolean') {
    return JSON.stringify(error)
  }
  if (error && typeof error === 'object') {
    return JSON.stringify(error)
  }
  if (typeof error === 'undefined') {
    return 'Unknown error'
  }
  return 'Unknown error'
}
