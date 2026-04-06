import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HistoryManager } from '../../../src/main/history/HistoryManager'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { TranscriptSegment, HistoryAutoDelete } from '../../../src/shared/types'

vi.mock('node:fs', () => {
  const promises = {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
  }
  return {
    promises,
    default: { promises },
  }
})

describe('HistoryManager', () => {
  const userDataPath = '/tmp/user-data'
  const historyDir = join(userDataPath, 'history')
  let historyManager: HistoryManager

  beforeEach(() => {
    vi.clearAllMocks()
    historyManager = new HistoryManager(userDataPath)
  })

  describe('generateLabel', () => {
    it('generates label from frequent words', () => {
      const segments: TranscriptSegment[] = [
        { id: '1', startMs: 0, endMs: 1000, text: 'The artificial intelligence is amazing.', timestamp: 'T1' },
        { id: '2', startMs: 1000, endMs: 2000, text: 'I love artificial intelligence.', timestamp: 'T2' },
      ]
      const label = historyManager.generateLabel(segments)
      expect(label).toContain('Intelligence')
      expect(label).toContain('Artificial')
    })

    it('returns "Empty Recording" for empty segments', () => {
      expect(historyManager.generateLabel([])).toBe('Empty Recording')
    })

    it('returns a preview if no significant words are found', () => {
      const segments = [{ id: '1', startMs: 0, endMs: 1000, text: 'it is it is', timestamp: 'T1' }]
      expect(historyManager.generateLabel(segments)).toBe('it is it is')
    })
  })

  describe('saveSession', () => {
    it('saves session with correct metadata', async () => {
      const segments: TranscriptSegment[] = [
        { id: '1', startMs: 100, endMs: 1100, text: 'Hello world', timestamp: '2023-01-01T10:00:01Z' },
      ]
      const startTime = '2023-01-01T10:00:00Z'

      const meta = await historyManager.saveSession(segments, 'meeting', startTime)

      expect(fs.mkdir).toHaveBeenCalledWith(historyDir, { recursive: true })
      expect(fs.writeFile).toHaveBeenCalled()
      expect(meta.wordCount).toBe(2)
      expect(meta.durationMs).toBe(1000)
      expect(meta.startTime).toBe(startTime)
      expect(meta.endTime).toBe('2023-01-01T10:00:01Z')
    })
  })

  describe('pruneHistory', () => {
    const mockSessions = [
      { id: '1', startTime: '2023-01-10T10:00:00Z', starred: false },
      { id: '2', startTime: '2023-01-09T10:00:00Z', starred: true },
      { id: '3', startTime: '2023-01-08T10:00:00Z', starred: false },
      { id: '4', startTime: '2023-01-07T10:00:00Z', starred: false },
    ]

    beforeEach(() => {
      vi.spyOn(historyManager, 'listSessions').mockResolvedValue(mockSessions as any)
    })

    it('prunes based on historyLimit', async () => {
      const settings = {
        historyLimit: 2,
        autoDeleteRecordings: 'never' as const,
        keepStarredUntilDeleted: false,
      }

      await historyManager.pruneHistory(settings)

      expect(fs.unlink).toHaveBeenCalledTimes(2)
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, '3.json'))
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, '4.json'))
    })

    it('respects keepStarredUntilDeleted when pruning by limit', async () => {
      const settings = {
        historyLimit: 1,
        autoDeleteRecordings: 'never' as const,
        keepStarredUntilDeleted: true,
      }

      await historyManager.pruneHistory(settings)

      // session 2 is starred, so it should be skipped
      expect(fs.unlink).not.toHaveBeenCalledWith(join(historyDir, '2.json'))
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, '3.json'))
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, '4.json'))
      // Exactly 2 unlinkss: sessions 3 and 4; session 2 (starred) is preserved
      // even though it exceeds historyLimit — which is the intended product behaviour
      expect(fs.unlink).toHaveBeenCalledTimes(2)
    })

    it('prunes based on keep-latest-X', async () => {
      const settings = {
        historyLimit: 0,
        // 'keep-latest-2' is not in the HistoryAutoDelete union but the implementation
        // regex accepts any numeric suffix; cast to satisfy TypeScript while keeping the
        // original test intent intact.
        autoDeleteRecordings: 'keep-latest-2' as HistoryAutoDelete,
        keepStarredUntilDeleted: false,
      }

      await historyManager.pruneHistory(settings)
      expect(fs.unlink).toHaveBeenCalledTimes(2)
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, '3.json'))
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, '4.json'))
    })

    it('prunes sessions older than X days (older-than-Xd)', async () => {
      // Arrange: sessions 3 and 4 are more than 30 days in the past
      const now = Date.now()
      const recentDate = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString()   // 1 day ago
      const oldDate1   = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString()  // 31 days ago
      const oldDate2   = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString()  // 45 days ago

      const timedSessions = [
        { id: 'a', startTime: recentDate, starred: false },
        { id: 'b', startTime: recentDate, starred: false },
        { id: 'c', startTime: oldDate1,   starred: false },
        { id: 'd', startTime: oldDate2,   starred: false },
      ]
      vi.spyOn(historyManager, 'listSessions').mockResolvedValue(timedSessions as any)

      const settings = {
        historyLimit: 0,
        autoDeleteRecordings: 'older-than-30d' as const,
        keepStarredUntilDeleted: false,
      }

      await historyManager.pruneHistory(settings)

      expect(fs.unlink).toHaveBeenCalledTimes(2)
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, 'c.json'))
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, 'd.json'))
      expect(fs.unlink).not.toHaveBeenCalledWith(join(historyDir, 'a.json'))
      expect(fs.unlink).not.toHaveBeenCalledWith(join(historyDir, 'b.json'))
    })

    it('does not delete starred sessions when using older-than-Xd with keepStarredUntilDeleted', async () => {
      const now = Date.now()
      const oldDate = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString()

      const timedSessions = [
        { id: 'e', startTime: oldDate, starred: true  },
        { id: 'f', startTime: oldDate, starred: false },
      ]
      vi.spyOn(historyManager, 'listSessions').mockResolvedValue(timedSessions as any)

      const settings = {
        historyLimit: 0,
        autoDeleteRecordings: 'older-than-30d' as const,
        keepStarredUntilDeleted: true,
      }

      await historyManager.pruneHistory(settings)

      expect(fs.unlink).toHaveBeenCalledTimes(1)
      expect(fs.unlink).not.toHaveBeenCalledWith(join(historyDir, 'e.json'))
      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, 'f.json'))
    })

    it('does nothing when there are no sessions', async () => {
      vi.spyOn(historyManager, 'listSessions').mockResolvedValue([])

      await historyManager.pruneHistory({
        historyLimit: 1,
        autoDeleteRecordings: 'never',
        keepStarredUntilDeleted: false,
      })

      expect(fs.unlink).not.toHaveBeenCalled()
    })
  })

  describe('listSessions', () => {
    it('returns sessions sorted by startTime descending', async () => {
      const files = ['b.json', 'a.json']
      vi.mocked(fs.readdir).mockResolvedValue(files as any)
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          id: 'b', startTime: '2023-01-09T00:00:00Z', segments: [],
          label: 'B', endTime: '', durationMs: 0, wordCount: 0, segmentCount: 0, preview: '', profile: 'meeting',
        }))
        .mockResolvedValueOnce(JSON.stringify({
          id: 'a', startTime: '2023-01-10T00:00:00Z', segments: [],
          label: 'A', endTime: '', durationMs: 0, wordCount: 0, segmentCount: 0, preview: '', profile: 'meeting',
        }))

      const sessions = await historyManager.listSessions()
      expect(sessions[0].id).toBe('a') // newer first
      expect(sessions[1].id).toBe('b')
    })

    it('gracefully skips corrupted json files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['good.json', 'bad.json'] as any)
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          id: 'good', startTime: '2023-01-10T00:00:00Z', segments: [],
          label: 'G', endTime: '', durationMs: 0, wordCount: 0, segmentCount: 0, preview: '', profile: 'meeting',
        }))
        .mockResolvedValueOnce('{ invalid json')

      const sessions = await historyManager.listSessions()
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('good')
    })
  })

  describe('getSession', () => {
    it('returns parsed session for a valid id', async () => {
      const session = {
        id: 'abc', startTime: '2023-01-10T00:00:00Z', segments: [],
        label: 'Test', endTime: '', durationMs: 0, wordCount: 0, segmentCount: 0, preview: '', profile: 'meeting',
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(session))

      const result = await historyManager.getSession('abc')
      expect(result?.id).toBe('abc')
    })

    it('returns null when the file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))

      const result = await historyManager.getSession('missing')
      expect(result).toBeNull()
    })
  })

  describe('deleteSession', () => {
    it('calls unlink with the correct session path', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      await historyManager.deleteSession('xyz')

      expect(fs.unlink).toHaveBeenCalledWith(join(historyDir, 'xyz.json'))
    })
  })

  describe('starSession', () => {
    it('sets starred=true and persists to disk', async () => {
      const session = {
        id: 's1', startTime: '2023-01-10T00:00:00Z', segments: [], starred: false,
        label: 'S', endTime: '', durationMs: 0, wordCount: 0, segmentCount: 0, preview: '', profile: 'meeting',
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(session))
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await historyManager.starSession('s1', true)

      const written = JSON.parse(
        (vi.mocked(fs.writeFile).mock.calls[0][1] as string)
      )
      expect(written.starred).toBe(true)
    })

    it('sets starred=false and persists to disk', async () => {
      const session = {
        id: 's2', startTime: '2023-01-10T00:00:00Z', segments: [], starred: true,
        label: 'S', endTime: '', durationMs: 0, wordCount: 0, segmentCount: 0, preview: '', profile: 'meeting',
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(session))
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await historyManager.starSession('s2', false)

      const written = JSON.parse(
        (vi.mocked(fs.writeFile).mock.calls[0][1] as string)
      )
      expect(written.starred).toBe(false)
    })

    it('does nothing when session does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))

      await expect(historyManager.starSession('ghost', true)).resolves.toBeUndefined()
      expect(fs.writeFile).not.toHaveBeenCalled()
    })
  })
})
