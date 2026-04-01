import { EventEmitter } from 'events'

import type { AudioChunk, TranscriptSegment } from '../../shared/types'

interface ChunkQueueEvents {
  segment: [TranscriptSegment]
  error: [Error]
  status: [string]
  drained: []
}

type Processor = (chunk: AudioChunk) => Promise<TranscriptSegment[]>

export class ChunkQueue extends EventEmitter<ChunkQueueEvents> {
  private queue: AudioChunk[] = []
  private processing = false

  constructor(private readonly processor: Processor) {
    super()
  }

  enqueue(chunk: AudioChunk): void {
    this.queue.push(chunk)
    void this.processNext()
  }

  clear(): void {
    this.queue = []
  }

  private async processNext(): Promise<void> {
    if (this.processing) {
      return
    }

    const nextChunk = this.queue.shift()
    if (!nextChunk) {
      this.emit('drained')
      return
    }

    this.processing = true
    this.emit('status', 'Transcribing the latest natural audio window...')

    try {
      const segments = await this.processor(nextChunk)
      for (const segment of segments) {
        this.emit('segment', segment)
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.emit('error', normalized)
    } finally {
      this.processing = false
      if (this.queue.length === 0) {
        this.emit('drained')
      }
      void this.processNext()
    }
  }
}
