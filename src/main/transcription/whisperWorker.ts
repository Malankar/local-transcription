import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AudioChunk, TranscriptSegment } from '../../shared/types'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

const MODEL_NAME = 'small.en'

let initialized = false

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
  if (initialized) return
  sendStatus('Whisper (whisper.cpp) ready')
  log('WhisperEngine initialized', { modelName: MODEL_NAME })
  initialized = true
}

function float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length
  const dataSize = numSamples * 2 // 16-bit PCM = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)              // PCM chunk size
  buffer.writeUInt16LE(1, 20)               // PCM format
  buffer.writeUInt16LE(1, 22)               // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)  // byte rate
  buffer.writeUInt16LE(2, 32)               // block align
  buffer.writeUInt16LE(16, 34)              // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(s < 0 ? Math.ceil(s * 32768) : Math.round(s * 32767), 44 + i * 2)
  }

  return buffer
}

type WhisperJsonSegment = {
  timestamps: { from: string; to: string }
  offsets: { from: number; to: number }
  text: string
}

type WhisperJson = {
  transcription?: WhisperJsonSegment[]
}

async function transcribe(chunk: AudioChunk): Promise<TranscriptSegment[]> {
  const { nodewhisper } = await import('nodejs-whisper')

  const tmpDir = tmpdir()
  const baseName = `whisper_${Date.now()}_${process.pid}`
  const wavPath = join(tmpDir, `${baseName}.wav`)
  // whisper.cpp appends .json to the full input path, so output is <name>.wav.json
  const jsonPath = join(tmpDir, `${baseName}.wav.json`)

  try {
    writeFileSync(wavPath, float32ToWav(chunk.audio, 16_000))

    log('Transcribing audio chunk', {
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      sampleCount: chunk.audio.length,
    })

    await nodewhisper(wavPath, {
      modelName: MODEL_NAME,
      removeWavFileAfterTranscription: false,
      withCuda: false,
      whisperOptions: {
        outputInJson: true,
        outputInText: false,
        outputInSrt: false,
        outputInCsv: false,
      },
    })

    if (!existsSync(jsonPath)) {
      log('Whisper produced no JSON output', { baseName })
      return []
    }

    const whisperOutput: WhisperJson = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    const segments = (whisperOutput.transcription ?? [])
      .map((seg, index) => toTranscriptSegment(seg, index, chunk))
      .filter((s): s is TranscriptSegment => s !== null)

    log('Whisper returned segments', { segmentCount: segments.length })
    return segments
  } finally {
    for (const p of [wavPath, jsonPath]) {
      if (existsSync(p)) {
        try {
          unlinkSync(p)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

function toTranscriptSegment(
  seg: WhisperJsonSegment,
  index: number,
  chunk: AudioChunk
): TranscriptSegment | null {
  const text = seg.text?.trim()
  if (!text) return null

  return {
    id: `${chunk.startMs}-${index}`,
    startMs: chunk.startMs + seg.offsets.from,
    endMs: chunk.startMs + seg.offsets.to,
    text,
    timestamp: new Date().toISOString(),
  }
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) }
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
