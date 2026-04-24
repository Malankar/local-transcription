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
  /**
   * Enable native Ollama thinking mode (Qwen3, DeepSeek-R1, etc.).
   * Sent as a **top-level** request field — NOT inside `options` — to avoid silent ignoring.
   * When true, Ollama separates reasoning into `message.thinking`; the reply only contains
   * the final answer in `message.content`.
   */
  think?: boolean
  /** Abort the HTTP request if Ollama does not finish within this many ms (avoids infinite "Generating…"). */
  timeoutMs?: number
}

export async function ollamaChat(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  logger: AppLogger,
  options?: OllamaChatOptions,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`
  const {
    timeoutMs,
    think,
    temperature = 0.2,
    num_predict,
    top_p,
    top_k,
    repeat_penalty,
  } = options ?? {}

  const opt: Record<string, number> = { temperature }
  if (num_predict != null) opt.num_predict = num_predict
  if (top_p != null) opt.top_p = top_p
  if (top_k != null) opt.top_k = top_k
  if (repeat_penalty != null) opt.repeat_penalty = repeat_penalty

  // `think` must be top-level — placing it inside `options` is silently ignored by Ollama
  // and causes thinking-capable models to burn their entire token budget on hidden reasoning.
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    options: opt,
  }
  if (think != null) body.think = think

  const ac = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => ac.abort(), timeoutMs)
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
  } catch (e) {
    if (timeoutMs != null && timeoutMs > 0 && ac.signal.aborted) {
      throw new Error(`Ollama chat timed out after ${timeoutMs}ms (model=${model})`)
    }
    throw toOllamaSetupError(e, baseUrl)
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    logger.error('Ollama chat HTTP error', { status: res.status, body: t.slice(0, 500) })
    throw new Error(`Ollama chat failed (${res.status}): ${t.slice(0, 200)}`)
  }

  const data = (await res.json()) as { message?: { content?: string; thinking?: string } }
  const content = data.message?.content?.trim() ?? ''
  const thinking = data.message?.thinking?.trim() ?? ''

  if (!content && !thinking) {
    throw new Error('Ollama returned empty response')
  }

  // When the model returns a separate reasoning trace, format it into the expected
  // "### Reasoning / ### Answer" sections so the UI renders them correctly.
  if (thinking) {
    return `### Reasoning\n\n${thinking}\n\n### Answer\n\n${content}`
  }
  return content
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
    const msg = toOllamaSetupError(e, baseUrl).message
    return { ok: false, models: [], error: msg }
  }
}

export interface OllamaPullStreamOptions {
  signal?: AbortSignal
  onProgress?: (p: { status: string; percent: number | null }) => void
}

export async function ollamaPullModel(
  baseUrl: string,
  model: string,
  logger: AppLogger,
  streamOptions?: OllamaPullStreamOptions,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/pull`
  const signal = streamOptions?.signal
  const onProgress = streamOptions?.onProgress

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) return
    throw toOllamaSetupError(e, baseUrl)
  }

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
  let lastEmitKey = ''

  const emit = (status: string, percent: number | null): void => {
    const key = `${status}\0${percent ?? 'x'}`
    if (key === lastEmitKey) return
    lastEmitKey = key
    onProgress?.({ status, percent })
  }

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (e) {
        if (signal?.aborted) return
        throw e
      }
      const { done, value } = chunk
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const j = JSON.parse(trimmed) as {
            status?: string
            error?: string
            completed?: number
            total?: number
          }
          if (typeof j.error === 'string' && j.error.trim()) {
            throw new Error(j.error.trim())
          }
          let percent: number | null = null
          if (typeof j.total === 'number' && j.total > 0 && typeof j.completed === 'number') {
            percent = Math.min(100, Math.max(0, Math.round((j.completed / j.total) * 100)))
          }
          if (j.status === 'success') {
            emit('Complete', 100)
            logger.info('Ollama pull finished', { model })
            continue
          }
          if (j.status) {
            logger.info('Ollama pull progress', { model, status: j.status, completed: j.completed, total: j.total })
            emit(j.status, percent)
          } else if (percent != null) {
            emit('Downloading', percent)
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            /* ignore partial JSON */
          } else {
            throw e
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!signal?.aborted) {
    emit('Complete', 100)
  }
}

function toOllamaSetupError(error: unknown, baseUrl: string): Error {
  const raw = error instanceof Error ? error.message : String(error)
  const lower = raw.toLowerCase()
  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('networkerror')
  ) {
    return new Error(
      `Cannot reach Ollama at ${baseUrl}. Install Ollama from https://ollama.com/download and start it, then retry.`,
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}
