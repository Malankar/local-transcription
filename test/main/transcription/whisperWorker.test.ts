import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeParakeetSegments,
  stripWhisperTokens,
} from '../../../src/main/transcription/whisperWorker'

const sendMock = vi.fn()
const originalSend = (process as any).send
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as any))

beforeAll(() => {
  ;(process as any).send = sendMock
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  ;(process as any).send = originalSend
  exitSpy.mockRestore()
})

describe('whisperWorker helpers', () => {
  it('normalizes Whisper token noise and whitespace', () => {
    expect(stripWhisperTokens('  hello [BLANK_AUDIO] world   [MUSIC]  ')).toBe('hello world')
  })

  it('normalizes Parakeet segments relative to the chunk window', () => {
    const chunk = { audio: new Float32Array(4), startMs: 1_000, endMs: 2_000 }

    expect(
      normalizeParakeetSegments(
        [
          { start: 0.25, end: 1.5, text: '  hello world  ' },
          { start: 1.75, end: null, text: '   ' },
        ],
        chunk
      )
    ).toEqual([
      {
        id: '1000-0',
        startMs: 1_250,
        endMs: 2_000,
        text: 'hello world',
        timestamp: expect.any(String),
      },
    ])
  })
})

describe('whisperWorker runtime protocol', () => {
  it('responds to initialize messages', async () => {
    process.emit('message', {
      type: 'initialize',
      requestId: 'req-1',
      modelId: 'base.en',
      engine: 'whisper',
      runtimeModelName: 'base.en',
      useGpuAcceleration: false,
    } as const)

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMock).toHaveBeenCalledWith({
      type: 'status',
      detail: 'Whisper (whisper.cpp) ready',
    })
    expect(sendMock).toHaveBeenCalledWith({
      type: 'log',
      message: 'Transcription worker initialized',
      context: {
        modelId: 'base.en',
        engine: 'whisper',
        runtimeModelName: 'base.en',
        useGpuAcceleration: false,
      },
    })
    expect(sendMock).toHaveBeenCalledWith({
      type: 'ready',
      requestId: 'req-1',
    })
  })

  it('returns an error for unsupported messages', async () => {
    process.emit('message', { type: 'nope', requestId: 'req-2' } as any)

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        requestId: 'req-2',
        message: expect.stringContaining('Unsupported worker request'),
      })
    )
  })

  it('shuts down cleanly when asked', async () => {
    process.emit('message', { type: 'shutdown', requestId: 'req-3' } as const)

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMock).toHaveBeenCalledWith({
      type: 'ready',
      requestId: 'req-3',
    })
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
