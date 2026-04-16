import { spawn } from 'node:child_process'

import type { AudioChunk } from '../../shared/types'

const SAMPLE_RATE = 16_000
const BYTES_PER_SAMPLE = 2
const CHANNELS = 1
const CHUNK_MS = 4_000

const bytesPerMs = (SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS) / 1_000
const chunkByteSize = CHUNK_MS * bytesPerMs

export async function* chunkMeetingFile(filePath: string): AsyncGenerator<AudioChunk> {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-f',
      's16le',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  let pending = Buffer.alloc(0)
  let startMs = 0
  const bufferedChunks: AudioChunk[] = []
  const stderrChunks: Buffer[] = []
  let completed = false
  let streamError: Error | null = null
  let wakeup: (() => void) | null = null

  const notify = (): void => {
    if (wakeup) {
      wakeup()
      wakeup = null
    }
  }

  const pushBufferChunk = (chunkBuffer: Buffer): void => {
    const durationMs = Math.round(chunkBuffer.length / bytesPerMs)
    bufferedChunks.push({
      audio: pcm16ToFloat32(chunkBuffer),
      startMs,
      endMs: startMs + durationMs,
    })
    startMs += durationMs
    notify()
  }

  const drainFullChunks = (): void => {
    while (pending.length >= chunkByteSize) {
      pushBufferChunk(pending.subarray(0, chunkByteSize))
      pending = pending.subarray(chunkByteSize)
    }
  }

  ffmpeg.stdout.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk])
    drainFullChunks()
  })

  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk)
  })

  ffmpeg.on('error', (error) => {
    streamError = error
    completed = true
    notify()
  })

  ffmpeg.on('close', (code) => {
    if (code !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
      streamError = new Error(stderr || `ffmpeg failed with exit code ${code}`)
      completed = true
      notify()
      return
    }

    const remaining = pending.length - (pending.length % BYTES_PER_SAMPLE)
    if (remaining > 0) {
      pushBufferChunk(pending.subarray(0, remaining))
    }

    completed = true
    notify()
  })

  while (!completed || bufferedChunks.length > 0) {
    if (streamError) {
      throw streamError
    }
    if (bufferedChunks.length > 0) {
      const nextChunk = bufferedChunks.shift()
      if (nextChunk) {
        yield nextChunk
      }
      continue
    }
    await new Promise<void>((resolve) => {
      wakeup = resolve
    })
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
