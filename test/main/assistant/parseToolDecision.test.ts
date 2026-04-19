import { describe, expect, it } from 'vitest'

import {
  formatWebSearchDecisionDateContext,
  parseToolDecision,
} from '../../../src/main/assistant/toolOrchestrator'

describe('parseToolDecision', () => {
  it('parses web_search + query', () => {
    expect(parseToolDecision('ACTION: web_search\nQUERY: rust ownership rules')).toEqual({
      action: 'web_search',
      query: 'rust ownership rules',
    })
  })

  it('treats missing query as none', () => {
    expect(parseToolDecision('ACTION: web_search')).toEqual({ action: 'none', query: '' })
  })

  it('parses none', () => {
    expect(parseToolDecision('ACTION: none')).toEqual({ action: 'none', query: '' })
  })

  it('query line mid-body', () => {
    const raw = 'Here\nACTION: web_search\nQUERY: 2026 lunar eclipse'
    expect(parseToolDecision(raw)).toEqual({ action: 'web_search', query: '2026 lunar eclipse' })
  })
})

describe('formatWebSearchDecisionDateContext', () => {
  it('prefixes Today and includes an ISO-style calendar segment', () => {
    const s = formatWebSearchDecisionDateContext(new Date('2026-06-15T12:00:00Z'))
    expect(s.startsWith('Today:')).toBe(true)
    expect(s).toMatch(/Local calendar date: \d{4}-\d{2}-\d{2}\./)
    expect(s).toMatch(/\(.+\)\. Local calendar date:/)
  })
})
