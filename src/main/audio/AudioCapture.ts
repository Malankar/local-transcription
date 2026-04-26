import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { AudioChunk, CaptureStartOptions } from '../../shared/types'

const SAMPLE_RATE = 16_000
const CHANNELS = 1
const BYTES_PER_SAMPLE = 2
const ANALYSIS_WINDOW_MS = 100
const SILENCE_RMS_THRESHOLD = 0.015
const ANALYSIS_WINDOW_BYTE_SIZE =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (ANALYSIS_WINDOW_MS / 1_000)

interface ChunkingProfile {
  minChunkMs: number
  targetChunkMs: number
  maxChunkMs: number
  minSilenceMs: number
  speechPadMs: number
  overlapMs: number
}

const CHUNKING_PROFILES: Record<'meeting' | 'live', ChunkingProfile> = {
  meeting: {
    minChunkMs: 2_500,
    targetChunkMs: 4_000,
    maxChunkMs: 4_000,
    minSilenceMs: 400,
    speechPadMs: 200,
    overlapMs: 350,
  },
  live: {
    minChunkMs: 1_200,
    targetChunkMs: 2_000,
    maxChunkMs: 3_500,
    minSilenceMs: 250,
    speechPadMs: 100,
    overlapMs: 200,
  },
}

interface AudioCaptureEvents {
  chunk: [AudioChunk]
  error: [Error]
  status: [string]
  stopped: []
}

export class AudioCapture extends EventEmitter<AudioCaptureEvents> {
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null
  private buffer = Buffer.alloc(0)
  private bufferStartMs = 0
  private chunkingProfile: ChunkingProfile = CHUNKING_PROFILES.meeting

  start(options: CaptureStartOptions): void {
    if (this.process) {
      throw new Error('Capture is already running')
    }

    this.chunkingProfile = CHUNKING_PROFILES[options.profile ?? 'meeting']

    let effectiveOptions = options
    if (options.mode === 'mixed') {
      if (!options.systemSourceId && !options.micSourceId) {
        throw new Error('At least one audio source is required for capture')
      }
      if (!options.micSourceId) {
        this.emit('status', 'No microphone source found — capturing system audio only')
        effectiveOptions = { ...options, mode: 'system' }
      } else if (!options.systemSourceId) {
        this.emit('status', 'No system audio source found — capturing microphone only')
        effectiveOptions = { ...options, mode: 'mic' }
      }
    }

    const args = buildFfmpegArgs(effectiveOptions)
    this.buffer = Buffer.alloc(0)
    this.bufferStartMs = 0
    const process = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.process = process

    this.emit('status', 'Audio capture started')

    process.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.flushAvailableChunks()
    })

    process.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim()
      if (message.length > 0) {
        this.emit('status', message)
      }
    })

    process.on('error', (error) => {
      this.emit('error', toCaptureError(error))
    })

    process.on('close', () => {
      this.process = null
      this.buffer = Buffer.alloc(0)
      this.bufferStartMs = 0
      this.emit('stopped')
    })
  }

  stop(): void {
    if (!this.process) {
      return
    }

    this.flushRemainingChunk()
    // Remove data listener before sending SIGTERM so that any buffered stdout
    // ffmpeg flushes on exit cannot accumulate new data after we've already
    // drained the buffer above.
    this.process.stdout.removeAllListeners('data')
    this.process.kill('SIGTERM')
    this.process = null
  }

  isRunning(): boolean {
    return this.process !== null
  }

  private flushAvailableChunks(): void {
    let nextChunkByteSize = this.findChunkByteSize()

    while (nextChunkByteSize !== null) {
      const chunk = this.buffer.subarray(0, nextChunkByteSize)
      const overlapByteSize = Math.min(
        toByteSize(this.chunkingProfile.overlapMs),
        Math.max(0, nextChunkByteSize - ANALYSIS_WINDOW_BYTE_SIZE),
      )
      const consumeByteSize = Math.max(BYTES_PER_SAMPLE, nextChunkByteSize - overlapByteSize)

      this.emitChunk(chunk, this.bufferStartMs)
      this.buffer = this.buffer.subarray(consumeByteSize)
      this.bufferStartMs += byteSizeToDurationMs(consumeByteSize)
      nextChunkByteSize = this.findChunkByteSize()
    }
  }

  private flushRemainingChunk(): void {
    if (this.buffer.length < BYTES_PER_SAMPLE) {
      this.buffer = Buffer.alloc(0)
      return
    }

    const remainingByteLength = this.buffer.length - (this.buffer.length % BYTES_PER_SAMPLE)
    if (remainingByteLength === 0) {
      this.buffer = Buffer.alloc(0)
      return
    }

    const chunk = this.buffer.subarray(0, remainingByteLength)
    this.buffer = Buffer.alloc(0)
    this.emitChunk(chunk, this.bufferStartMs)
    this.bufferStartMs += byteSizeToDurationMs(remainingByteLength)
  }

  private findChunkByteSize(): number | null {
    const minChunkByteSize = toByteSize(this.chunkingProfile.minChunkMs)
    const targetChunkByteSize = toByteSize(this.chunkingProfile.targetChunkMs)
    const maxChunkByteSize = toByteSize(this.chunkingProfile.maxChunkMs)
    const availableByteLength = this.buffer.length - (this.buffer.length % BYTES_PER_SAMPLE)
    if (availableByteLength < minChunkByteSize) {
      return null
    }

    const silenceBoundary = this.findSilenceBoundary(availableByteLength, minChunkByteSize)
    if (silenceBoundary !== null) {
      return this.extendBoundaryWithSpeechPadding(silenceBoundary, availableByteLength)
    }

    if (availableByteLength < maxChunkByteSize) {
      return null
    }

    const quietBoundary = this.findQuietBoundary(
      targetChunkByteSize,
      Math.min(availableByteLength, maxChunkByteSize)
    )

    return quietBoundary ?? maxChunkByteSize
  }

  private extendBoundaryWithSpeechPadding(boundaryByteSize: number, availableByteLength: number): number {
    const paddedBoundary = Math.min(
      availableByteLength,
      boundaryByteSize + toByteSize(this.chunkingProfile.speechPadMs),
    )

    return paddedBoundary - (paddedBoundary % BYTES_PER_SAMPLE)
  }

  private findSilenceBoundary(availableByteLength: number, minChunkByteSize: number): number | null {
    const requiredSilenceWindows = Math.ceil(this.chunkingProfile.minSilenceMs / ANALYSIS_WINDOW_MS)
    let silentWindows = 0

    for (
      let windowEnd = ANALYSIS_WINDOW_BYTE_SIZE;
      windowEnd <= availableByteLength;
      windowEnd += ANALYSIS_WINDOW_BYTE_SIZE
    ) {
      const windowStart = windowEnd - ANALYSIS_WINDOW_BYTE_SIZE
      const rms = calculateRms(this.buffer.subarray(windowStart, windowEnd))

      silentWindows = rms <= SILENCE_RMS_THRESHOLD ? silentWindows + 1 : 0

      const hasEnoughAudio = windowEnd >= minChunkByteSize
      if (hasEnoughAudio && silentWindows >= requiredSilenceWindows) {
        return windowEnd
      }
    }

    return null
  }

  private findQuietBoundary(searchStart: number, searchEnd: number): number | null {
    const alignedStart = Math.max(
      ANALYSIS_WINDOW_BYTE_SIZE,
      searchStart - (searchStart % ANALYSIS_WINDOW_BYTE_SIZE)
    )
    const alignedEnd = searchEnd - (searchEnd % ANALYSIS_WINDOW_BYTE_SIZE)

    let quietestBoundary: number | null = null
    let quietestRms = Number.POSITIVE_INFINITY

    for (
      let windowEnd = alignedStart;
      windowEnd <= alignedEnd;
      windowEnd += ANALYSIS_WINDOW_BYTE_SIZE
    ) {
      const windowStart = windowEnd - ANALYSIS_WINDOW_BYTE_SIZE
      const rms = calculateRms(this.buffer.subarray(windowStart, windowEnd))

      if (rms < quietestRms) {
        quietestRms = rms
        quietestBoundary = windowEnd
      }
    }

    return quietestBoundary
  }

  private emitChunk(chunk: Buffer, chunkStartMs: number): void {
    const durationMs = byteSizeToDurationMs(chunk.length)
    const chunkEndMs = chunkStartMs + durationMs

    // Only skip near–digital silence (do not use RMS here: quiet real audio and many
    // monitor captures sit below the chunking silence threshold and were being dropped
    // entirely, so nothing ever reached the transcriber).
    if (isNearDigitalSilencePcm16(chunk)) {
      return
    }

    this.emit('chunk', {
      audio: pcm16ToFloat32(chunk),
      startMs: chunkStartMs,
      endMs: chunkEndMs,
    })
  }
}

function toByteSize(durationMs: number): number {
  return SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (durationMs / 1_000)
}

function byteSizeToDurationMs(byteSize: number): number {
  return Math.round((byteSize / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)) * 1_000)
}

function buildFfmpegArgs(options: CaptureStartOptions): string[] {
  const baseArgs = ['-hide_banner', '-loglevel', 'warning']

  switch (options.mode) {
    case 'system':
      if (!options.systemSourceId) {
        throw new Error('A system source is required for system capture')
      }

      return [
        ...baseArgs,
        '-f',
        pulse,
        '-i',
        options.systemSourceId,
        '-ac',
        String(CHANNELS),
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        'pipe:1',
      ]
    case 'mic':
      if (!options.micSourceId) {
        throw new Error('A microphone source is required for mic capture')
      }

      return [
        ...baseArgs,
        '-f',
        pulse,
        '-i',
        options.micSourceId,
        '-ac',
        String(CHANNELS),
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        'pipe:1',
      ]
    case 'mixed':
      if (!options.systemSourceId || !options.micSourceId) {
        throw new Error('Both system and microphone sources are required for mixed capture')
      }

      return [
        ...baseArgs,
        '-f',
        pulse,
        '-i',
        options.systemSourceId,
        '-f',
        pulse,
        '-i',
        options.micSourceId,
        '-filter_complex',
        'amix=inputs=2:duration=longest:dropout_transition=0',
        '-ac',
        String(CHANNELS),
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        'pipe:1',
      ]
    default:
      throw new Error(`Unsupported capture mode: ${String(options.mode)}`)
  }
}

/** True when every sample is tiny (~-72 dBFS or lower), i.e. true silence or dither only. */
function isNearDigitalSilencePcm16(buffer: Buffer): boolean {
  const sampleCount = Math.floor(buffer.length / BYTES_PER_SAMPLE)
  if (sampleCount === 0) {
    return true
  }

  for (let index = 0; index < sampleCount; index += 1) {
    if (Math.abs(buffer.readInt16LE(index * BYTES_PER_SAMPLE)) > 8) {
      return false
    }
  }

  return true
}

function pcm16ToFloat32(buffer: Buffer): Float32Array {
  const sampleCount = buffer.length / BYTES_PER_SAMPLE
  const result = new Float32Array(sampleCount)

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(index * BYTES_PER_SAMPLE)
    result[index] = Math.max(-1, sample / 32_768)
  }

  return result
}

function calculateRms(buffer: Buffer): number {
  const sampleCount = Math.floor(buffer.length / BYTES_PER_SAMPLE)
  if (sampleCount === 0) {
    return 0
  }

  let sumSquares = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(index * BYTES_PER_SAMPLE) / 32_768
    sumSquares += sample * sample
  }

  return Math.sqrt(sumSquares / sampleCount)
}

const pulse = 'pulse'

function toCaptureError(error: Error): Error {
  const systemError = error as NodeJS.ErrnoException
  if (systemError.code === 'ENOENT' && systemError.message.includes('ffmpeg')) {
    return new Error(
      'FFmpeg is not installed or not available in PATH. Install it (Ubuntu/Debian: sudo apt install ffmpeg) and restart the app.',
    )
  }

  return error
}
