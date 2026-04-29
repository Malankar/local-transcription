import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioCapture } from '../../../src/main/audio/AudioCapture'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

vi.mock('node:child_process', () => {
  const spawn = vi.fn()
  return {
    spawn,
    default: { spawn },
  }
})

class MockProcess extends EventEmitter {
  stdout = new Readable({ read() {} })
  stderr = new Readable({ read() {} })
  kill = vi.fn()
}

function makeNoisePcm(seconds: number): Buffer {
  const data = Buffer.alloc(16000 * 2 * seconds)
  for (let i = 0; i < data.length; i += 2) {
    data.writeInt16LE(15000, i)
  }
  return data
}

function makeSilencePcm(seconds: number): Buffer {
  return Buffer.alloc(16000 * 2 * seconds)
}

function collectChunks(audioCapture: AudioCapture): any[] {
  const chunks: any[] = []
  audioCapture.on('chunk', (c) => chunks.push(c))
  return chunks
}

const tick = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))

describe('AudioCapture', () => {
  let audioCapture: AudioCapture
  let mockProcess: MockProcess

  beforeEach(() => {
    vi.clearAllMocks()
    mockProcess = new MockProcess()
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    audioCapture = new AudioCapture()
  })

  describe('start', () => {
    it('throws if already running', () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      expect(() => audioCapture.start({ mode: 'mic', micSourceId: 'default' })).toThrow('already running')
    })

    it('spawns ffmpeg with correct arguments for mic mode', () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'mic-id' })
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['-i', 'mic-id']), expect.anything())
    })

    it('spawns ffmpeg with correct arguments for system mode', () => {
      audioCapture.start({ mode: 'system', systemSourceId: 'sys-id' })
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['-i', 'sys-id']), expect.anything())
    })

    it('spawns ffmpeg with correct arguments for mixed mode', () => {
      audioCapture.start({ mode: 'mixed', systemSourceId: 'sys-id', micSourceId: 'mic-id' })
      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
        expect.stringContaining('amix=inputs=2')
      ]), expect.anything())
    })
  })

  describe('chunking', () => {
    it('emits chunk event when enough data is received', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default', profile: 'live' })
      const chunks = collectChunks(audioCapture)

      // Generate 4 seconds of "noise" (non-silent PCM) to exceed maxChunkMs (3.5s)
      mockProcess.stdout.push(makeNoisePcm(4))
      await tick()

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('retains a small overlap between consecutive forced chunks', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default', profile: 'live' })
      const chunks = collectChunks(audioCapture)

      // Generate 8 seconds of non-silent PCM so the chunker must force multiple windows.
      mockProcess.stdout.push(makeNoisePcm(8))
      await tick()
      audioCapture.stop()

      expect(chunks.length).toBeGreaterThanOrEqual(3)
      expect(chunks[1].startMs).toBeLessThan(chunks[0].endMs)
    })

    it('does not emit chunk for digital silence', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const chunks = collectChunks(audioCapture)

      // Generate 5 seconds of silence (zeros)
      mockProcess.stdout.push(makeSilencePcm(5))
      await tick()

      expect(chunks.length).toBe(0)
    })

    it('emits chunk for quiet audio that is still above the digital floor', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default', profile: 'live' })
      const chunks = collectChunks(audioCapture)

      const data = Buffer.alloc(16000 * 2 * 2)
      for (let i = 0; i < data.length; i += 2) {
        data.writeInt16LE(200, i)
      }
      mockProcess.stdout.push(data)
      await tick()

      expect(chunks.length).toBeGreaterThan(0)
    })
  })

  describe('stop', () => {
    it('kills the process and flushes remaining data', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const chunks = collectChunks(audioCapture)

      // Push 1 second of non-silent data
      mockProcess.stdout.push(makeNoisePcm(1))
      await tick(50)

      audioCapture.stop()

      expect(mockProcess.kill).toHaveBeenCalled()
      // flush emits at least one chunk (the 1s of non-silent audio)
      expect(chunks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('events', () => {
    it('emits error event when ffmpeg process errors', () => {
      const errors: Error[] = []
      audioCapture.on('error', (e) => errors.push(e))

      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const err = new Error('ffmpeg not found')
      mockProcess.emit('error', err)

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('ffmpeg not found')
    })

    it('emits stopped event when ffmpeg process closes', async () => {
      let stopped = false
      audioCapture.on('stopped', () => { stopped = true })

      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      mockProcess.emit('close')

      await tick(0)
      expect(stopped).toBe(true)
    })
  })

  describe('isRunning', () => {
    it('returns false before start', () => {
      expect(audioCapture.isRunning()).toBe(false)
    })

    it('returns true after start', () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      expect(audioCapture.isRunning()).toBe(true)
    })

    it('returns false after stop', () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      audioCapture.stop()
      expect(audioCapture.isRunning()).toBe(false)
    })
  })

  describe('argument validation', () => {
    it('throws when system mode is missing systemSourceId', () => {
      expect(() => audioCapture.start({ mode: 'system' })).toThrow('system source is required')
    })

    it('throws when mic mode is missing micSourceId', () => {
      expect(() => audioCapture.start({ mode: 'mic' })).toThrow('microphone source is required')
    })

    it('throws when mixed mode is missing both source IDs', () => {
      expect(() => audioCapture.start({ mode: 'mixed' })).toThrow('At least one audio source is required for capture')
    })
  })
})
