import { join } from 'node:path'

import type {
  AudioChunk,
  SherpaModelKind,
  TranscriptSegment,
  TranscriptionEngine,
} from '../../shared/types'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

type ModelConfig = {
  id: string
  engine: TranscriptionEngine
  runtimeModelName: string
  useGpuAcceleration: boolean
  sherpaKind?: SherpaModelKind
}

type SherpaSegment = {
  start: number
  end?: number | null
  text: string
}

// Minimal shape of the sherpa-onnx-node API we use (the package ships no TS types).
type SherpaOfflineRecognizer = {
  createStream: () => { acceptWaveform: (wave: { samples: Float32Array; sampleRate: number }) => void }
  decodeAsync: (stream: unknown) => Promise<{ text: string; tokens: string[]; timestamps: number[] }>
}

let currentModel: ModelConfig | null = null
let initialized = false
let sherpaRecognizer: Promise<SherpaOfflineRecognizer> | null = null

function respond(message: WorkerResponse): void {
  process.send?.(message)
}

function log(message: string, context?: unknown): void {
  respond({ type: 'log', message, context })
}

function sendStatus(detail: string): void {
  respond({ type: 'status', detail })
}

async function initialize(model: ModelConfig): Promise<void> {
  if (initialized) return
  currentModel = model

  sendStatus('Loading transcription model...')
  await loadSherpaRecognizer(model)
  sendStatus('Transcription model ready')

  log('Transcription worker initialized', {
    modelId: model.id,
    engine: model.engine,
    runtimeModelName: model.runtimeModelName,
    useGpuAcceleration: model.useGpuAcceleration,
  })
  initialized = true
}

async function transcribe(chunk: AudioChunk): Promise<TranscriptSegment[]> {
  if (!currentModel) {
    throw new Error('Worker not initialized with a model. Call initialize first.')
  }

  return transcribeWithSherpa(currentModel, chunk)
}

async function transcribeWithSherpa(
  model: ModelConfig,
  chunk: AudioChunk
): Promise<TranscriptSegment[]> {
  const recognizer = await loadSherpaRecognizer(model)

  log('Transcribing audio chunk with sherpa-onnx', {
    modelId: model.id,
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    sampleCount: chunk.audio.length,
  })

  const stream = recognizer.createStream()
  stream.acceptWaveform({ samples: chunk.audio, sampleRate: 16_000 })
  const result = await recognizer.decodeAsync(stream)

  // Whisper emits bracket tokens like [BLANK_AUDIO] for silence; harmless for other kinds.
  const text = stripWhisperTokens(result.text)
  const segments = normalizeSherpaSegments(
    text ? [{ start: result.timestamps?.[0] ?? 0, end: null, text }] : [],
    chunk
  )
  log('sherpa-onnx returned segments', { segmentCount: segments.length })
  return segments
}

/** Maps a model kind to sherpa-onnx's modelConfig; file names match the catalog's HF files. */
export function buildSherpaModelConfig(kind: SherpaModelKind, dir: string): Record<string, unknown> {
  const file = (name: string): string => join(dir, name)
  const common = { tokens: file('tokens.txt'), numThreads: 2, provider: 'cpu' }

  switch (kind) {
    case 'whisper':
      // Empty language = auto-detect on multilingual models; English-only models ignore it.
      return {
        ...common,
        whisper: {
          encoder: file('encoder.int8.onnx'),
          decoder: file('decoder.int8.onnx'),
          language: '',
          task: 'transcribe',
        },
      }
    case 'nemo-transducer':
      return {
        ...common,
        modelType: 'nemo_transducer',
        transducer: {
          encoder: file('encoder.int8.onnx'),
          decoder: file('decoder.int8.onnx'),
          joiner: file('joiner.int8.onnx'),
        },
      }
    case 'moonshine':
      return {
        ...common,
        moonshine: { encoder: file('encoder_model.ort'), mergedDecoder: file('decoder_model_merged.ort') },
      }
    case 'sense-voice':
      return { ...common, senseVoice: { model: file('model.int8.onnx'), useInverseTextNormalization: 1 } }
    case 'canary':
      // ponytail: fixed to English; expose srcLang once the app has a language setting.
      return {
        ...common,
        canary: {
          encoder: file('encoder.int8.onnx'),
          decoder: file('decoder.int8.onnx'),
          srcLang: 'en',
          tgtLang: 'en',
          usePnc: 1,
        },
      }
  }
}

/** runtimeModelName is the absolute directory holding the downloaded sherpa-onnx model files. */
function loadSherpaRecognizer(model: ModelConfig): Promise<SherpaOfflineRecognizer> {
  if (!sherpaRecognizer) {
    if (!model.sherpaKind) {
      return Promise.reject(new Error(`Model ${model.id} is missing its sherpa-onnx model kind`))
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sherpa = require('sherpa-onnx-node') as {
      OfflineRecognizer: { createAsync: (config: unknown) => Promise<SherpaOfflineRecognizer> }
    }

    sherpaRecognizer = sherpa.OfflineRecognizer.createAsync({
      featConfig: { sampleRate: 16_000, featureDim: 80 },
      modelConfig: buildSherpaModelConfig(model.sherpaKind, model.runtimeModelName),
    }).catch((error: unknown) => {
      sherpaRecognizer = null
      throw error
    })
  }

  return sherpaRecognizer
}

export function normalizeSherpaSegments(
  segments: SherpaSegment[],
  chunk: AudioChunk
): TranscriptSegment[] {
  const chunkDurationMs = Math.max(0, chunk.endMs - chunk.startMs)

  return segments
    .map((segment, index) => {
      const text = segment.text.trim()
      if (!text) return null

      const startMs = chunk.startMs + clampMs(Math.round(segment.start * 1_000), chunkDurationMs)
      const endCandidate = segment.end == null ? chunkDurationMs : Math.round(segment.end * 1_000)
      const endMs = chunk.startMs + clampMs(Math.max(endCandidate, 0), chunkDurationMs)

      return {
        id: `${chunk.startMs}-${index}`,
        startMs,
        endMs: Math.max(startMs, endMs),
        text,
        timestamp: new Date().toISOString(),
      }
    })
    .filter((segment): segment is TranscriptSegment => segment !== null)
}

function clampMs(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

// Whisper emits special bracket tokens for silence/noise — strip them before storing.
const WHISPER_TOKEN_PATTERN = /\[[A-Z_]+\]/g

export function stripWhisperTokens(raw: string): string {
  return raw.replaceAll(WHISPER_TOKEN_PATTERN, '').replaceAll(/\s{2,}/g, ' ').trim()
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) }
}

process.on('message', async (message: WorkerRequest) => {
  try {
    switch (message.type) {
      case 'initialize':
        await initialize({
          id: message.modelId,
          engine: message.engine,
          runtimeModelName: message.runtimeModelName,
          useGpuAcceleration: message.useGpuAcceleration,
          sherpaKind: message.sherpaKind,
        })
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
  log('Transcription worker uncaught exception', normalizeError(error))
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log('Transcription worker unhandled rejection', normalizeError(reason))
  process.exit(1)
})
