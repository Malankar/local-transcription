import { EventEmitter } from 'events'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'

import type { AudioChunk, CaptureStartOptions } from '../../shared/types'

const SAMPLE_RATE = 16_000
const CHANNELS = 1
const BYTES_PER_SAMPLE = 2
const ANALYSIS_WINDOW_MS = 100
const MIN_CHUNK_MS = 8_000
const TARGET_CHUNK_MS = 14_000
const MAX_CHUNK_MS = 22_000
const MIN_SILENCE_MS = 700
const SILENCE_RMS_THRESHOLD = 0.015
const ANALYSIS_WINDOW_BYTE_SIZE =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (ANALYSIS_WINDOW_MS / 1_000)
const MIN_CHUNK_BYTE_SIZE =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (MIN_CHUNK_MS / 1_000)
const TARGET_CHUNK_BYTE_SIZE =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (TARGET_CHUNK_MS / 1_000)
const MAX_CHUNK_BYTE_SIZE =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (MAX_CHUNK_MS / 1_000)
const REQUIRED_SILENCE_WINDOWS = Math.ceil(MIN_SILENCE_MS / ANALYSIS_WINDOW_MS)

interface AudioCaptureEvents {
  chunk: [AudioChunk]
  error: [Error]
  status: [string]
  stopped: []
}

export class AudioCapture extends EventEmitter<AudioCaptureEvents> {
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null
  private buffer = Buffer.alloc(0)
  private emittedDurationMs = 0

  start(options: CaptureStartOptions): void {
    if (this.process) {
      throw new Error('Capture is already running')
    }

    const args = buildFfmpegArgs(options)
    this.buffer = Buffer.alloc(0)
    this.emittedDurationMs = 0
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
      this.emit('error', error)
    })

    process.on('close', () => {
      this.process = null
      this.buffer = Buffer.alloc(0)
      this.emit('stopped')
    })
  }

  stop(): void {
    if (!this.process) {
      return
    }

    this.flushRemainingChunk()
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
      this.buffer = this.buffer.subarray(nextChunkByteSize)
      this.emitChunk(chunk)
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
    this.emitChunk(chunk)
  }

  private findChunkByteSize(): number | null {
    const availableByteLength = this.buffer.length - (this.buffer.length % BYTES_PER_SAMPLE)
    if (availableByteLength < MIN_CHUNK_BYTE_SIZE) {
      return null
    }

    const silenceBoundary = this.findSilenceBoundary(availableByteLength)
    if (silenceBoundary !== null) {
      return silenceBoundary
    }

    if (availableByteLength < MAX_CHUNK_BYTE_SIZE) {
      return null
    }

    const quietBoundary = this.findQuietBoundary(
      TARGET_CHUNK_BYTE_SIZE,
      Math.min(availableByteLength, MAX_CHUNK_BYTE_SIZE)
    )

    return quietBoundary ?? MAX_CHUNK_BYTE_SIZE
  }

  private findSilenceBoundary(availableByteLength: number): number | null {
    let silentWindows = 0

    for (
      let windowEnd = ANALYSIS_WINDOW_BYTE_SIZE;
      windowEnd <= availableByteLength;
      windowEnd += ANALYSIS_WINDOW_BYTE_SIZE
    ) {
      const windowStart = windowEnd - ANALYSIS_WINDOW_BYTE_SIZE
      const rms = calculateRms(this.buffer.subarray(windowStart, windowEnd))

      silentWindows = rms <= SILENCE_RMS_THRESHOLD ? silentWindows + 1 : 0

      const hasEnoughAudio = windowEnd >= MIN_CHUNK_BYTE_SIZE
      if (hasEnoughAudio && silentWindows >= REQUIRED_SILENCE_WINDOWS) {
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

  private emitChunk(chunk: Buffer): void {
    const durationMs = Math.round(
      (chunk.length / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE)) * 1_000
    )
    const chunkStartMs = this.emittedDurationMs
    const chunkEndMs = chunkStartMs + durationMs

    this.emit('chunk', {
      audio: pcm16ToFloat32(chunk),
      startMs: chunkStartMs,
      endMs: chunkEndMs,
    })

    this.emittedDurationMs = chunkEndMs
  }
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
