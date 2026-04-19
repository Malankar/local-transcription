import type { AppLogger } from '../../logging/AppLogger'

export interface WebSearchHit {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResult {
  hits: WebSearchHit[]
  /** User-visible notice when search empty/failed */
  notice?: string
}

type DdgTopic = { Text?: string; FirstURL?: string; Topics?: DdgTopic[] }

function flattenTopics(topics: DdgTopic[] | undefined, out: { text: string; url: string }[]): void {
  if (!topics) return
  for (const t of topics) {
    if (t.Topics) {
      flattenTopics(t.Topics, out)
      continue
    }
    const text = typeof t.Text === 'string' ? t.Text.trim() : ''
    const url = typeof t.FirstURL === 'string' ? t.FirstURL.trim() : ''
    if (text || url) out.push({ text, url })
  }
}

function clipSnippet(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * No-key DuckDuckGo instant-answer JSON. Best-effort; empty on block/rate-limit/errors.
 */
export async function webSearchNoKey(
  query: string,
  logger: AppLogger,
  opts?: { timeoutMs?: number; maxResults?: number },
): Promise<WebSearchResult> {
  const q = query.trim()
  if (!q) {
    return { hits: [], notice: 'Empty search query; answering from transcript only.' }
  }

  const timeoutMs = opts?.timeoutMs ?? 8000
  const maxResults = opts?.maxResults ?? 5

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!res.ok) {
      logger.warn('Web search HTTP non-OK', { status: res.status, query: q.slice(0, 80) })
      return { hits: [], notice: 'Web search unavailable; answering from transcript only.' }
    }

    const data = (await res.json()) as {
      AbstractText?: string
      AbstractURL?: string
      Heading?: string
      RelatedTopics?: DdgTopic[]
    }

    const hits: WebSearchHit[] = []

    const abstractText = typeof data.AbstractText === 'string' ? data.AbstractText.trim() : ''
    const abstractUrl = typeof data.AbstractURL === 'string' ? data.AbstractURL.trim() : ''
    const heading = typeof data.Heading === 'string' ? data.Heading.trim() : ''

    if (abstractText || abstractUrl) {
      hits.push({
        title: heading || abstractUrl || 'Summary',
        url: abstractUrl || '',
        snippet: clipSnippet(abstractText || heading, 400),
      })
    }

    const flat: { text: string; url: string }[] = []
    flattenTopics(data.RelatedTopics, flat)

    for (const row of flat) {
      if (hits.length >= maxResults) break
      if (!row.text && !row.url) continue
      const titleFromText = row.text.split(' - ')[0]?.trim() || row.text.slice(0, 80)
      hits.push({
        title: clipSnippet(titleFromText, 120),
        url: row.url,
        snippet: clipSnippet(row.text, 400),
      })
    }

    if (hits.length === 0) {
      return { hits: [], notice: 'No web results returned; answering from transcript only.' }
    }

    return { hits: hits.slice(0, maxResults) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('Web search failed', { message: msg, query: q.slice(0, 80) })
    return { hits: [], notice: 'Web search failed; answering from transcript only.' }
  } finally {
    clearTimeout(timer)
  }
}

export function formatWebSearchContext(result: WebSearchResult): string {
  if (result.hits.length === 0) {
    return result.notice ?? 'No web search results.'
  }
  const lines = result.hits.map((h, i) => {
    const urlLine = h.url ? ` (${h.url})` : ''
    return `${i + 1}. ${h.title}${urlLine}\n   ${h.snippet}`
  })
  return lines.join('\n\n')
}
