import type { AudioChunk, TranscriptSegment } from '../../shared/types'

export type WorkerRequest =
  | {
      type: 'initialize'
      requestId: string
      modelName: string
    }
  | {
      type: 'transcribe'
      requestId: string
      chunk: AudioChunk
    }
  | {
      type: 'shutdown'
      requestId: string
    }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type WorkerRequestPayload = DistributiveOmit<WorkerRequest, 'requestId'>

export type WorkerResponse =
  | {
      type: 'ready'
      requestId: string
    }
  | {
      type: 'result'
      requestId: string
      segments: TranscriptSegment[]
    }
  | {
      type: 'error'
      requestId: string
      message: string
      stack?: string
    }
  | {
      type: 'status'
      detail: string
    }
  | {
      type: 'log'
      message: string
      context?: unknown
    }
