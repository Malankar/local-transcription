import type { TranscriptSegment } from '../types'

export const TRANSCRIPT_MERGE_GAP_MS = 2_000

export function mergeTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const merged: TranscriptSegment[] = []
  for (const segment of segments) {
    const text = segment.text.trim()
    if (!text) continue
    const previous = merged.at(-1)
    if (!previous || !shouldMergeSegments(previous, segment)) {
      merged.push({ ...segment, text })
      continue
    }
    previous.endMs = Math.max(previous.endMs, segment.endMs)
    previous.timestamp = segment.timestamp
    previous.text = joinTranscriptText(previous.text, text)
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
