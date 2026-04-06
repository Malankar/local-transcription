import { describe, it, expect } from 'vitest'
import {
  joinTranscriptText,
  endsWithSentenceBoundary,
  startsLikeSentenceContinuation,
  shouldMergeSegments,
  mergeTranscriptSegments,
  TRANSCRIPT_MERGE_GAP_MS,
} from '../../../../src/renderer/src/lib/transcriptMerge'
import type { TranscriptSegment } from '../../../../src/renderer/src/types'

describe('transcriptMerge', () => {
  describe('joinTranscriptText', () => {
    it('joins two words with a space', () => {
      expect(joinTranscriptText('hello', 'world')).toBe('hello world')
    })

    it('does not add space before punctuation', () => {
      expect(joinTranscriptText('hello', '.')).toBe('hello.')
      expect(joinTranscriptText('hello', '?')).toBe('hello?')
      expect(joinTranscriptText('hello', '!')).toBe('hello!')
      expect(joinTranscriptText('hello', ',')).toBe('hello,')
    })

    it('handles empty strings gracefully', () => {
      expect(joinTranscriptText('', 'world')).toBe('world')
      expect(joinTranscriptText('hello', '')).toBe('hello')
      expect(joinTranscriptText('', '')).toBe('')
    })

    it('handles existing spaces correctly', () => {
      expect(joinTranscriptText('hello ', ' world')).toBe('hello world')
    })
  })

  describe('endsWithSentenceBoundary', () => {
    it('detects periods, question marks, and exclamation points', () => {
      expect(endsWithSentenceBoundary('Hello.')).toBe(true)
      expect(endsWithSentenceBoundary('Hello?')).toBe(true)
      expect(endsWithSentenceBoundary('Hello!')).toBe(true)
    })

    it('handles trailing whitespace', () => {
      expect(endsWithSentenceBoundary('Hello.  ')).toBe(true)
    })

    it('returns false for non-boundaries', () => {
      expect(endsWithSentenceBoundary('Hello')).toBe(false)
      expect(endsWithSentenceBoundary('Hello,')).toBe(false)
    })
  })

  describe('startsLikeSentenceContinuation', () => {
    it('detects lowercase starts as continuation', () => {
      expect(startsLikeSentenceContinuation(' and then')).toBe(true)
      expect(startsLikeSentenceContinuation('world')).toBe(true)
    })

    it('detects conjunctions as continuation', () => {
      expect(startsLikeSentenceContinuation('And then')).toBe(true)
      expect(startsLikeSentenceContinuation('But wait')).toBe(true)
    })

    it('returns false for uppercase starts that are not conjunctions', () => {
      expect(startsLikeSentenceContinuation('Hello')).toBe(false)
      expect(startsLikeSentenceContinuation('The quick')).toBe(false)
    })
  })

  describe('shouldMergeSegments', () => {
    const seg1: TranscriptSegment = {
      id: '1',
      startMs: 0,
      endMs: 1000,
      text: 'Hello',
      timestamp: '2023-01-01T00:00:00Z',
    }

    it('merges segments within the time gap', () => {
      const seg2 = { ...seg1, startMs: 1500, endMs: 2500, text: ' world' }
      expect(shouldMergeSegments(seg1, seg2)).toBe(true)
    })

    it('does not merge segments exceeding the time gap', () => {
      const seg2 = {
        ...seg1,
        startMs: 1000 + TRANSCRIPT_MERGE_GAP_MS + 100,
        endMs: 5000,
        text: ' world',
      }
      expect(shouldMergeSegments(seg1, seg2)).toBe(false)
    })

    it('merges across sentence boundary if next segment is a continuation', () => {
      const s1 = { ...seg1, text: 'Hello.' }
      const s2 = { ...seg1, startMs: 1500, text: ' and welcome' }
      expect(shouldMergeSegments(s1, s2)).toBe(true)
    })

    it('does not merge across sentence boundary if next segment is a new sentence', () => {
      const s1 = { ...seg1, text: 'Hello.' }
      const s2 = { ...seg1, startMs: 1500, text: 'Welcome' }
      expect(shouldMergeSegments(s1, s2)).toBe(false)
    })
  })

  describe('mergeTranscriptSegments', () => {
    it('merges multiple segments into one when appropriate', () => {
      const segments: TranscriptSegment[] = [
        { id: '1', startMs: 0, endMs: 1000, text: 'Hello', timestamp: 'T1' },
        { id: '2', startMs: 1500, endMs: 2000, text: ' world', timestamp: 'T2' },
        { id: '3', startMs: 2200, endMs: 3000, text: '!', timestamp: 'T3' },
      ]
      const merged = mergeTranscriptSegments(segments)
      expect(merged).toHaveLength(1)
      expect(merged[0].text).toBe('Hello world!')
      expect(merged[0].startMs).toBe(0)
      expect(merged[0].endMs).toBe(3000)
    })

    it('keeps segments separate if gap is too large', () => {
      const segments: TranscriptSegment[] = [
        { id: '1', startMs: 0, endMs: 1000, text: 'Hello', timestamp: 'T1' },
        {
          id: '2',
          startMs: 1000 + TRANSCRIPT_MERGE_GAP_MS + 100,
          endMs: 5000,
          text: 'Next',
          timestamp: 'T2',
        },
      ]
      const merged = mergeTranscriptSegments(segments)
      expect(merged).toHaveLength(2)
    })

    it('handles empty text segments', () => {
      const segments: TranscriptSegment[] = [
        { id: '1', startMs: 0, endMs: 1000, text: '  ', timestamp: 'T1' },
        { id: '2', startMs: 1500, endMs: 2000, text: 'Actual text', timestamp: 'T2' },
      ]
      const merged = mergeTranscriptSegments(segments)
      expect(merged).toHaveLength(1)
      expect(merged[0].text).toBe('Actual text')
    })
  })
})
