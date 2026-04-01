import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'

import type {
  AppStatus,
  CaptureStartOptions,
  ExportResult,
  TranscriptSegment,
} from '../../shared/types'
import { AudioCapture } from '../audio/AudioCapture'
import { SourceDiscovery } from '../audio/SourceDiscovery'
import { ChunkQueue } from '../transcription/ChunkQueue'
import { WhisperEngine } from '../transcription/WhisperEngine'
import { ModelManager } from '../transcription/ModelManager'
import { AppLogger } from '../logging/AppLogger'

interface RegisterHandlersOptions {
  audioCapture: AudioCapture
  chunkQueue: ChunkQueue
  sourceDiscovery: SourceDiscovery
  whisperEngine: WhisperEngine
  modelManager: ModelManager
  logger: AppLogger
  getMainWindow: () => BrowserWindow | null
  getTranscriptSegments: () => TranscriptSegment[]
  resetTranscriptSegments: () => void
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
    logger,
    getMainWindow,
    getTranscriptSegments,
    resetTranscriptSegments,
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
      chunkQueue.clear()
      sendStatus({ stage: 'initializing-model', detail: 'Preparing transcription engine...' })
      audioCapture.start(captureOptions)
      sendStatus({ stage: 'capturing', detail: 'Listening for audio...' })
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

  ipcMain.handle('export:txt', async () => {
    return exportTranscript(getMainWindow(), getTranscriptSegments(), 'txt', logger)
  })

  ipcMain.handle('export:srt', async () => {
    return exportTranscript(getMainWindow(), getTranscriptSegments(), 'srt', logger)
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
}

async function exportTranscript(
  mainWindow: BrowserWindow | null,
  segments: TranscriptSegment[],
  format: 'txt' | 'srt',
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

  const content = format === 'txt' ? toTxt(segments) : toSrt(segments)
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

function toTxt(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join('\n').trim()
}

function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, index) => {
      return `${index + 1}\n${formatSrtTime(segment.startMs)} --> ${formatSrtTime(segment.endMs)}\n${segment.text}`
    })
    .join('\n\n')
    .trim()
}

function formatSrtTime(totalMs: number): string {
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1_000)
  const milliseconds = totalMs % 1_000

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
    .concat(`,${String(milliseconds).padStart(3, '0')}`)
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
