import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessByStdio, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

import type { AudioChunk, CaptureStartOptions } from '../../shared/types'
import { FFMPEG_PATH } from './ffmpegPath'
import { getAudioTeeCommand, MAC_SYSTEM_AUDIO_ID } from './systemAudioTap'

const SAMPLE_RATE = 16_000
const CHANNELS = 1
const BYTES_PER_SAMPLE = 2
/** Small frames keep streaming models responsive; the worker's VAD decides where phrases end. */
const FRAME_MS = 100
const FRAME_BYTE_SIZE = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * (FRAME_MS / 1_000)

interface AudioCaptureEvents {
  chunk: [AudioChunk]
  error: [Error]
  status: [string]
  stopped: []
}

export class AudioCapture extends EventEmitter<AudioCaptureEvents> {
  private process: ChildProcessWithoutNullStreams | null = null
  private tapProcess: ChildProcessByStdio<null, Readable, Readable> | null = null
  private buffer = Buffer.alloc(0)
  private bufferStartMs = 0

  start(options: CaptureStartOptions): void {
    if (this.process) {
      throw new Error('Capture is already running')
    }

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
    const process = spawn(FFMPEG_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.process = process

    if (effectiveOptions.mode !== 'mic' && effectiveOptions.systemSourceId === MAC_SYSTEM_AUDIO_ID) {
      this.startSystemAudioTap(process.stdin)
    }

    this.emit('status', 'Audio capture started')

    process.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.flushFrames()
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
      // A previous ffmpeg can close after stop() + a new start(); don't tear down the new one.
      if (this.process !== process && this.process !== null) return
      this.stopSystemAudioTap()
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
    this.stopSystemAudioTap()
  }

  /** Feeds macOS system audio (audiotee PCM) into ffmpeg's stdin, read there as `pipe:0`. */
  private startSystemAudioTap(sink: Writable): void {
    const { path, args } = getAudioTeeCommand()
    const tap = spawn(path, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.tapProcess = tap

    // ffmpeg exiting first closes the pipe; that's a normal shutdown, not an error.
    sink.on('error', () => {})
    tap.stdout.pipe(sink)

    // audiotee logs JSON lines to stderr; only surface its errors.
    createInterface({ input: tap.stderr }).on('line', (line) => {
      if (line.includes('"message_type":"error"')) {
        this.emit('status', `System audio capture error: ${line}`)
      }
    })

    tap.on('error', (error) => {
      this.emit('error', new Error(`Failed to start system audio capture: ${error.message}`))
    })
  }

  private stopSystemAudioTap(): void {
    this.tapProcess?.kill('SIGTERM')
    this.tapProcess = null
  }

  isRunning(): boolean {
    return this.process !== null
  }

  private flushFrames(): void {
    while (this.buffer.length >= FRAME_BYTE_SIZE) {
      this.emitChunk(this.buffer.subarray(0, FRAME_BYTE_SIZE), this.bufferStartMs)
      this.buffer = this.buffer.subarray(FRAME_BYTE_SIZE)
      this.bufferStartMs += FRAME_MS
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

  private emitChunk(chunk: Buffer, chunkStartMs: number): void {
    // Every frame is emitted, silence included: VAD and streaming models need the pauses,
    // and the worker derives timestamps from the sample count.
    const chunkEndMs = chunkStartMs + byteSizeToDurationMs(chunk.length)
    this.emit('chunk', {
      audio: pcm16ToFloat32(chunk),
      startMs: chunkStartMs,
      endMs: chunkEndMs,
    })
  }
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
        ...inputArgs(options.systemSourceId),
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
        ...inputArgs(options.micSourceId),
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
        ...inputArgs(options.systemSourceId),
        ...inputArgs(options.micSourceId),
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

function inputArgs(sourceId: string): string[] {
  if (sourceId === MAC_SYSTEM_AUDIO_ID) {
    return ['-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), '-i', 'pipe:0']
  }
  return ['-f', inputFormat, '-i', sourceId]
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

// avfoundation on macOS; PulseAudio elsewhere (Windows capture isn't implemented yet).
const inputFormat = process.platform === 'darwin' ? 'avfoundation' : 'pulse'

function toCaptureError(error: Error): Error {
  const systemError = error as NodeJS.ErrnoException
  if (systemError.code === 'ENOENT' && systemError.message.includes('ffmpeg')) {
    return new Error(
      'FFmpeg is not installed or not available in PATH. Install it (Ubuntu/Debian: sudo apt install ffmpeg) and restart the app.',
    )
  }

  return error
}
