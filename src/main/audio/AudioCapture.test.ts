import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioCapture } from './AudioCapture'
import { spawn } from 'child_process'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

vi.mock('child_process', () => {
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
      
      const chunks: any[] = []
      audioCapture.on('chunk', (c) => chunks.push(c))

      // Generate 4 seconds of "noise" (non-silent PCM) to exceed maxChunkMs (3.5s)
      const data = Buffer.alloc(16000 * 2 * 4)
      for (let i = 0; i < data.length; i += 2) {
        data.writeInt16LE(15000, i) // Consistent non-silent value
      }

      mockProcess.stdout.push(data)
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('does not emit chunk for silence', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      
      const chunks: any[] = []
      audioCapture.on('chunk', (c) => chunks.push(c))

      // Generate 5 seconds of silence (zeros)
      const data = Buffer.alloc(16000 * 2 * 5)
      mockProcess.stdout.push(data)
      
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(chunks.length).toBe(0)
    })
  })

  describe('stop', () => {
    it('kills the process and flushes remaining data', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      
      const chunks: any[] = []
      audioCapture.on('chunk', (c) => chunks.push(c))

      // Push 1 second of non-silent data
      const data = Buffer.alloc(16000 * 2 * 1)
      for (let i = 0; i < data.length; i += 2) {
        data.writeInt16LE(15000, i)
      }
      mockProcess.stdout.push(data)
      
      // Wait for data to be buffered
      await new Promise(resolve => setTimeout(resolve, 50))

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

      // Give the event loop a tick
      await new Promise(resolve => setTimeout(resolve, 0))
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
      expect(() => audioCapture.start({ mode: 'mixed' })).toThrow('Both system and microphone sources are required')
    })
  })
})
