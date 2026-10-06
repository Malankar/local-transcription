import { describe, it, expectTypeOf } from 'vitest'
import type { WorkerRequest, WorkerRequestPayload, WorkerResponse } from '../../../src/main/transcription/workerProtocol'
import type { TranscriptionEngine } from '../../../src/shared/types'

type Chunk = { audio: Float32Array; startMs: number; endMs: number }

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
          language?: string
          vadModelPath: string
        }
      | { type: 'session-start'; requestId: string }
      | { type: 'audio'; chunk: Chunk; sentAt: number }
      | { type: 'session-end'; requestId: string }
      | { type: 'shutdown'; requestId: string }
    >()

    expectTypeOf<WorkerRequestPayload>().toMatchTypeOf<
      | {
          type: 'initialize'
          modelId: string
          engine: TranscriptionEngine
          runtimeModelName: string
          useGpuAcceleration: boolean
          vadModelPath: string
        }
      | { type: 'session-start' }
      | { type: 'audio'; chunk: Chunk; sentAt: number }
      | { type: 'session-end' }
      | { type: 'shutdown' }
    >()

    expectTypeOf<WorkerResponse>().toMatchTypeOf<
      | { type: 'ready'; requestId: string }
      | {
          type: 'segment'
          segment: { id: string; startMs: number; endMs: number; text: string; timestamp: string }
        }
      | { type: 'partial'; text: string }
      | { type: 'lag'; behindMs: number }
      | { type: 'error'; requestId?: string; message: string; stack?: string }
      | { type: 'status'; detail: string }
      | { type: 'log'; message: string; context?: unknown }
    >()
  })
})
