import { availableParallelism } from 'node:os'
import { join } from 'node:path'

import type {
  AudioChunk,
  SherpaModelKind,
  TranscriptSegment,
  TranscriptionEngine,
} from '../../shared/types'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

const SAMPLE_RATE = 16_000
const SAMPLES_PER_MS = SAMPLE_RATE / 1_000

/** Streaming models drop the first word without a little leading silence (measured on Nemotron). */
const STREAM_LEAD_IN_MS = 500

type ModelConfig = {
  id: string
  engine: TranscriptionEngine
  runtimeModelName: string
  useGpuAcceleration: boolean
  sherpaKind?: SherpaModelKind
  language?: string
  vadModelPath: string
}

type SherpaSegment = {
  start: number
  end?: number | null
  text: string
}

// Minimal shapes of the sherpa-onnx-node API we use (the package ships no TS types).
type SherpaOfflineRecognizer = {
  createStream: () => { acceptWaveform: (wave: { samples: Float32Array; sampleRate: number }) => void }
  decodeAsync: (stream: unknown) => Promise<{ text: string; tokens: string[]; timestamps: number[] }>
}

type SherpaOnlineStream = {
  acceptWaveform: (wave: { samples: Float32Array; sampleRate: number }) => void
  inputFinished: () => void
}

type SherpaOnlineRecognizer = {
  createStream: () => SherpaOnlineStream
  isReady: (stream: SherpaOnlineStream) => boolean
  decode: (stream: SherpaOnlineStream) => void
  isEndpoint: (stream: SherpaOnlineStream) => boolean
  reset: (stream: SherpaOnlineStream) => void
  getResult: (stream: SherpaOnlineStream) => { text: string; start_time?: number }
}

type SherpaVad = {
  acceptWaveform: (samples: Float32Array) => void
  isEmpty: () => boolean
  front: (enableExternalBuffer?: boolean) => { start: number; samples: Float32Array }
  pop: () => void
  flush: () => void
}

type SherpaModule = {
  OfflineRecognizer: { createAsync: (config: unknown) => Promise<SherpaOfflineRecognizer> }
  OnlineRecognizer: new (config: unknown) => SherpaOnlineRecognizer
  Vad: new (config: unknown, bufferSizeInSeconds: number) => SherpaVad
}

/** One capture session: audio in, `segment`/`partial` responses out. */
interface TranscriptionSession {
  accept: (samples: Float32Array) => Promise<void>
  finish: () => Promise<void>
}

let currentModel: ModelConfig | null = null
let offlineRecognizer: SherpaOfflineRecognizer | null = null
let onlineRecognizer: SherpaOnlineRecognizer | null = null
let session: TranscriptionSession | null = null
let lastLagReportAt = 0

function respond(message: WorkerResponse): void {
  process.send?.(message)
}

function log(message: string, context?: unknown): void {
  respond({ type: 'log', message, context })
}

function sendStatus(detail: string): void {
  respond({ type: 'status', detail })
}

function loadSherpa(): SherpaModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('sherpa-onnx-node') as SherpaModule
}

/**
 * ONNX Runtime is fastest at about half the logical cores; more threads fight each other
 * (measured on an 8-core M-series: 4 threads beat both 2 and 8 for Whisper Turbo and Parakeet).
 */
export function defaultNumThreads(cores = availableParallelism()): number {
  return Math.max(1, Math.min(8, Math.floor(cores / 2)))
}

async function initialize(model: ModelConfig): Promise<void> {
  if (currentModel) return
  if (!model.sherpaKind) {
    throw new Error(`Model ${model.id} is missing its sherpa-onnx model kind`)
  }

  sendStatus('Loading transcription model...')
  const sherpa = loadSherpa()
  const numThreads = defaultNumThreads()
  if (model.sherpaKind === 'streaming-transducer') {
    onlineRecognizer = new sherpa.OnlineRecognizer(buildOnlineRecognizerConfig(model.runtimeModelName, numThreads))
  } else {
    offlineRecognizer = await sherpa.OfflineRecognizer.createAsync({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: buildSherpaModelConfig(model.sherpaKind, model.runtimeModelName, model.language, numThreads),
    })
  }
  currentModel = model
  sendStatus('Transcription model ready')

  log('Transcription worker initialized', {
    modelId: model.id,
    sherpaKind: model.sherpaKind,
    language: model.language,
    numThreads,
  })
}

/** Maps a model kind to sherpa-onnx's modelConfig; file names match the catalog's HF files. */
export function buildSherpaModelConfig(
  kind: Exclude<SherpaModelKind, 'streaming-transducer'>,
  dir: string,
  language?: string,
  numThreads = defaultNumThreads(),
): Record<string, unknown> {
  const file = (name: string): string => join(dir, name)
  const common = { tokens: file('tokens.txt'), numThreads, provider: 'cpu' }

  switch (kind) {
    case 'whisper':
      // English-only models ignore language; sherpa-onnx auto-detects when it's ''.
      return {
        ...common,
        whisper: {
          encoder: file('encoder.int8.onnx'),
          decoder: file('decoder.int8.onnx'),
          language: !language || language === 'auto' ? '' : language,
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
      return {
        ...common,
        senseVoice: { model: file('model.int8.onnx'), language: language ?? 'auto', useInverseTextNormalization: 1 },
      }
    case 'canary':
      // Same source and target language = transcribe, not translate.
      return {
        ...common,
        canary: {
          encoder: file('encoder.int8.onnx'),
          decoder: file('decoder.int8.onnx'),
          srcLang: language ?? 'en',
          tgtLang: language ?? 'en',
          usePnc: 1,
        },
      }
  }
}

/** Nemotron-style streaming transducer; sherpa-onnx reads the model type from the ONNX metadata. */
export function buildOnlineRecognizerConfig(dir: string, numThreads = defaultNumThreads()): Record<string, unknown> {
  const file = (name: string): string => join(dir, name)
  return {
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: file('encoder.int8.onnx'),
        decoder: file('decoder.int8.onnx'),
        joiner: file('joiner.int8.onnx'),
      },
      tokens: file('tokens.txt'),
      numThreads,
      provider: 'cpu',
    },
    decodingMethod: 'greedy_search',
    enableEndpoint: 1,
    // Shorter pauses made Nemotron drop the word right after each cut; 1.6 s kept every word in testing.
    rule1MinTrailingSilence: 1.6,
    rule2MinTrailingSilence: 1.6,
    rule3MinUtteranceLength: 60,
  }
}

function startSession(): void {
  if (!currentModel) throw new Error('Worker not initialized with a model. Call initialize first.')
  lastLagReportAt = 0
  const sherpa = loadSherpa()
  session = onlineRecognizer
    ? createStreamingSession(onlineRecognizer)
    : createVadSession(sherpa, offlineRecognizer!, currentModel.vadModelPath)
}

/** Silero VAD cuts audio at real pauses; each phrase is decoded whole, so no words are split. */
function createVadSession(
  sherpa: SherpaModule,
  recognizer: SherpaOfflineRecognizer,
  vadModelPath: string,
): TranscriptionSession {
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: vadModelPath,
        threshold: 0.5,
        minSilenceDuration: 0.3,
        minSpeechDuration: 0.25,
        windowSize: 512,
        // Caps how long text waits during non-stop talking (12 s let 16 s phrases through in
        // testing; 8 s holds). ponytail: fixed; long phrases cut here can split a word.
        maxSpeechDuration: 8,
      },
      sampleRate: SAMPLE_RATE,
      numThreads: 1,
      provider: 'cpu',
    },
    60,
  )

  const drain = async (): Promise<void> => {
    while (!vad.isEmpty()) {
      // Copy out of VAD memory: pop() frees the buffer while decode is still running.
      const speech = vad.front(false)
      vad.pop()
      const startMs = Math.round(speech.start / SAMPLES_PER_MS)
      const chunk = {
        audio: speech.samples,
        startMs,
        endMs: startMs + Math.round(speech.samples.length / SAMPLES_PER_MS),
      }
      for (const segment of await transcribeChunk(recognizer, chunk)) {
        respond({ type: 'segment', segment })
      }
    }
  }

  return {
    accept: async (samples) => {
      vad.acceptWaveform(samples)
      await drain()
    },
    finish: async () => {
      vad.flush()
      await drain()
    },
  }
}

/** Streaming models decode as audio arrives: `partial` while talking, `segment` at each pause. */
function createStreamingSession(recognizer: SherpaOnlineRecognizer): TranscriptionSession {
  const stream = recognizer.createStream()
  stream.acceptWaveform({ samples: new Float32Array(STREAM_LEAD_IN_MS * SAMPLES_PER_MS), sampleRate: SAMPLE_RATE })
  let fedMs = 0
  let lastPartial = ''
  let segmentIndex = 0

  const pump = (endOfInput: boolean): void => {
    while (recognizer.isReady(stream)) recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    const text = result.text.trim()

    if (endOfInput || recognizer.isEndpoint(stream)) {
      if (text) {
        const startMs = Math.max(0, Math.round((result.start_time ?? 0) * 1_000) - STREAM_LEAD_IN_MS)
        respond({
          type: 'segment',
          segment: {
            id: `stream-${segmentIndex++}`,
            startMs: Math.min(startMs, fedMs),
            endMs: fedMs,
            text,
            timestamp: new Date().toISOString(),
          },
        })
      }
      recognizer.reset(stream)
      if (lastPartial) respond({ type: 'partial', text: '' })
      lastPartial = ''
      return
    }

    if (text !== lastPartial) {
      lastPartial = text
      respond({ type: 'partial', text })
    }
  }

  return {
    accept: async (samples) => {
      stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE })
      fedMs += Math.round(samples.length / SAMPLES_PER_MS)
      pump(false)
    },
    finish: async () => {
      // Trailing silence lets the model emit its last tokens before the stream closes.
      stream.acceptWaveform({ samples: new Float32Array(SAMPLE_RATE), sampleRate: SAMPLE_RATE })
      stream.inputFinished()
      pump(true)
    },
  }
}

async function transcribeChunk(
  recognizer: SherpaOfflineRecognizer,
  chunk: AudioChunk
): Promise<TranscriptSegment[]> {
  const stream = recognizer.createStream()
  stream.acceptWaveform({ samples: chunk.audio, sampleRate: SAMPLE_RATE })
  const result = await recognizer.decodeAsync(stream)

  // Whisper emits bracket tokens like [BLANK_AUDIO] for silence; harmless for other kinds.
  const text = stripWhisperTokens(result.text)
  return normalizeSherpaSegments(
    text ? [{ start: result.timestamps?.[0] ?? 0, end: null, text }] : [],
    chunk
  )
}

/** At most once a second, tells main how long audio waited before it was transcribed. */
function reportLag(sentAt: number): void {
  const now = Date.now()
  if (now - lastLagReportAt < 1_000) return
  lastLagReportAt = now
  respond({ type: 'lag', behindMs: Math.max(0, now - sentAt) })
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

async function handleMessage(message: WorkerRequest): Promise<void> {
  const requestId = 'requestId' in message ? message.requestId : undefined
  try {
    switch (message.type) {
      case 'initialize':
        await initialize({
          id: message.modelId,
          engine: message.engine,
          runtimeModelName: message.runtimeModelName,
          useGpuAcceleration: message.useGpuAcceleration,
          sherpaKind: message.sherpaKind,
          language: message.language,
          vadModelPath: message.vadModelPath,
        })
        respond({ type: 'ready', requestId: message.requestId })
        break
      case 'session-start':
        startSession()
        respond({ type: 'ready', requestId: message.requestId })
        break
      case 'audio':
        // Audio after a failed or ended session is dropped; the error was already reported.
        if (!session) return
        await session.accept(message.chunk.audio)
        reportLag(message.sentAt)
        break
      case 'session-end': {
        const ending = session
        session = null
        await ending?.finish()
        respond({ type: 'lag', behindMs: 0 })
        respond({ type: 'ready', requestId: message.requestId })
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
    respond({ type: 'error', requestId, message: normalized.message, stack: normalized.stack })
  }
}

// Messages run strictly in order: native decode isn't safe to run concurrently, and audio frames
// must reach the VAD/stream in capture order. Backlog here is what `lag` reports.
let queue: Promise<void> = Promise.resolve()
process.on('message', (message: WorkerRequest) => {
  queue = queue.then(() => handleMessage(message))
})

process.on('uncaughtException', (error) => {
  log('Transcription worker uncaught exception', normalizeError(error))
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log('Transcription worker unhandled rejection', normalizeError(reason))
  process.exit(1)
})
