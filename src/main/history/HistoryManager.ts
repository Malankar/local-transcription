import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import type { AppSettings, HistoryAutoDelete, HistorySession, HistorySessionMeta, TranscriptSegment } from '../../shared/types'
import { dedupeTranscriptSegments } from '../../shared/transcriptSegments'

const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
  'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'was', 'are', 'been', 'has', 'had',
  'were', 'said', 'did', 'may', 'each', 'much', 'such', 'very', 'too', 'own',
  'yeah', 'okay', 'actually', 'really', 'thing', 'things', 'something', 'anything',
  'everything', 'nothing', 'going', 'going', 'okay', 'right', 'mean', 'sort',
  'kind', 'here', 'there', 'where', 'need', 'sure', 'that',
])

export class HistoryManager {
  private readonly dir: string

  constructor(userDataPath: string) {
    this.dir = join(userDataPath, 'history')
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async saveSession(
    segments: TranscriptSegment[],
    profile: 'meeting' | 'live',
    captureStartTime: string,
  ): Promise<HistorySessionMeta> {
    await this.ensureDir()

    const stitchedSegments = dedupeTranscriptSegments(segments)
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    const fullText = stitchedSegments.map((s) => s.text.trim()).filter(Boolean).join(' ')
    const wordCount = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0
    const startMs = stitchedSegments[0]?.startMs ?? 0
    const endMs = stitchedSegments.at(-1)?.endMs ?? 0
    const endTime = stitchedSegments.at(-1)?.timestamp ?? new Date().toISOString()

    const meta: HistorySessionMeta = {
      id,
      label: this.generateLabel(stitchedSegments),
      startTime: captureStartTime,
      endTime,
      durationMs: endMs - startMs,
      wordCount,
      segmentCount: stitchedSegments.length,
      preview: fullText.slice(0, 160),
      profile,
    }

    const session: HistorySession = { ...meta, segments: stitchedSegments }
    await fs.writeFile(join(this.dir, `${id}.json`), JSON.stringify(session, null, 2), 'utf8')

    return meta
  }

  async listSessions(): Promise<HistorySessionMeta[]> {
    await this.ensureDir()

    let files: string[]
    try {
      files = await fs.readdir(this.dir)
    } catch {
      return []
    }

    const metas: HistorySessionMeta[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(join(this.dir, file), 'utf8')
        const session = JSON.parse(raw) as HistorySession
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { segments: _segments, ...meta } = session
        metas.push(meta)
      } catch {
        // corrupted file — skip silently
      }
    }

    return metas.sort((a, b) => b.startTime.localeCompare(a.startTime))
  }

  async getSession(id: string): Promise<HistorySession | null> {
    try {
      const raw = await fs.readFile(join(this.dir, `${id}.json`), 'utf8')
      return JSON.parse(raw) as HistorySession
    } catch {
      return null
    }
  }

  async deleteSession(id: string): Promise<void> {
    await fs.unlink(join(this.dir, `${id}.json`))
  }

  async starSession(id: string, starred: boolean): Promise<void> {
    const session = await this.getSession(id)
    if (!session) return
    session.starred = starred
    await fs.writeFile(join(this.dir, `${id}.json`), JSON.stringify(session, null, 2), 'utf8')
  }

  async pruneHistory(settings: Pick<AppSettings, 'historyLimit' | 'autoDeleteRecordings' | 'keepStarredUntilDeleted'>): Promise<void> {
    const sessions = await this.listSessions()
    if (sessions.length === 0) return

    const toDelete = new Set<string>()

    // Time-based pruning
    const autoDelete: HistoryAutoDelete = settings.autoDeleteRecordings
    if (autoDelete !== 'never') {
      const keepLatestMatch = autoDelete.match(/^keep-latest-(\d+)$/)
      const olderThanMatch = autoDelete.match(/^older-than-(\d+)d$/)

      if (keepLatestMatch) {
        const keep = Number.parseInt(keepLatestMatch[1], 10)
        sessions.slice(keep).forEach((s) => toDelete.add(s.id))
      } else if (olderThanMatch) {
        const days = Number.parseInt(olderThanMatch[1], 10)
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
        sessions
          .filter((s) => new Date(s.startTime).getTime() < cutoff)
          .forEach((s) => toDelete.add(s.id))
      }
    }

    // Count-based pruning via historyLimit
    if (settings.historyLimit > 0 && sessions.length > settings.historyLimit) {
      sessions.slice(settings.historyLimit).forEach((s) => toDelete.add(s.id))
    }

    // Preserve starred sessions if the setting is enabled
    if (settings.keepStarredUntilDeleted) {
      for (const id of toDelete) {
        const session = sessions.find((s) => s.id === id)
        if (session?.starred) toDelete.delete(id)
      }
    }

    await Promise.all([...toDelete].map((id) => this.deleteSession(id)))
  }

  generateLabel(segments: TranscriptSegment[]): string {
    const fullText = segments.map((s) => s.text.trim()).filter(Boolean).join(' ')
    if (!fullText) return 'Empty Recording'

    const wordFreq = new Map<string, number>()
    const words = fullText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
      }
    }

    if (wordFreq.size === 0) {
      return fullText.slice(0, 50)
    }

    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1))

    return topWords.join(', ')
  }
}
