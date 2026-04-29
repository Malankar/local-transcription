import type { TranscriptSegment } from './types'

/** Whisper.cpp sometimes emits numeric-only hallucinations (e.g. a lone "1"). */
export function isNoiseTranscriptText(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^[0-9]+$/.test(t)) return true
  return false
}

export function dropNoiseTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.filter((s) => !isNoiseTranscriptText(s.text))
}

export const TRANSCRIPT_MERGE_GAP_MS = 2_000
const OVERLAP_DEDUPE_WINDOW_MS = 400
const WORD_PATTERN = /[\p{L}\p{N}']+/gu

type ExtractedWord = {
  normalized: string
  end: number
}

export function dedupeTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const deduped: TranscriptSegment[] = []

  for (const segment of segments) {
    const text = segment.text.trim()
    if (!text) continue

    const previous = deduped.at(-1)
    const current: TranscriptSegment = { ...segment, text }

    if (previous) {
      const overlapWordCount = getOverlapWordCount(previous, current)
      if (overlapWordCount > 0) {
        const trimmed = trimLeadingWords(current.text, overlapWordCount)

        if (!containsLettersOrDigits(trimmed)) {
          previous.endMs = Math.max(previous.endMs, current.endMs)
          previous.timestamp = current.timestamp
          continue
        }

        current.text = trimmed
        current.startMs = Math.max(current.startMs, previous.endMs)
        current.endMs = Math.max(current.startMs, current.endMs)
      }
    }

    deduped.push(current)
  }

  return deduped
}

export function mergeTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const merged: TranscriptSegment[] = []

  for (const segment of dedupeTranscriptSegments(segments)) {
    const previous = merged.at(-1)
    if (!previous || !shouldMergeSegments(previous, segment)) {
      merged.push(segment)
      continue
    }

    previous.endMs = Math.max(previous.endMs, segment.endMs)
    previous.timestamp = segment.timestamp
    previous.text = joinTranscriptText(previous.text, segment.text)
  }

  return merged
}


export function shouldMergeSegments(previous: TranscriptSegment, next: TranscriptSegment): boolean {
  const gapMs = Math.max(0, next.startMs - previous.endMs)
  if (gapMs > TRANSCRIPT_MERGE_GAP_MS) return false
  if (endsWithSentenceBoundary(previous.text)) return startsLikeSentenceContinuation(next.text)
  return true
}

export function endsWithSentenceBoundary(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim())
}

export function startsLikeSentenceContinuation(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^[a-z]/.test(trimmed)) return true
  if (
    /^(and|but|or|so|because|then|well|also|still|yet|to|of|for|with|in|on|at)\b/i.test(trimmed)
  )
    return true
  return false
}

export function joinTranscriptText(left: string, right: string): string {
  const trimmedLeft = left.trimEnd()
  const trimmedRight = right.trimStart()
  if (!trimmedLeft) return trimmedRight
  if (!trimmedRight) return trimmedLeft
  if (/^[,.;:!?)/\]%]/.test(trimmedRight)) return `${trimmedLeft}${trimmedRight}`
  if (/[(/$£€#-]$/.test(trimmedLeft)) return `${trimmedLeft}${trimmedRight}`
  return `${trimmedLeft} ${trimmedRight}`
}

function getOverlapWordCount(previous: TranscriptSegment, next: TranscriptSegment): number {
  const overlapGapMs = next.startMs - previous.endMs
  if (overlapGapMs > OVERLAP_DEDUPE_WINDOW_MS) {
    return 0
  }

  const overlapWordCount = findWordOverlap(previous.text, next.text)
  if (overlapWordCount === 0) {
    return 0
  }

  const minimumWordCount = next.startMs < previous.endMs ? 1 : 2
  return overlapWordCount >= minimumWordCount ? overlapWordCount : 0
}

function findWordOverlap(left: string, right: string): number {
  const leftWords = extractWords(left)
  const rightWords = extractWords(right)
  const maxOverlap = Math.min(leftWords.length, rightWords.length)

  for (let count = maxOverlap; count >= 1; count -= 1) {
    let matches = true

    for (let index = 0; index < count; index += 1) {
      const leftWord = leftWords[leftWords.length - count + index]?.normalized
      const rightWord = rightWords[index]?.normalized
      if (!leftWord || !rightWord || leftWord !== rightWord) {
        matches = false
        break
      }
    }

    if (matches) {
      return count
    }
  }

  return 0
}

function extractWords(text: string): ExtractedWord[] {
  const words: ExtractedWord[] = []

  for (const match of text.matchAll(WORD_PATTERN)) {
    if (match.index == null) continue

    words.push({
      normalized: match[0].toLocaleLowerCase(),
      end: match.index + match[0].length,
    })
  }

  return words
}

function trimLeadingWords(text: string, wordCount: number): string {
  if (wordCount <= 0) return text.trim()

  const words = extractWords(text)
  if (wordCount > words.length) {
    return ''
  }

  return text.slice(words[wordCount - 1].end).trimStart()
}

function containsLettersOrDigits(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}
