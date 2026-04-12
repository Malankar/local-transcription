import { EventEmitter } from 'events'

import type { AudioChunk, TranscriptSegment } from '../../shared/types'

interface ChunkQueueEvents {
  segment: [TranscriptSegment]
  error: [Error]
  status: [string]
  drained: []
}

type Processor = (chunk: AudioChunk) => Promise<TranscriptSegment[]>
type QueueMode = 'default' | 'realtime'

/** High-signal metrics for tuning transcription latency and throughput (dev logs / diagnostics). */
export type ChunkPipelineMetric =
  | {
      type: 'enqueued'
      backlogAfterEnqueue: number
      chunkAudioMs: number
      chunkStartMs: number
      chunkEndMs: number
    }
  | {
      type: 'chunkComplete'
      /** Chunks still waiting when this one started processing (excludes the chunk being processed). */
      backlogWaiting: number
      chunkAudioMs: number
      transcribeMs: number
      chunkStartMs: number
      chunkEndMs: number
    }

export class ChunkQueue extends EventEmitter<ChunkQueueEvents> {
  private queue: AudioChunk[] = []
  private processing = false
  private mode: QueueMode = 'default'

  constructor(
    private readonly processor: Processor,
    private readonly onPipelineMetric?: (metric: ChunkPipelineMetric) => void,
  ) {
    super()
  }

  setMode(mode: QueueMode): void {
    this.mode = mode
  }

  enqueue(chunk: AudioChunk): void {
    this.queue.push(chunk)
    this.onPipelineMetric?.({
      type: 'enqueued',
      backlogAfterEnqueue: this.queue.length,
      chunkAudioMs: Math.max(0, chunk.endMs - chunk.startMs),
      chunkStartMs: chunk.startMs,
      chunkEndMs: chunk.endMs,
    })
    void this.processNext()
  }

  clear(): void {
    this.queue = []
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
    const backlogWaiting = this.queue.length
    const chunkAudioMs = Math.max(0, nextChunk.endMs - nextChunk.startMs)
    const transcribeStarted = performance.now()
    this.emit(
      'status',
      this.mode === 'realtime'
        ? 'Transcribing live audio (queued windows are preserved)...'
        : 'Transcribing the latest natural audio window...',
    )

    try {
      const segments = await this.processor(nextChunk)
      this.onPipelineMetric?.({
        type: 'chunkComplete',
        backlogWaiting,
        chunkAudioMs,
        transcribeMs: Math.round(performance.now() - transcribeStarted),
        chunkStartMs: nextChunk.startMs,
        chunkEndMs: nextChunk.endMs,
      })
      if (Array.isArray(segments)) {
        for (const segment of segments) {
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
