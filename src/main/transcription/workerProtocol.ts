import type {
  AudioChunk,
  SherpaModelKind,
  TranscriptSegment,
  TranscriptionEngine,
} from '../../shared/types'

export type WorkerRequest =
  | {
      type: 'initialize'
      requestId: string
      modelId: string
      engine: TranscriptionEngine
      runtimeModelName: string
      useGpuAcceleration: boolean
      sherpaKind?: SherpaModelKind
      /** Model-specific language code (already resolved against the model's options). */
      language?: string
      /** Silero VAD model; splits non-streaming audio into phrases. */
      vadModelPath: string
    }
  | {
      /** Starts a fresh capture session; timestamps restart at 0. */
      type: 'session-start'
      requestId: string
    }
  | {
      /** Fire-and-forget PCM frame; `sentAt` (epoch ms) lets the worker measure how far behind it is. */
      type: 'audio'
      chunk: AudioChunk
      sentAt: number
    }
  | {
      /** Flushes buffered audio; the reply arrives after every remaining segment was emitted. */
      type: 'session-end'
      requestId: string
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
      type: 'segment'
      segment: TranscriptSegment
    }
  | {
      type: 'partial'
      text: string
    }
  | {
      type: 'lag'
      behindMs: number
    }
  | {
      type: 'error'
      /** Absent when the failure came from fire-and-forget audio processing. */
      requestId?: string
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
