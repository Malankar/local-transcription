import { describe, expect, it, expectTypeOf } from 'vitest'
import type { WorkerRequest, WorkerRequestPayload, WorkerResponse } from '../../../src/main/transcription/workerProtocol'
import type { TranscriptionEngine } from '../../../src/shared/types'

describe('workerProtocol', () => {
  it('keeps the worker request and response shapes aligned', () => {
    expectTypeOf<WorkerRequest>().toMatchTypeOf<
      | {
          type: 'initialize'
          requestId: string
          modelId: string
          engine: TranscriptionEngine
          runtimeModelName: string
          useGpuAcceleration: boolean
        }
      | {
          type: 'transcribe'
          requestId: string
          chunk: { audio: Float32Array; startMs: number; endMs: number }
        }
      | {
          type: 'shutdown'
          requestId: string
        }
    >()

    expectTypeOf<WorkerRequestPayload>().toMatchTypeOf<
      | {
          type: 'initialize'
          modelId: string
          engine: TranscriptionEngine
          runtimeModelName: string
          useGpuAcceleration: boolean
        }
      | {
          type: 'transcribe'
          chunk: { audio: Float32Array; startMs: number; endMs: number }
        }
      | {
          type: 'shutdown'
        }
    >()

    expectTypeOf<WorkerResponse>().toMatchTypeOf<
      | {
          type: 'ready'
          requestId: string
        }
      | {
          type: 'result'
          requestId: string
          segments: {
            id: string
            startMs: number
            endMs: number
            text: string
            timestamp: string
          }[]
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
    >()
  })
})
