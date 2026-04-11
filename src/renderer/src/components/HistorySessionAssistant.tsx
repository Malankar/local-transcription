import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

function Icon({ name, filled = false, size = 20 }: { name: string; filled?: boolean; size?: number }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
        userSelect: 'none',
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {name}
    </span>
  )
}

function makeId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const WELCOME_BODY =
  'Draft prompts against this session, attach the transcript for your own reference, then copy the thread to an external model or notes. Nothing here leaves your machine.'

const SEND_REPLY =
  'There is no cloud model hooked up in this build—by design. Copy your question plus the transcript (or export TXT) and paste into the assistant you trust.'

const QUICK_PROMPTS = [
  'Summarize the key points from this session.',
  'List concrete action items with owners if mentioned.',
  'Draft a concise follow-up email from this transcript.',
] as const

export interface HistorySessionAssistantProps {
  sessionId: string
  sessionLabel: string
  transcriptPlainText: string
  wordCount: number
  segmentCount: number
}

export function HistorySessionAssistant({
  sessionId,
  sessionLabel,
  transcriptPlainText,
  wordCount,
  segmentCount,
}: Readonly<HistorySessionAssistantProps>) {
  const headingId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [transcriptAttached, setTranscriptAttached] = useState(false)

  useEffect(() => {
    setTranscriptAttached(false)
    setDraft('')
    setMessages([])
  }, [sessionId])

  useEffect(() => {
    const root = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (root instanceof HTMLElement) {
      root.scrollTop = root.scrollHeight
    }
  }, [messages])

  const appendAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', content }])
  }, [])

  const appendUser = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: makeId(), role: 'user', content }])
  }, [])

  const attachTranscript = useCallback(() => {
    if (!transcriptPlainText.trim()) {
      appendAssistant('This session has no transcript text to attach yet.')
      return
    }
    setTranscriptAttached(true)
    appendUser(
      `Attached transcript — ${segmentCount} block${segmentCount === 1 ? '' : 's'}, ${wordCount} word${wordCount === 1 ? '' : 's'}. Full text stays in the Transcript column; copy from there when you need the raw source.`,
    )
    appendAssistant(
      'Transcript metadata recorded in this thread. Use the Transcript pane to select and copy the full text, or export TXT / SRT from the header.',
    )
  }, [appendAssistant, appendUser, segmentCount, transcriptPlainText, wordCount])

  const sendDraft = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    appendUser(text)
    appendAssistant(SEND_REPLY)
  }, [appendAssistant, appendUser, draft])

  return (
    <aside
      className={cn(
        'flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0A0A0B]',
        'max-md:w-full max-md:border-l-0 max-md:border-t',
      )}
      aria-labelledby={headingId}
    >
      <div className="shrink-0 border-b border-white/5 px-5 pb-4 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F7931A]">
            On-Device Workspace
          </p>
          <div
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#EA580C] to-[#F7931A] text-white"
            aria-hidden
          >
            <Icon name="smart_toy" filled size={16} />
          </div>
        </div>
        <h2 id={headingId} className="font-heading text-lg font-semibold text-white">
          Session assistant
        </h2>
        <p className="mt-0.5 line-clamp-2 text-xs text-[#64748B]">{sessionLabel}</p>
      </div>

      <div className="shrink-0 border-b border-white/5 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition-colors hover:bg-white/10',
              transcriptAttached && transcriptPlainText.trim().length > 0 && 'opacity-60',
            )}
            onClick={attachTranscript}
            disabled={transcriptAttached && transcriptPlainText.trim().length > 0}
          >
            <Icon name="history" size={14} />
            Note transcript
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition-colors hover:bg-white/10 disabled:opacity-40"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(transcriptPlainText)
                appendAssistant('Full transcript copied to the clipboard.')
              } catch {
                appendAssistant('Could not access the clipboard from this window.')
              }
            }}
            disabled={!transcriptPlainText.trim()}
          >
            <Icon name="content_copy" size={14} />
            Copy text
          </button>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-[#64748B]">
          <span className="text-[#F7931A]">Local only</span> — prompts and replies stay in this panel until you copy them out.
        </p>
      </div>

      <div className="shrink-0 border-b border-white/5 px-5 py-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#94A3B8]">Assistant</p>
        <p className="text-xs leading-relaxed text-[#94A3B8]">{WELCOME_BODY}</p>
      </div>

      <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
        <div className="space-y-2 p-4" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((m, i) => (
            <div
              key={m.id}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
                m.role === 'assistant'
                  ? 'border-white/10 bg-[#0F1115] text-[#CBD5E1]'
                  : 'border-white/10 bg-[#1E293B]/80 text-white/90',
              )}
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[#64748B]">
                {m.role === 'assistant' ? 'Assistant' : 'You'}
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-white/10 px-5 py-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#94A3B8]">Quick Prompts</p>
        <div className="mb-4 space-y-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              title={p}
              onClick={() => setDraft(p)}
              className="w-full truncate rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-[#94A3B8] transition-colors hover:border-[#F7931A]/30 hover:text-white"
            >
              {p.length > 48 ? `${p.slice(0, 46)}…` : p}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`${headingId}-input`}>
          Message
        </label>
        <input
          id={`${headingId}-input`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              sendDraft()
            }
          }}
          placeholder="Ask anything — stays on this device..."
          className="mb-3 w-full rounded-xl border border-white/10 bg-[#0F1115] px-4 py-3 text-sm text-white placeholder:text-[#64748B] transition-colors focus:border-[#F7931A]/50 focus:outline-none"
        />
        <Button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-sm font-semibold text-white shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] transition-all hover:shadow-[0_0_30px_-5px_rgba(247,147,26,0.6)]"
          onClick={sendDraft}
        >
          <Icon name="send" size={16} />
          Send (Local Draft)
        </Button>
      </div>
    </aside>
  )
}
