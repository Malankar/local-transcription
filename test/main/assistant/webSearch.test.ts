import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appendRecencyContextToQuery,
  formatWebSearchContext,
  webSearchNoKey,
} from '../../../src/main/assistant/tools/webSearch'

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

describe('appendRecencyContextToQuery', () => {
  it('appends local month and year when no year in query', () => {
    const out = appendRecencyContextToQuery('react releases', new Date(2026, 3, 20))
    expect(out.startsWith('react releases ')).toBe(true)
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/April/i)
  })

  it('leaves query unchanged when year present', () => {
    expect(appendRecencyContextToQuery('foo 2025 bar')).toBe('foo 2025 bar')
  })
})

describe('webSearchNoKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns notice on empty query', async () => {
    const r = await webSearchNoKey('  ', logger as any)
    expect(r.hits).toEqual([])
    expect(r.notice).toMatch(/empty/i)
  })

  it('normalizes DDG JSON and caps results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: 'Alpha summary text.',
          AbstractURL: 'https://example.com/a',
          Heading: 'Alpha Topic',
          Answer: '<b>42</b> ships',
          Definition: 'Widget noun.',
          DefinitionURL: 'https://example.com/def',
          RelatedTopics: [],
          Results: [{ Result: 'Delta page', FirstURL: 'https://example.com/d' }],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const r = await webSearchNoKey('test query', logger as any, { maxResults: 4, timeoutMs: 5000 })
    const ddgUrl = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(ddgUrl).toContain(encodeURIComponent('test query'))
    expect(r.hits.length).toBe(4)
    expect(r.hits[0]?.title).toBeTruthy()
    expect(r.hits[0]?.snippet).toContain('Alpha')
    expect(r.hits[1]?.title).toBe('Instant answer')
    expect(r.hits[1]?.snippet).toContain('42')
    expect(r.hits[2]?.title).toBe('Definition')
    expect(r.hits[3]?.snippet).toMatch(/Delta|delta/)
    expect(r.notice).toBeUndefined()
  })

  it('fail-open on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const r = await webSearchNoKey('q', logger as any, { timeoutMs: 3000 })
    expect(r.hits).toEqual([])
    expect(r.notice).toMatch(/unavailable/i)
  })
})

describe('formatWebSearchContext', () => {
  it('includes notice when no hits', () => {
    const s = formatWebSearchContext({ hits: [], notice: 'No web' })
    expect(s).toContain('No web')
  })
})
