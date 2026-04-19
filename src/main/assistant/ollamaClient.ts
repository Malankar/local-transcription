import type { AppLogger } from '../logging/AppLogger'

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Ollama `/api/chat` generation options (subset). */
export interface OllamaChatOptions {
  temperature?: number
  num_predict?: number
  top_p?: number
  top_k?: number
  repeat_penalty?: number
}

export async function ollamaChat(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  logger: AppLogger,
  options?: OllamaChatOptions,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`
  const opt: Record<string, number> = {
    temperature: options?.temperature ?? 0.2,
  }
  if (options?.num_predict != null) opt.num_predict = options.num_predict
  if (options?.top_p != null) opt.top_p = options.top_p
  if (options?.top_k != null) opt.top_k = options.top_k
  if (options?.repeat_penalty != null) opt.repeat_penalty = options.repeat_penalty

  const body = {
    model,
    messages,
    stream: false,
    options: opt,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    logger.error('Ollama chat HTTP error', { status: res.status, body: t.slice(0, 500) })
    throw new Error(`Ollama chat failed (${res.status}): ${t.slice(0, 200)}`)
  }

  const data = (await res.json()) as { message?: { content?: string } }
  const text = data.message?.content?.trim() ?? ''
  if (!text) {
    throw new Error('Ollama returned empty response')
  }
  return text
}

export async function ollamaListTags(baseUrl: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/tags`
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      return { ok: false, models: [], error: `HTTP ${res.status}` }
    }
    const data = (await res.json()) as { models?: { name?: string }[] }
    const models = (data.models ?? []).map((m) => m.name ?? '').filter(Boolean)
    return { ok: true, models }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, models: [], error: msg }
  }
}

export async function ollamaPullModel(
  baseUrl: string,
  model: string,
  logger: AppLogger,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/pull`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Ollama pull failed (${res.status}): ${t.slice(0, 200)}`)
  }

  if (!res.body) {
    throw new Error('Ollama pull: no response body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const j = JSON.parse(trimmed) as { status?: string; completed?: number; total?: number }
          if (j.status) {
            logger.info('Ollama pull progress', { model, status: j.status, completed: j.completed, total: j.total })
          }
        } catch {
          /* ignore partial JSON */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
