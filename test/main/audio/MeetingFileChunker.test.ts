import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'

import { chunkMeetingFile } from '../../../src/main/audio/MeetingFileChunker'
import type { AudioChunk } from '../../../src/shared/types'

vi.mock('node:child_process', () => {
  const spawn = vi.fn()
  return {
    spawn,
    default: { spawn },
  }
})

class MockProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
}

function makePcmNoise(byteLength: number): Buffer {
  const buffer = Buffer.alloc(byteLength)
  for (let i = 0; i < buffer.length; i += 2) {
    buffer.writeInt16LE(10_000, i)
  }
  return buffer
}

describe('chunkMeetingFile', () => {
  let process: MockProcess

  beforeEach(() => {
    vi.clearAllMocks()
    process = new MockProcess()
    vi.mocked(spawn).mockReturnValue(process as any)
  })

  it('yields a chunk before ffmpeg close when enough audio has streamed', async () => {
    const iterator = chunkMeetingFile('/tmp/meeting.wav')
    const firstNext = iterator.next()

    process.stdout.write(makePcmNoise(16_000 * 2 * 4))
    const firstChunk = await firstNext

    expect(firstChunk.done).toBe(false)
    expect(firstChunk.value?.startMs).toBe(0)
    expect(firstChunk.value?.endMs).toBe(4000)
  })

  it('yields the remaining partial chunk when ffmpeg closes', async () => {
    const chunksPromise = (async () => {
      const chunks: AudioChunk[] = []
      for await (const chunk of chunkMeetingFile('/tmp/meeting.wav')) {
        chunks.push(chunk)
      }
      return chunks
    })()

    process.stdout.write(makePcmNoise(16_000 * 2 * 2))
    process.emit('close', 0)

    const chunks = await chunksPromise
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startMs).toBe(0)
    expect(chunks[0].endMs).toBe(2000)
  })
})
