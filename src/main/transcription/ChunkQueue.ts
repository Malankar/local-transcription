import { EventEmitter } from 'events'

import type { AudioChunk, TranscriptSegment } from '../../shared/types'
import { dropNoiseTranscriptSegments } from '../../shared/transcriptSegments'

interface ChunkQueueEvents {
  segment: [TranscriptSegment]
  error: [Error]
  status: [string]
  drained: []
}

type Processor = (chunk: AudioChunk) => Promise<TranscriptSegment[]>
type QueueMode = 'default' | 'realtime'

export class ChunkQueue extends EventEmitter<ChunkQueueEvents> {
  private queue: AudioChunk[] = []
  private processing = false
  private mode: QueueMode = 'default'

  constructor(private readonly processor: Processor) {
    super()
  }

  setMode(mode: QueueMode): void {
    this.mode = mode
  }

  enqueue(chunk: AudioChunk): void {
    this.queue.push(chunk)
    void this.processNext()
  }

  clear(): void {
    this.queue = []
  }

  /**
   * After capture stops, queue may be idle while the last `drained` fired during capture.
   * Re-enter drain check so listeners can persist (e.g. history save).
   */
  notifyCaptureEnded(): void {
    void this.processNext()
  }

  /** Node EventEmitter throws if `error` is emitted with no listeners; avoid breaking the queue. */
  private emitProcessorError(error: Error): void {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error)
    }
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
    this.emit(
      'status',
      this.mode === 'realtime'
        ? 'Transcribing live audio (queued windows are preserved)...'
        : 'Transcribing the latest natural audio window...',
    )

    try {
      const segments = await this.processor(nextChunk)
      if (Array.isArray(segments)) {
        for (const segment of dropNoiseTranscriptSegments(segments)) {
          this.emit('segment', segment)
        }
      } else {
        this.emitProcessorError(
          new Error(`Processor must resolve to TranscriptSegment[]; got ${typeof segments}`),
        )
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      this.emitProcessorError(normalized)
    } finally {
      this.processing = false
      void this.processNext()
    }
  }
}
