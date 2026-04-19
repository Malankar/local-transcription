import {
  ASSISTANT_OLLAMA_MODEL_CHAT,
  OLLAMA_DEFAULT_BASE_URL,
} from '../../shared/assistantModels'
import type { AppLogger } from '../logging/AppLogger'
import { ollamaChat, type OllamaChatMessage, type OllamaChatOptions } from './ollamaClient'
import { formatWebSearchContext, webSearchNoKey } from './tools/webSearch'

const MAX_TOOL_CALLS = 1
const TOOL_DECISION_OPTIONS: OllamaChatOptions = {
  temperature: 0.1,
  num_predict: 120,
  top_p: 0.85,
  repeat_penalty: 1.15,
}

function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n…`
}

export function parseToolDecision(raw: string): { action: 'none' | 'web_search'; query: string } {
  const lines = raw
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const joined = raw.toLowerCase()
  const wantsSearch =
    joined.includes('action: web_search') ||
    joined.includes('action:web_search') ||
    /^action:\s*web_search\b/i.test(lines[0] ?? '')

  if (!wantsSearch) {
    return { action: 'none', query: '' }
  }

  const queryLine = lines.find((l) => /^query:\s*/i.test(l))
  const fromLine = queryLine?.replace(/^query:\s*/i, '').trim() ?? ''
  const fallback = raw.replace(/\r/g, '').match(/query:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const query = (fromLine || fallback).slice(0, 200)
  if (!query) return { action: 'none', query: '' }
  return { action: 'web_search', query }
}

function lastUserContent(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content.trim()
  }
  return ''
}

/** Markdown structure required when thinking mode is on (tests assert on this). */
export const THINKING_MODE_OUTPUT_SPEC = [
  'Output format (markdown headings, exactly):',
  '### Reasoning (brief)',
  '- 2–4 bullets max. Ground in transcript and any web results below.',
  '- No long chain-of-thought; no more than ~80 words in this section.',
  '',
  '### Answer',
  'Main reply here.',
].join('\n')

function thinkingBlock(): string {
  return THINKING_MODE_OUTPUT_SPEC
}

function baseChatSystem(sessionTitle: string, thinkingMode: boolean): string {
  const parts = [
    `You help the user understand an audio transcript. Session title: "${sessionTitle}".`,
    'Prefer the transcript; if web results are provided, use them only when they clearly help and do not contradict the transcript.',
    'If unsure or not found in sources, say you cannot find it. Be concise.',
  ]
  if (thinkingMode) {
    parts.push('', thinkingBlock())
  }
  return parts.join(' ')
}

const TOOL_DECISION_SYSTEM = `You decide if a web search would materially help answer the user's last question with facts outside the meeting transcript (news, definitions, public data, product names not in transcript).
If the question is only about what was said in the meeting, output exactly:
ACTION: none

If a short web query would help, output exactly two lines:
ACTION: web_search
QUERY: <concise English query, max 12 words>

No other text.`

export async function orchestrateAssistantChat(options: {
  sessionTitle: string
  transcript: string
  userMessages: { role: 'user' | 'assistant'; content: string }[]
  thinkingMode: boolean
  webSearchEnabled: boolean
  logger: AppLogger
  baseUrl?: string
  chatOptions?: OllamaChatOptions
}): Promise<string> {
  const {
    sessionTitle,
    transcript,
    userMessages,
    thinkingMode,
    webSearchEnabled,
    logger,
    chatOptions,
  } = options
  const baseUrl = options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL

  const transcriptClip = clip(transcript, 14_000)
  let searchBlock = ''

  if (webSearchEnabled) {
    const lastQ = lastUserContent(userMessages)
    if (lastQ && MAX_TOOL_CALLS > 0) {
      try {
        const decisionRaw = await ollamaChat(
          baseUrl,
          ASSISTANT_OLLAMA_MODEL_CHAT,
          [
            { role: 'system', content: TOOL_DECISION_SYSTEM },
            {
              role: 'user',
              content: `Session: ${sessionTitle}\n\nTranscript excerpt:\n${clip(transcript, 4000)}\n\nUser question:\n${lastQ}`,
            },
          ],
          logger,
          TOOL_DECISION_OPTIONS,
        )
        const decision = parseToolDecision(decisionRaw)
        if (decision.action === 'web_search') {
          const search = await webSearchNoKey(decision.query, logger)
          const formatted = formatWebSearchContext(search)
          searchBlock = `\n\n## Web search\n${formatted}`
          logger.info('Assistant web search used', { query: decision.query.slice(0, 120), hitCount: search.hits.length })
        }
      } catch (e) {
        logger.warn('Assistant tool decision pass failed', { message: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  const ollamaMessages: OllamaChatMessage[] = [
    {
      role: 'system',
      content: `${baseChatSystem(sessionTitle, thinkingMode)}${searchBlock}`,
    },
    { role: 'user', content: `Transcript:\n\n${transcriptClip}` },
    ...userMessages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const defaultChat: OllamaChatOptions = {
    temperature: 0.3,
    num_predict: 2048,
    top_p: 0.9,
    repeat_penalty: 1.1,
  }

  return ollamaChat(baseUrl, ASSISTANT_OLLAMA_MODEL_CHAT, ollamaMessages, logger, {
    ...defaultChat,
    ...chatOptions,
  })
}
