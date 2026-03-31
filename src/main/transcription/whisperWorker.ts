import type { AudioChunk, TranscriptSegment } from '../../shared/types'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

type PipelineChunk = {
  timestamp?: [number | null, number | null]
  text?: string
}

type PipelineResult = {
  text?: string
  chunks?: PipelineChunk[]
}

type HFPipeline = (
  audio: Float32Array,
  options: { sampling_rate: number; return_timestamps: boolean }
) => Promise<PipelineResult>

const modelId = 'Xenova/whisper-small.en'

let pipe: HFPipeline | null = null
let initializing: Promise<void> | null = null

function respond(message: WorkerResponse): void {
  process.send?.(message)
}

function log(message: string, context?: unknown): void {
  respond({ type: 'log', message, context })
}

function sendStatus(detail: string): void {
  respond({ type: 'status', detail })
}

async function initialize(): Promise<void> {
  if (pipe) {
    return
  }

  if (initializing) {
    return initializing
  }

  initializing = (async () => {
    sendStatus('Loading Whisper model...')
    log('Starting WhisperEngine initialization', { modelId })

    try {
      const { env, pipeline } = await import('@huggingface/transformers')
      log('transformers.js imported successfully')

      env.allowLocalModels = true
      log('Configured transformers environment', {
        allowLocalModels: env.allowLocalModels,
        allowRemoteModels: env.allowRemoteModels,
        localModelPath: env.localModelPath,
      })

      pipe = (await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'cpu',
      })) as unknown as HFPipeline

      sendStatus('Whisper model ready')
      log('Whisper pipeline initialized', { modelId })
    } catch (error) {
      log('WhisperEngine initialization failed', normalizeError(error))
      throw error
    }
  })()

  try {
    await initializing
  } finally {
    initializing = null
  }
}

async function transcribe(chunk: AudioChunk): Promise<TranscriptSegment[]> {
  await initialize()

  if (!pipe) {
    throw new Error('WhisperEngine not initialized')
  }

  log('Transcribing audio chunk', {
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    sampleCount: chunk.audio.length,
  })

  const result = await pipe(chunk.audio, {
    sampling_rate: 16_000,
    return_timestamps: true,
  })

  const segments = result.chunks
    ?.map((item, index) => toTranscriptSegment(item, index, chunk))
    .filter((segment): segment is TranscriptSegment => segment !== null)

  if (segments && segments.length > 0) {
    log('Whisper returned timestamped segments', {
      segmentCount: segments.length,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
    })
    return segments
  }

  const text = result.text?.trim()
  if (!text) {
    return []
  }

  return [
    {
      id: `${chunk.startMs}-0`,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      text,
      timestamp: new Date().toISOString(),
    },
  ]
}

function toTranscriptSegment(
  item: PipelineChunk,
  index: number,
  chunk: AudioChunk
): TranscriptSegment | null {
  const text = item.text?.trim()
  if (!text) {
    return null
  }

  const rawStart = item.timestamp?.[0] ?? 0
  const rawEnd = item.timestamp?.[1] ?? (chunk.endMs - chunk.startMs) / 1_000
  const startMs = chunk.startMs + Math.round(Math.max(0, rawStart) * 1_000)
  const endMs = chunk.startMs + Math.round(Math.max(rawStart, rawEnd) * 1_000)

  return {
    id: `${chunk.startMs}-${index}`,
    startMs,
    endMs,
    text,
    timestamp: new Date().toISOString(),
  }
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

process.on('message', async (message: WorkerRequest) => {
  try {
    switch (message.type) {
      case 'initialize':
        await initialize()
        respond({ type: 'ready', requestId: message.requestId })
        break
      case 'transcribe': {
        const segments = await transcribe(message.chunk)
        respond({ type: 'result', requestId: message.requestId, segments })
        break
      }
      case 'shutdown':
        respond({ type: 'ready', requestId: message.requestId })
        process.exit(0)
        break
      default:
        throw new Error(`Unsupported worker request: ${JSON.stringify(message)}`)
    }
  } catch (error) {
    const normalized = normalizeError(error)
    respond({
      type: 'error',
      requestId: message.requestId,
      message: normalized.message,
      stack: normalized.stack,
    })
  }
})

process.on('uncaughtException', (error) => {
  log('Whisper worker uncaught exception', normalizeError(error))
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log('Whisper worker unhandled rejection', normalizeError(reason))
  process.exit(1)
})
