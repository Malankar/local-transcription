import { describe, expect, it } from 'vitest'

import {
  dropNoiseTranscriptSegments,
  isNoiseTranscriptText,
} from '../../src/shared/transcriptSegments'

describe('isNoiseTranscriptText', () => {
  it('flags empty and digit-only', () => {
    expect(isNoiseTranscriptText('')).toBe(true)
    expect(isNoiseTranscriptText('  ')).toBe(true)
    expect(isNoiseTranscriptText('1')).toBe(true)
    expect(isNoiseTranscriptText('42')).toBe(true)
  })

  it('keeps normal words', () => {
    expect(isNoiseTranscriptText('Hi')).toBe(false)
    expect(isNoiseTranscriptText('A')).toBe(false)
    expect(isNoiseTranscriptText('Room 101')).toBe(false)
  })
})

describe('dropNoiseTranscriptSegments', () => {
  it('removes noise segments', () => {
    const out = dropNoiseTranscriptSegments([
      { id: 'a', startMs: 0, endMs: 100, text: 'Hello', timestamp: '' },
      { id: 'b', startMs: 100, endMs: 100, text: '1', timestamp: '' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Hello')
  })
})
