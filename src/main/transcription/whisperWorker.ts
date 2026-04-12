import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import type { AudioChunk, TranscriptSegment, TranscriptionEngine } from '../../shared/types'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

type ModelConfig = {
  id: string
  engine: TranscriptionEngine
  runtimeModelName: string
  useGpuAcceleration: boolean
}

type WhisperJsonSegment = {
  timestamps: { from: string; to: string }
  offsets: { from: number; to: number }
  text: string
}

type WhisperJson = {
  transcription?: WhisperJsonSegment[]
}

type ParakeetSegment = {
  start: number
  end?: number | null
  text: string
}

type ParakeetServerMessage =
  | {
      type: 'ready'
      device: string
    }
  | {
      type: 'result'
      id: string
      device: string
      text?: string
      segments: ParakeetSegment[]
    }
  | {
      type: 'error'
      id?: string
      error: string
      traceback?: string
    }

type PendingParakeetRequest = {
  resolve: (value: ParakeetServerMessage & { type: 'result' }) => void
  reject: (error: Error) => void
}

const PARAKEET_SERVER_CODE = String.raw`
import json
import sys
import traceback

model_name = sys.argv[1]
prefer_gpu = sys.argv[2] == "1"

try:
    import torch
except Exception:
    torch = None

try:
    from nemo.collections.asr.models import ASRModel

    model = ASRModel.from_pretrained(model_name=model_name)
    if hasattr(model, "freeze"):
        model.freeze()

    device = "cpu"
    if prefer_gpu and torch is not None and torch.cuda.is_available():
        model = model.cuda()
        device = "cuda"

    print(json.dumps({"type": "ready", "device": device}), flush=True)

    for line in sys.stdin:
        if not line:
            continue

        try:
            request = json.loads(line)
            hypotheses = model.transcribe([request["wav_path"]], batch_size=1, timestamps=True)
            hypothesis = hypotheses[0] if hypotheses else ""

            if hasattr(hypothesis, "text"):
                text = hypothesis.text
                timestamp = getattr(hypothesis, "timestamp", None)
            else:
                text = hypothesis if isinstance(hypothesis, str) else str(hypothesis)
                timestamp = None

            raw_segments = []
            if isinstance(timestamp, dict):
                raw_segments = timestamp.get("segment") or []

            segments = []
            for segment in raw_segments:
                segment_text = (
                    segment.get("segment")
                    or segment.get("text")
                    or segment.get("word")
                    or ""
                ).strip()
                start = segment.get("start")
                end = segment.get("end")

                if segment_text:
                    segments.append({
                        "start": float(start or 0.0),
                        "end": None if end is None else float(end),
                        "text": segment_text,
                    })

            if not segments and text.strip():
                segments.append({
                    "start": 0.0,
                    "end": None,
                    "text": text.strip(),
                })

            print(
                json.dumps(
                    {
                        "type": "result",
                        "id": request["id"],
                        "device": device,
                        "text": text,
                        "segments": segments,
                    }
                ),
                flush=True,
            )
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "type": "error",
                        "id": request.get("id"),
                        "error": str(exc),
                        "traceback": traceback.format_exc(),
                    }
                ),
                flush=True,
            )
except Exception as exc:
    print(
        json.dumps(
            {
                "type": "error",
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
        ),
        flush=True,
    )
    sys.exit(1)
`

let currentModel: ModelConfig | null = null
let initialized = false
/** After a CUDA failure, stay on CPU for the remainder of this worker process. */
let whisperForceCpu = false
let parakeetServer: ChildProcessWithoutNullStreams | null = null
let parakeetRequestSeq = 0
const pendingParakeetRequests = new Map<string, PendingParakeetRequest>()

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

  if (model.engine === 'parakeet') {
    sendStatus('Preparing NVIDIA Parakeet v3. First run may download Python model weights...')
    await ensureParakeetServer(model)
  } else {
    sendStatus('Whisper (whisper.cpp) ready')
  }

  log('Transcription worker initialized', {
    modelId: model.id,
    engine: model.engine,
    runtimeModelName: model.runtimeModelName,
    useGpuAcceleration: model.useGpuAcceleration,
  })
  initialized = true
}

function float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(s < 0 ? Math.ceil(s * 32768) : Math.round(s * 32767), 44 + i * 2)
  }

  return buffer
}

async function transcribe(chunk: AudioChunk): Promise<TranscriptSegment[]> {
  if (!currentModel) {
    throw new Error('Worker not initialized with a model. Call initialize first.')
  }

  if (currentModel.engine === 'parakeet') {
    return transcribeWithParakeet(currentModel, chunk)
  }

  return transcribeWithWhisper(currentModel.runtimeModelName, chunk)
}

async function transcribeWithWhisper(
  modelName: string,
  chunk: AudioChunk
): Promise<TranscriptSegment[]> {
  const { nodewhisper } = await import('nodejs-whisper')

  const tmpDir = tmpdir()
  const baseName = `whisper_${Date.now()}_${process.pid}`
  const wavPath = join(tmpDir, `${baseName}.wav`)
  const jsonPath = join(tmpDir, `${baseName}.wav.json`)

  try {
    writeFileSync(wavPath, float32ToWav(chunk.audio, 16_000))

    log('Transcribing audio chunk with whisper.cpp', {
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      sampleCount: chunk.audio.length,
      modelName,
    })

    const whisperOpts = {
      outputInJson: true,
      outputInText: false,
      outputInSrt: false,
      outputInCsv: false,
    } as const

    const runNodewhisper = async (withCuda: boolean): Promise<void> => {
      await nodewhisper(wavPath, {
        modelName,
        removeWavFileAfterTranscription: false,
        withCuda,
        whisperOptions: whisperOpts,
      })
    }

    if (currentModel?.useGpuAcceleration && !whisperForceCpu) {
      try {
        await runNodewhisper(true)
      } catch (error) {
        log('Whisper CUDA path failed; falling back to CPU for this session', normalizeError(error))
        whisperForceCpu = true
        cleanupFiles(jsonPath)
        await runNodewhisper(false)
      }
    } else {
      await runNodewhisper(false)
    }

    if (!existsSync(jsonPath)) {
      log('Whisper produced no JSON output', { baseName })
      return []
    }

    const whisperOutput: WhisperJson = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    const segments = (whisperOutput.transcription ?? [])
      .map((seg, index) => toWhisperTranscriptSegment(seg, index, chunk))
      .filter((segment): segment is TranscriptSegment => segment !== null)

    log('Whisper returned segments', { segmentCount: segments.length })
    return segments
  } finally {
    cleanupFiles(wavPath, jsonPath)
  }
}

async function transcribeWithParakeet(
  model: ModelConfig,
  chunk: AudioChunk
): Promise<TranscriptSegment[]> {
  await ensureParakeetServer(model)

  const tmpDir = tmpdir()
  const baseName = `parakeet_${Date.now()}_${process.pid}`
  const wavPath = join(tmpDir, `${baseName}.wav`)

  try {
    writeFileSync(wavPath, float32ToWav(chunk.audio, 16_000))

    log('Transcribing audio chunk with Parakeet', {
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      sampleCount: chunk.audio.length,
      runtimeModelName: model.runtimeModelName,
      useGpuAcceleration: model.useGpuAcceleration,
    })

    const response = await requestParakeetTranscription(wavPath)
    const segments = normalizeParakeetSegments(response.segments, chunk)
    log('Parakeet returned segments', {
      segmentCount: segments.length,
      device: response.device,
    })
    return segments
  } finally {
    cleanupFiles(wavPath)
  }
}

async function ensureParakeetServer(model: ModelConfig): Promise<void> {
  if (parakeetServer) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'python3',
      ['-u', '-c', PARAKEET_SERVER_CODE, model.runtimeModelName, model.useGpuAcceleration ? '1' : '0'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )

    let settled = false
    let stdoutBuffer = ''

    const settleResolve = (): void => {
      if (settled) return
      settled = true
      resolve()
    }

    const settleReject = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }

    const handleServerMessage = (message: ParakeetServerMessage): void => {
      if (message.type === 'ready') {
        sendStatus(
          message.device === 'cuda'
            ? 'Parakeet v3 ready with NVIDIA CUDA acceleration'
            : 'Parakeet v3 ready (CPU mode)'
        )
        log('Parakeet Python server ready', {
          device: message.device,
          runtimeModelName: model.runtimeModelName,
        })
        settleResolve()
        return
      }

      if (message.type === 'result') {
        const pending = pendingParakeetRequests.get(message.id)
        if (!pending) return
        pendingParakeetRequests.delete(message.id)
        pending.resolve(message)
        return
      }

      const error = new Error(message.error)
      if (message.traceback) {
        error.stack = message.traceback
      }

      if (message.id) {
        const pending = pendingParakeetRequests.get(message.id)
        if (pending) {
          pendingParakeetRequests.delete(message.id)
          pending.reject(error)
          return
        }
      }

      settleReject(error)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8')
      let newlineIndex = stdoutBuffer.indexOf('\n')

      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim()
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)

        if (line) {
          try {
            handleServerMessage(JSON.parse(line) as ParakeetServerMessage)
          } catch (error) {
            log('Failed to parse Parakeet server stdout', {
              line,
              error: normalizeError(error),
            })
          }
        }

        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    })

    createInterface({ input: child.stderr }).on('line', (line) => {
      const detail = line.trim()
      if (detail) {
        log('Parakeet Python stderr', { detail })
      }
    })

    child.once('error', (error) => {
      settleReject(
        new Error(`Failed to start Python for Parakeet. Ensure python3 is available. ${error.message}`)
      )
    })

    child.once('exit', (code, signal) => {
      const details = { code, signal }
      log('Parakeet Python server exited', details)
      parakeetServer = null
      rejectPendingParakeetRequests(
        new Error(`Parakeet Python server exited unexpectedly (code: ${code ?? 'null'}, signal: ${signal ?? 'none'})`)
      )
      if (!settled) {
        settleReject(
          new Error(
            'Parakeet initialization failed. Install NVIDIA NeMo ASR dependencies in your Python environment.'
          )
        )
      }
    })

    parakeetServer = child
  })
}

async function requestParakeetTranscription(
  wavPath: string
): Promise<ParakeetServerMessage & { type: 'result' }> {
  if (!parakeetServer) {
    throw new Error('Parakeet server is not running')
  }

  return new Promise((resolve, reject) => {
    parakeetRequestSeq += 1
    const id = `parakeet-${parakeetRequestSeq}`
    pendingParakeetRequests.set(id, { resolve, reject })

    try {
      parakeetServer?.stdin.write(`${JSON.stringify({ id, wav_path: wavPath })}\n`)
    } catch (error) {
      pendingParakeetRequests.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function normalizeParakeetSegments(
  segments: ParakeetSegment[],
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

function cleanupFiles(...paths: string[]): void {
  for (const path of paths) {
    if (existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

// Whisper.cpp emits special bracket tokens for silence/noise — strip them before storing.
const WHISPER_TOKEN_PATTERN = /\[[A-Z_]+\]/g

export function stripWhisperTokens(raw: string): string {
  return raw.replaceAll(WHISPER_TOKEN_PATTERN, '').replaceAll(/\s{2,}/g, ' ').trim()
}

function toWhisperTranscriptSegment(
  segment: WhisperJsonSegment,
  index: number,
  chunk: AudioChunk
): TranscriptSegment | null {
  const text = stripWhisperTokens(segment.text?.trim() ?? '')
  if (!text) return null

  return {
    id: `${chunk.startMs}-${index}`,
    startMs: chunk.startMs + segment.offsets.from,
    endMs: chunk.startMs + segment.offsets.to,
    text,
    timestamp: new Date().toISOString(),
  }
}

function rejectPendingParakeetRequests(error: Error): void {
  for (const pending of pendingParakeetRequests.values()) {
    pending.reject(error)
  }
  pendingParakeetRequests.clear()
}

function shutdownParakeetServer(): void {
  if (!parakeetServer) {
    return
  }

  const child = parakeetServer
  parakeetServer = null

  try {
    child.stdin.end()
  } catch {
    // ignore shutdown errors
  }

  if (!child.killed) {
    child.kill()
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
        await initialize({
          id: message.modelId,
          engine: message.engine,
          runtimeModelName: message.runtimeModelName,
          useGpuAcceleration: message.useGpuAcceleration,
        })
        respond({ type: 'ready', requestId: message.requestId })
        break
      case 'transcribe': {
        const segments = await transcribe(message.chunk)
        respond({ type: 'result', requestId: message.requestId, segments })
        break
      }
      case 'shutdown':
        shutdownParakeetServer()
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
  shutdownParakeetServer()
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log('Transcription worker unhandled rejection', normalizeError(reason))
  shutdownParakeetServer()
  process.exit(1)
})
