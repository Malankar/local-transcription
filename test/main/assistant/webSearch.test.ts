import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatWebSearchContext, webSearchNoKey } from '../../../src/main/assistant/tools/webSearch'

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: 'Alpha summary text.',
          AbstractURL: 'https://example.com/a',
          Heading: 'Alpha Topic',
          RelatedTopics: [
            { Text: 'Beta - beta snippet', FirstURL: 'https://example.com/b' },
            { Topics: [{ Text: 'Gamma', FirstURL: 'https://example.com/g' }] },
          ],
        }),
      }),
    )

    const r = await webSearchNoKey('test query', logger as any, { maxResults: 2, timeoutMs: 5000 })
    expect(r.hits.length).toBe(2)
    expect(r.hits[0]?.title).toBeTruthy()
    expect(r.hits[0]?.snippet).toContain('Alpha')
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
