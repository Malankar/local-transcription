import {
  ASSISTANT_OLLAMA_CHAT_TIMEOUT_MS,
  ASSISTANT_OLLAMA_MODEL_CHAT,
  OLLAMA_DEFAULT_BASE_URL,
} from '../../shared/assistantModels'
import type { AppLogger } from '../logging/AppLogger'
import { ollamaChat, type OllamaChatMessage, type OllamaChatOptions } from './ollamaClient'

function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n…`
}

/** Markdown structure required when thinking mode is on (tests assert on this). */
export const THINKING_MODE_OUTPUT_SPEC = [
  'Thinking mode is ON. Follow output format exactly (heading text verbatim). Skip preamble.',
  '',
  '### Reasoning (brief)',
  '- 2–4 bullets max. Each bullet: one concrete fact (paraphrase or short quote from transcript).',
  '- Forbidden: vague hedges ("might", "could be", "various things") with no anchor; generic filler.',
  '- Cap ~120 words in this section; no chain-of-thought paragraphs.',
  '',
  '### Answer',
  'Direct, specific reply. Match user question; use headings above first.',
].join('\n')

function thinkingBlock(): string {
  return THINKING_MODE_OUTPUT_SPEC
}

function baseChatSystem(sessionTitle: string, thinkingMode: boolean): string {
  const parts: string[] = [
    `You help the user understand an audio transcript. Session title: "${sessionTitle}".`,
    'Prefer the transcript. If unsure or not found in transcript, say you cannot find it.',
  ]
  if (thinkingMode) {
    parts.push(
      'When thinking mode is on you MUST output markdown with exactly two sections: "### Reasoning (brief)" first, then "### Answer". No other top-level structure before those headings.',
    )
    parts.push(thinkingBlock())
  } else {
    parts.push('Be concise.')
  }
  return parts.join('\n\n')
}

export async function orchestrateAssistantChat(options: {
  sessionTitle: string
  transcript: string
  userMessages: { role: 'user' | 'assistant'; content: string }[]
  thinkingMode: boolean
  logger: AppLogger
  baseUrl?: string
  chatOptions?: OllamaChatOptions
}): Promise<string> {
  const { sessionTitle, transcript, userMessages, thinkingMode, logger, chatOptions } = options
  const baseUrl = options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL

  const transcriptClip = clip(transcript, 14_000)

  const ollamaMessages: OllamaChatMessage[] = [
    { role: 'system', content: baseChatSystem(sessionTitle, thinkingMode) },
    { role: 'user', content: `Transcript:\n\n${transcriptClip}` },
    ...userMessages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const defaultChat: OllamaChatOptions = {
    temperature: 0.3,
    num_predict: 2048,
    top_p: 0.9,
    repeat_penalty: 1.1,
    timeoutMs: ASSISTANT_OLLAMA_CHAT_TIMEOUT_MS,
  }

  const thinkingTweaks: Partial<OllamaChatOptions> = thinkingMode
    ? { temperature: 0.2, repeat_penalty: 1.15, top_p: 0.88 }
    : {}

  return ollamaChat(baseUrl, ASSISTANT_OLLAMA_MODEL_CHAT, ollamaMessages, logger, {
    ...defaultChat,
    ...thinkingTweaks,
    ...chatOptions,
  })
}
