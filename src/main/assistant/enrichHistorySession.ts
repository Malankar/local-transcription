import type { BrowserWindow } from 'electron'

import {
  ASSISTANT_OLLAMA_MODEL_CHAT,
  ASSISTANT_OLLAMA_MODEL_TITLE,
  OLLAMA_DEFAULT_BASE_URL,
} from '../../shared/assistantModels'
import type { HistorySessionMeta } from '../../shared/types'
import { HistoryManager } from '../history/HistoryManager'
import type { AppLogger } from '../logging/AppLogger'
import { ollamaChat } from './ollamaClient'

function stubAssistantEnabled(): boolean {
  return process.env.E2E_STUB_OLLAMA === '1'
}

function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n…`
}

function sanitizeTitle(raw: string, fallback: string): string {
  let t = raw.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim()
  t = t.split('\n')[0]?.trim() ?? ''
  if (t.length > 120) t = `${t.slice(0, 117)}…`
  return t || fallback
}

export async function enrichHistorySessionAfterSave(options: {
  sessionId: string
  historyManager: HistoryManager
  mainWindow: BrowserWindow | null
  logger: AppLogger
  baseUrl?: string
}): Promise<void> {
  const { sessionId, historyManager, mainWindow, logger } = options
  const baseUrl = options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL

  const session = await historyManager.getSession(sessionId)
  if (!session) return

  const transcriptText = session.segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join('\n\n')

  const fallbackTitle = historyManager.generateLabel(session.segments)
  const fallbackSummary =
    session.preview?.trim() ||
    (transcriptText ? clip(transcriptText, 400) : 'No transcript text for summary.')

  const broadcast = (meta: HistorySessionMeta): void => {
    mainWindow?.webContents.send('history:sessionUpdated', meta)
  }

  if (stubAssistantEnabled()) {
    const delayMs = Number(process.env.E2E_ASSISTANT_DELAY_MS ?? '0')
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
    const label = `E2E ${fallbackTitle}`.slice(0, 80)
    const meta = await historyManager.patchSessionMeta(sessionId, {
      label,
      aiTitleStatus: 'ready',
      aiSummary: fallbackSummary,
      aiSummaryStatus: 'ready',
    })
    if (meta) broadcast(meta)
    return
  }

  let title = fallbackTitle
  let summary = fallbackSummary

  try {
    const titlePrompt = clip(
      transcriptText || 'Empty transcript.',
      6000,
    )
    const titleRaw = await ollamaChat(
      baseUrl,
      ASSISTANT_OLLAMA_MODEL_TITLE,
      [
        {
          role: 'system',
          content:
            'You output ONLY a short meeting title: 3–8 words. No quotes. No punctuation at the end. No explanation.',
        },
        { role: 'user', content: `Transcript:\n\n${titlePrompt}\n\nTitle:` },
      ],
      logger,
      { temperature: 0.1 },
    )
    title = sanitizeTitle(titleRaw, fallbackTitle)
  } catch (e) {
    logger.error('Assistant title generation failed', e)
    title = fallbackTitle
  }

  let titleMeta = await historyManager.patchSessionMeta(sessionId, {
    label: title,
    aiTitleStatus: 'ready',
  })
  if (titleMeta) broadcast(titleMeta)

  try {
    const summaryPrompt = clip(transcriptText || 'Empty transcript.', 12_000)
    const summaryRaw = await ollamaChat(
      baseUrl,
      ASSISTANT_OLLAMA_MODEL_CHAT,
      [
        {
          role: 'system',
          content:
            'You write concise bullet-point summaries of meetings. Use 3–6 bullets. Start each line with "• ". Stay faithful to the transcript.',
        },
        { role: 'user', content: `Summarize:\n\n${summaryPrompt}` },
      ],
      logger,
      { temperature: 0.2 },
    )
    summary = summaryRaw.trim() || fallbackSummary
  } catch (e) {
    logger.error('Assistant summary generation failed', e)
    summary = fallbackSummary
  }

  const doneMeta = await historyManager.patchSessionMeta(sessionId, {
    aiSummary: summary,
    aiSummaryStatus: 'ready',
  })
  if (doneMeta) broadcast(doneMeta)
}

export async function assistantReplyChat(options: {
  sessionTitle: string
  transcript: string
  userMessages: { role: 'user' | 'assistant'; content: string }[]
  logger: AppLogger
  baseUrl?: string
}): Promise<string> {
  const { sessionTitle, transcript, userMessages, logger } = options
  const baseUrl = options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL

  if (stubAssistantEnabled()) {
    const last = userMessages.filter((m) => m.role === 'user').at(-1)?.content?.toLowerCase() ?? ''
    if (last.includes('summary')) {
      return `Based on "${sessionTitle}", here are the key points:\n\n• Product team focused on Q2 roadmap execution\n• Performance optimization is the top priority\n• User feedback integration planned for later phase\n\nWould you like me to expand on any of these points?`
    }
    return `Stub assistant (E2E). Real replies need Ollama running with ${ASSISTANT_OLLAMA_MODEL_CHAT}.`
  }

  const transcriptClip = clip(transcript, 14_000)
  const ollamaMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `You help the user understand an audio transcript. Session title: "${sessionTitle}". Answer only from the transcript; if unsure, say you cannot find it. Be concise.`,
    },
    { role: 'user', content: `Transcript:\n\n${transcriptClip}` },
    ...userMessages.map((m) => ({ role: m.role, content: m.content })),
  ]

  return ollamaChat(baseUrl, ASSISTANT_OLLAMA_MODEL_CHAT, ollamaMessages, logger, { temperature: 0.3 })
}
