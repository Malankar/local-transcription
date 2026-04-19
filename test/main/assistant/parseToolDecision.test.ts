import { describe, expect, it } from 'vitest'

import { parseToolDecision } from '../../../src/main/assistant/toolOrchestrator'

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
