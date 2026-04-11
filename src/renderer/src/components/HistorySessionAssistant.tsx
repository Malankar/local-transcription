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
    setMessages([
      {
        id: makeId(),
        role: 'assistant',
        content: WELCOME_BODY,
      },
    ])
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
        'flex h-full w-[min(100%,380px)] shrink-0 flex-col border-l border-white/10',
        'bg-gradient-to-b from-black/35 via-black/20 to-black/30 backdrop-blur-md',
      )}
      aria-labelledby={headingId}
    >
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#F7931A]/80">
              On-device workspace
            </p>
            <h2 id={headingId} className="font-heading text-lg font-semibold leading-snug tracking-tight text-foreground">
              Session assistant
            </h2>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{sessionLabel}</p>
          </div>
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_24px_-10px_rgba(247,147,26,0.55)]"
            aria-hidden
          >
            <Icon name="smart_toy" filled size={20} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg border-primary/20 bg-primary/5 px-2.5 text-[11px] text-foreground hover:bg-primary/10"
            onClick={attachTranscript}
            disabled={transcriptAttached && transcriptPlainText.trim().length > 0}
          >
            <Icon name="attach_file" size={14} />
            {transcriptAttached ? 'Transcript noted' : 'Note transcript'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg border-white/12 bg-white/[0.03] px-2.5 text-[11px] hover:bg-white/[0.06]"
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
          </Button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/85">
          <span className="font-medium text-[#F7931A]/90">Local only</span> — prompts and replies stay in this panel until you copy them out.
        </p>
      </div>

      <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
        <div className="space-y-3 p-4" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((m, i) => (
            <div
              key={m.id}
              className={cn(
                'rounded-2xl border px-3.5 py-3 text-sm leading-relaxed transition-[border-color,box-shadow] duration-300',
                m.role === 'assistant'
                  ? 'border-primary/15 bg-[#141414]/90 text-foreground/90 shadow-[inset_0_1px_0_0_rgba(247,147,26,0.06)]'
                  : 'border-white/10 bg-card/80 text-foreground/95',
              )}
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
                {m.role === 'assistant' ? (
                  <span className="text-[#F7931A]/90">Assistant</span>
                ) : (
                  <span>You</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-6">{m.content}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-white/10 p-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">Quick prompts</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              title={p}
              onClick={() => setDraft(p)}
              className={cn(
                'rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-left text-[10px] text-muted-foreground',
                'transition-colors hover:border-primary/25 hover:bg-primary/5 hover:text-foreground',
              )}
            >
              {p.length > 42 ? `${p.slice(0, 40)}…` : p}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`${headingId}-input`}>
          Message
        </label>
        <textarea
          id={`${headingId}-input`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendDraft()
            }
          }}
          placeholder="Ask anything — stays on this device…"
          rows={3}
          className={cn(
            'mb-2 w-full resize-none rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-foreground',
            'placeholder:text-muted-foreground/50 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
          )}
        />
        <Button
          type="button"
          className="h-9 w-full gap-2 rounded-xl bg-gradient-to-r from-[#F7931A] to-[#E88A10] font-medium text-primary-foreground shadow-[0_0_24px_-8px_rgba(247,147,26,0.55)] hover:from-[#FFA033] hover:to-[#F7931A]"
          onClick={sendDraft}
        >
          <Icon name="send" size={16} />
          Send (local draft)
        </Button>
      </div>
    </aside>
  )
}
