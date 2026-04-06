import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatClock,
  formatSize,
  formatDuration,
  formatElapsed,
  getLiveCaptionHint,
  getCaptureProfileAppearance,
  formatSessionDate,
} from '../../../../src/renderer/src/lib/formatters'
import type { TranscriptionModel } from '../../../../src/renderer/src/types'

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<TranscriptionModel> = {}): TranscriptionModel {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    sizeMb: 100,
    languages: 'en',
    accuracy: 3,
    speed: 3,
    recommended: false,
    engine: 'whisper',
    runtime: 'node',
    runtimeModelName: 'test',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    isDownloaded: true,
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────────────

describe('formatClock', () => {
  it('formats zero milliseconds as 00:00', () => {
    expect(formatClock(0)).toBe('00:00')
  })

  it('formats 60 seconds correctly', () => {
    expect(formatClock(60_000)).toBe('01:00')
  })

  it('formats partial minutes correctly', () => {
    expect(formatClock(90_000)).toBe('01:30')
  })

  it('formats large values, e.g. 1 hour', () => {
    expect(formatClock(3_600_000)).toBe('60:00')
  })

  it('pads seconds to two digits', () => {
    expect(formatClock(5_000)).toBe('00:05')
  })

  it('truncates sub-second precision', () => {
    // 1500ms → 1 second displayed
    expect(formatClock(1_500)).toBe('00:01')
  })
})

// ──────────────────────────────────────────────────────────────────────────────

describe('formatSize', () => {
  it('formats values under 1 GB as "N MB"', () => {
    expect(formatSize(500)).toBe('500 MB')
  })

  it('formats exactly 1024 MB as "1.0 GB"', () => {
    expect(formatSize(1024)).toBe('1.0 GB')
  })

  it('formats values over 1 GB with one decimal', () => {
    expect(formatSize(2048)).toBe('2.0 GB')
  })

  it('formats fractional GB correctly', () => {
    expect(formatSize(1536)).toBe('1.5 GB')
  })
})

// ──────────────────────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns "0s" for zero milliseconds', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('formats seconds only below one minute', () => {
    expect(formatDuration(45_000)).toBe('45s')
  })

  it('formats minutes and seconds when under one hour', () => {
    expect(formatDuration(90_000)).toBe('1m 30s')
  })

  it('formats hours and minutes when over one hour', () => {
    // 1h 30m = 5400s
    expect(formatDuration(5_400_000)).toBe('1h 30m')
  })

  it('omits seconds portion when over one hour (only shows h + m)', () => {
    expect(formatDuration(3_661_000)).toBe('1h 1m')
  })

  it('omits seconds when showing minutes', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
  })
})

// ──────────────────────────────────────────────────────────────────────────────

describe('formatElapsed', () => {
  it('formats as MM:SS when under one hour', () => {
    expect(formatElapsed(90_000)).toBe('01:30')
  })

  it('formats as HH:MM:SS when over one hour', () => {
    expect(formatElapsed(3_661_000)).toBe('01:01:01')
  })

  it('formats zero as 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00')
  })

  it('pads all parts to two digits', () => {
    expect(formatElapsed(3_600_000 + 5_000)).toBe('01:00:05')
  })
})

// ──────────────────────────────────────────────────────────────────────────────

describe('getLiveCaptionHint', () => {
  it('returns a generic hint when no model is provided', () => {
    const hint = getLiveCaptionHint(null)
    expect(hint).toContain('3-6 seconds')
  })

  it('returns faster-interval hint for high-speed models (speed >= 4)', () => {
    const hint = getLiveCaptionHint(makeModel({ speed: 4 }))
    expect(hint).toContain('2-4 seconds')
  })

  it('returns medium-interval hint for speed === 3', () => {
    const hint = getLiveCaptionHint(makeModel({ speed: 3 }))
    expect(hint).toContain('3-5 seconds')
  })

  it('returns slower-interval hint for low-speed models (speed < 3)', () => {
    const hint = getLiveCaptionHint(makeModel({ speed: 1 }))
    expect(hint).toContain('4-7 seconds')
  })
})

// ──────────────────────────────────────────────────────────────────────────────

describe('getCaptureProfileAppearance', () => {
  it('returns "live" appearance for the live profile', () => {
    const appearance = getCaptureProfileAppearance('live')
    expect(appearance.label).toBe('Live Transcription')
    expect(appearance.accentDotClass).toContain('sky')
  })

  it('returns "meeting" appearance for the meeting profile', () => {
    const appearance = getCaptureProfileAppearance('meeting')
    expect(appearance.label).toBe('Meeting Recording')
  })

  it('every appearance object has the expected shape', () => {
    for (const profile of ['live', 'meeting'] as const) {
      const a = getCaptureProfileAppearance(profile)
      expect(a).toHaveProperty('label')
      expect(a).toHaveProperty('icon')
      expect(a).toHaveProperty('accentDotClass')
      expect(a).toHaveProperty('iconWrapClass')
      expect(a).toHaveProperty('cardClass')
      expect(a).toHaveProperty('cardSelectedClass')
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────────

describe('formatSessionDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Today, HH:MM" for a timestamp from today', () => {
    vi.useFakeTimers()
    // Pin system clock to 2024-06-15T12:00:00
    vi.setSystemTime(new Date('2024-06-15T12:00:00'))

    const result = formatSessionDate('2024-06-15T08:30:00')
    expect(result).toMatch(/^Today,/)
  })

  it('returns "Yesterday, HH:MM" for a timestamp from yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00'))

    const result = formatSessionDate('2024-06-14T20:00:00')
    expect(result).toMatch(/^Yesterday,/)
  })

  it('returns a formatted date without Today/Yesterday for older timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00'))

    const result = formatSessionDate('2024-06-01T10:00:00')
    expect(result).not.toMatch(/^Today/)
    expect(result).not.toMatch(/^Yesterday/)
    // Should contain a date portion like "Jun 1"
    expect(result).toMatch(/Jun/)
  })
})
