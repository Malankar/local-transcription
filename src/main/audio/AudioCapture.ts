import { EventEmitter } from 'events'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'

import type { AudioChunk, CaptureStartOptions } from '../../shared/types'

const SAMPLE_RATE = 16_000
const CHANNELS = 1
const BYTES_PER_SAMPLE = 2
const CHUNK_DURATION_MS = 5_000
const CHUNK_BYTE_SIZE =
  SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (CHUNK_DURATION_MS / 1_000)

interface AudioCaptureEvents {
  chunk: [AudioChunk]
  error: [Error]
  status: [string]
  stopped: []
}

export class AudioCapture extends EventEmitter<AudioCaptureEvents> {
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null
  private buffer = Buffer.alloc(0)
  private emittedChunks = 0

  start(options: CaptureStartOptions): void {
    if (this.process) {
      throw new Error('Capture is already running')
    }

    const args = buildFfmpegArgs(options)
    this.buffer = Buffer.alloc(0)
    this.emittedChunks = 0
    const process = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.process = process

    this.emit('status', 'Audio capture started')

    process.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.flushCompleteChunks()
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

    this.process.kill('SIGTERM')
    this.process = null
  }

  isRunning(): boolean {
    return this.process !== null
  }

  private flushCompleteChunks(): void {
    while (this.buffer.length >= CHUNK_BYTE_SIZE) {
      const chunk = this.buffer.subarray(0, CHUNK_BYTE_SIZE)
      this.buffer = this.buffer.subarray(CHUNK_BYTE_SIZE)
      const chunkStartMs = this.emittedChunks * CHUNK_DURATION_MS
      const chunkEndMs = chunkStartMs + CHUNK_DURATION_MS

      this.emit('chunk', {
        audio: pcm16ToFloat32(chunk),
        startMs: chunkStartMs,
        endMs: chunkEndMs,
      })

      this.emittedChunks += 1
    }
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

const pulse = 'pulse'
