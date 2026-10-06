import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioCapture } from '../../../src/main/audio/AudioCapture'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'

vi.mock('../../../src/main/audio/ffmpegPath', () => ({ FFMPEG_PATH: '/bundled/ffmpeg' }))
vi.mock('../../../src/main/audio/systemAudioTap', () => ({
  MAC_SYSTEM_AUDIO_ID: 'macos-system-audio',
  getAudioTeeCommand: () => ({ path: '/bundled/audiotee', args: ['--sample-rate', '16000'] }),
}))

vi.mock('node:child_process', () => {
  const spawn = vi.fn()
  return {
    spawn,
    default: { spawn },
  }
})

class MockProcess extends EventEmitter {
  stdin = new Writable({ write(_chunk, _enc, cb) { cb() } })
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
      expect(spawn).toHaveBeenCalledWith('/bundled/ffmpeg', expect.arrayContaining(['-i', 'mic-id']), expect.anything())
    })

    it('spawns ffmpeg with correct arguments for system mode', () => {
      audioCapture.start({ mode: 'system', systemSourceId: 'sys-id' })
      expect(spawn).toHaveBeenCalledWith('/bundled/ffmpeg', expect.arrayContaining(['-i', 'sys-id']), expect.anything())
    })

    it('spawns ffmpeg with correct arguments for mixed mode', () => {
      audioCapture.start({ mode: 'mixed', systemSourceId: 'sys-id', micSourceId: 'mic-id' })
      expect(spawn).toHaveBeenCalledWith('/bundled/ffmpeg', expect.arrayContaining([
        expect.stringContaining('amix=inputs=2')
      ]), expect.anything())
    })
  })

  describe('restart', () => {
    it("ignores a stale ffmpeg 'close' after stop() and a quick restart", () => {
      const first = new MockProcess()
      const second = new MockProcess()
      vi.mocked(spawn).mockReturnValueOnce(first as any).mockReturnValueOnce(second as any)
      const stopped = vi.fn()
      audioCapture.on('stopped', stopped)

      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      audioCapture.stop()
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      first.emit('close')

      expect(audioCapture.isRunning()).toBe(true)
      expect(stopped).not.toHaveBeenCalled()
    })
  })

  describe('macOS system audio tap', () => {
    beforeEach(() => {
      vi.mocked(spawn).mockImplementation((() => new MockProcess()) as any)
    })

    it('pipes audiotee into ffmpeg stdin for system mode', () => {
      audioCapture.start({ mode: 'system', systemSourceId: 'macos-system-audio' })

      expect(spawn).toHaveBeenCalledWith('/bundled/ffmpeg', expect.arrayContaining(['-f', 's16le', '-i', 'pipe:0']), expect.anything())
      expect(spawn).toHaveBeenCalledWith('/bundled/audiotee', ['--sample-rate', '16000'], expect.anything())
    })

    it('mixes the tap with the mic in mixed mode', () => {
      audioCapture.start({ mode: 'mixed', systemSourceId: 'macos-system-audio', micSourceId: 'mic-id' })

      const ffmpegArgs = vi.mocked(spawn).mock.calls.find(([cmd]) => cmd === '/bundled/ffmpeg')?.[1]
      expect(ffmpegArgs).toEqual(expect.arrayContaining(['pipe:0', 'mic-id']))
      expect(spawn).toHaveBeenCalledWith('/bundled/audiotee', expect.anything(), expect.anything())
    })

    it('does not start the tap for mic-only capture', () => {
      audioCapture.start({ mode: 'mic', systemSourceId: 'macos-system-audio', micSourceId: 'mic-id' })
      expect(spawn).not.toHaveBeenCalledWith('/bundled/audiotee', expect.anything(), expect.anything())
    })

    it('kills the tap when capture stops', () => {
      audioCapture.start({ mode: 'system', systemSourceId: 'macos-system-audio' })
      const tap = vi.mocked(spawn).mock.results.find((_, i) => vi.mocked(spawn).mock.calls[i][0] === '/bundled/audiotee')?.value
      audioCapture.stop()
      expect(tap.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  describe('chunking', () => {
    it('emits one 100 ms frame per 3200 bytes with contiguous timestamps', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const chunks = collectChunks(audioCapture)

      mockProcess.stdout.push(makeNoisePcm(1))
      await tick()

      expect(chunks).toHaveLength(10)
      expect(chunks[0].audio).toBeInstanceOf(Float32Array)
      expect(chunks[0].audio).toHaveLength(1600)
      expect(chunks[0].audio[0]).toBeCloseTo(15000 / 32768)
      expect(chunks.map((c) => [c.startMs, c.endMs])).toEqual(
        Array.from({ length: 10 }, (_, i) => [i * 100, (i + 1) * 100]),
      )
    })

    it('emits frames for digital silence too', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const chunks = collectChunks(audioCapture)

      mockProcess.stdout.push(makeSilencePcm(1))
      await tick()

      expect(chunks).toHaveLength(10)
    })

    it('holds back a partial frame until enough bytes arrive', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const chunks = collectChunks(audioCapture)

      mockProcess.stdout.push(Buffer.alloc(2000))
      await tick()
      expect(chunks).toHaveLength(0)

      mockProcess.stdout.push(Buffer.alloc(1200))
      await tick()
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toMatchObject({ startMs: 0, endMs: 100 })
    })
  })

  describe('stop', () => {
    it('kills the process and flushes the remainder as a shorter final frame', async () => {
      audioCapture.start({ mode: 'mic', micSourceId: 'default' })
      const chunks = collectChunks(audioCapture)

      // 150 ms: one full frame + 50 ms left over
      mockProcess.stdout.push(Buffer.alloc(4800))
      await tick(50)

      audioCapture.stop()

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
      expect(chunks).toHaveLength(2)
      expect(chunks[1]).toMatchObject({ startMs: 100, endMs: 150 })
      expect(chunks[1].audio).toHaveLength(800)
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
