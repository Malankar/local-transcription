import { describe, it, expect, vi } from 'vitest'
import { ChunkQueue } from '../../../src/main/transcription/ChunkQueue'
import type { AudioChunk, TranscriptSegment } from '../../../src/shared/types'

function makeChunk(startMs: number, endMs: number): AudioChunk {
  return { audio: new Float32Array(16000), startMs, endMs }
}

function makeSegment(id: string, startMs: number, endMs: number, text: string): TranscriptSegment {
  return { id, startMs, endMs, text, timestamp: new Date(startMs).toISOString() }
}

describe('ChunkQueue', () => {
  describe('sequential processing', () => {
    it('processes chunks in FIFO order', async () => {
      const callOrder: number[] = []
      const processor = vi.fn(async (chunk: AudioChunk) => {
        callOrder.push(chunk.startMs)
        await new Promise(resolve => setTimeout(resolve, 10))
        return [makeSegment('1', chunk.startMs, chunk.endMs, 'test')]
      })

      const queue = new ChunkQueue(processor)
      queue.enqueue(makeChunk(100, 200))
      queue.enqueue(makeChunk(200, 300))

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callOrder).toEqual([100, 200])
    })

    it('emits segment events for each segment returned by processor', async () => {
      const processor = vi.fn(async () => [
        makeSegment('1', 0, 100, 'Hello'),
        makeSegment('2', 100, 200, 'World'),
      ])

      const queue = new ChunkQueue(processor)
      const emittedSegments: TranscriptSegment[] = []
      queue.on('segment', (seg) => emittedSegments.push(seg))

      queue.enqueue(makeChunk(0, 200))
      await new Promise(resolve => setTimeout(resolve, 30))

      expect(emittedSegments).toHaveLength(2)
      expect(emittedSegments[0].text).toBe('Hello')
      expect(emittedSegments[1].text).toBe('World')
    })

    it('invokes pipeline metric callback for enqueue and chunk completion', async () => {
      const processor = vi.fn(async () => [])
      const metrics: string[] = []
      const queue = new ChunkQueue(processor, (m) => {
        metrics.push(m.type)
      })

      queue.enqueue(makeChunk(0, 1000))
      await new Promise((resolve) => setTimeout(resolve, 30))

      expect(metrics).toContain('enqueued')
      expect(metrics).toContain('chunkComplete')
    })

    it('emits drained when queue becomes empty after processing', async () => {
      const processor = vi.fn(async () => [])
      const queue = new ChunkQueue(processor)
      const drainedEvents: number[] = []
      queue.on('drained', () => drainedEvents.push(1))

      queue.enqueue(makeChunk(0, 100))
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(drainedEvents).toHaveLength(1)
    })

    it('does not process when queue is empty', () => {
      const processor = vi.fn()
      const queue = new ChunkQueue(processor)

      queue.enqueue(makeChunk(0, 100))
      expect(processor).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('emits error event when processor throws', async () => {
      const processor = vi.fn().mockRejectedValue(new Error('Processing failed'))

      const queue = new ChunkQueue(processor)
      const errors: Error[] = []
      queue.on('error', (err) => errors.push(err))

      queue.enqueue(makeChunk(0, 100))
      await new Promise(resolve => setTimeout(resolve, 30))

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Processing failed')
    })

    it('continues processing next chunk after error', async () => {
      let callCount = 0
      const processor = vi.fn(async (chunk: AudioChunk) => {
        callCount++
        if (callCount === 1) {
          throw new Error('First fails')
        }
        return [makeSegment('2', chunk.startMs, chunk.endMs, 'recovered')]
      })

      const queue = new ChunkQueue(processor)
      const emittedSegments: TranscriptSegment[] = []
      queue.on('segment', (seg) => emittedSegments.push(seg))

      queue.enqueue(makeChunk(0, 100))
      queue.enqueue(makeChunk(100, 200))
      await new Promise(resolve => setTimeout(resolve, 60))

      expect(emittedSegments).toHaveLength(1)
      expect(emittedSegments[0].text).toBe('recovered')
    })
  })

  describe('realtime mode', () => {
    it('does not discard pending chunks when switching to realtime', async () => {
      const processor = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        return []
      })
      const queue = new ChunkQueue(processor)

      queue.enqueue(makeChunk(0, 100))
      queue.enqueue(makeChunk(100, 200))
      queue.enqueue(makeChunk(200, 300))
      queue.setMode('realtime')

      await new Promise(resolve => setTimeout(resolve, 120))

      expect(processor).toHaveBeenCalledTimes(3)
      expect(processor).toHaveBeenNthCalledWith(1, expect.objectContaining({ startMs: 0 }))
      expect(processor).toHaveBeenNthCalledWith(2, expect.objectContaining({ startMs: 100 }))
      expect(processor).toHaveBeenNthCalledWith(3, expect.objectContaining({ startMs: 200 }))
    })

    it('enqueues all chunks in FIFO order in realtime mode while processing', async () => {
      const callOrder: number[] = []
      const processor = vi.fn(async (chunk: AudioChunk) => {
        callOrder.push(chunk.startMs)
        await new Promise(resolve => setTimeout(resolve, 30))
        return []
      })

      const queue = new ChunkQueue(processor)
      queue.setMode('realtime')

      queue.enqueue(makeChunk(0, 100))
      await new Promise(resolve => setTimeout(resolve, 5))
      queue.enqueue(makeChunk(100, 200))
      queue.enqueue(makeChunk(200, 300))

      await new Promise(resolve => setTimeout(resolve, 120))

      expect(callOrder).toEqual([0, 100, 200])
    })
  })

  describe('clear', () => {
    it('removes pending chunks without processing them', async () => {
      const callOrder: number[] = []
      const processor = vi.fn(async (chunk: AudioChunk) => {
        callOrder.push(chunk.startMs)
        return []
      })

      const queue = new ChunkQueue(processor)
      queue.enqueue(makeChunk(0, 100))
      queue.clear()
      queue.enqueue(makeChunk(100, 200))

      await new Promise(resolve => setTimeout(resolve, 30))

      expect(callOrder).toEqual([0, 100])
    })

    it('stops further processing after clearing', async () => {
      const processor = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        return []
      })
      const queue = new ChunkQueue(processor)

      queue.enqueue(makeChunk(0, 100))
      queue.enqueue(makeChunk(100, 200))
      queue.clear()

      await new Promise(resolve => setTimeout(resolve, 60))

      expect(processor).toHaveBeenCalledTimes(1)
    })
  })
})
