import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSherpaModelConfig,
  normalizeSherpaSegments,
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

  it('normalizes sherpa-onnx segments relative to the chunk window', () => {
    const chunk = { audio: new Float32Array(4), startMs: 1_000, endMs: 2_000 }

    expect(
      normalizeSherpaSegments(
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

describe('buildSherpaModelConfig', () => {
  it.each([
    ['whisper', 'whisper', ['encoder.int8.onnx', 'decoder.int8.onnx']],
    ['nemo-transducer', 'transducer', ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx']],
    ['moonshine', 'moonshine', ['encoder_model.ort', 'decoder_model_merged.ort']],
    ['sense-voice', 'senseVoice', ['model.int8.onnx']],
    ['canary', 'canary', ['encoder.int8.onnx', 'decoder.int8.onnx']],
  ] as const)('%s points %s at the downloaded files', (kind, key, files) => {
    const config = buildSherpaModelConfig(kind, '/models/x')
    const section = JSON.stringify(config[key])

    expect(config.tokens).toBe('/models/x/tokens.txt')
    for (const file of files) {
      expect(section).toContain(`/models/x/${file}`)
    }
  })
})

describe('whisperWorker runtime protocol', () => {
  it('reports a load error when initialize is missing the sherpa model kind', async () => {
    process.emit('message', {
      type: 'initialize',
      requestId: 'req-1',
      modelId: 'base.en',
      engine: 'sherpa',
      runtimeModelName: '/models/base.en',
      useGpuAcceleration: false,
    } as const)

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMock).toHaveBeenCalledWith({ type: 'status', detail: 'Loading transcription model...' })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        requestId: 'req-1',
        message: 'Model base.en is missing its sherpa-onnx model kind',
      })
    )
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
