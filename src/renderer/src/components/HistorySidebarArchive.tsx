import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatSessionDate, formatDuration } from '../lib/formatters'
import type { HistorySessionMeta } from '../types'
import { useHistoryContext } from '../contexts/HistoryContext'

function Icon({ name, filled = false, size = 18 }: Readonly<{ name: string; filled?: boolean; size?: number }>) {
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

function SidebarSessionRow({
  session,
  selected,
  onSelect,
  onRequestDelete,
}: Readonly<{
  session: HistorySessionMeta
  selected: boolean
  onSelect: () => void
  onRequestDelete: () => void
}>) {
  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'relative w-full rounded-lg py-3 pl-3 pr-9 text-left transition-all duration-200 outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#F7931A]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0A0A0B]',
          selected ? 'bg-[#1E293B] border-l-2 border-[#F7931A]' : 'border border-transparent hover:bg-white/5',
        )}
      >
        <h3 className="truncate text-sm font-medium leading-tight text-white">{session.label}</h3>
        <p className="mt-1 text-[11px] text-[#64748B]">
          {formatSessionDate(session.startTime)} · {formatDuration(session.durationMs)} · {session.wordCount.toLocaleString()} words
        </p>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRequestDelete()
        }}
        className={cn(
          'absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 text-muted-foreground/45 transition-all',
          'opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10 hover:text-destructive',
        )}
        title="Delete session"
      >
        <Icon name="delete" size={14} />
      </button>
    </div>
  )
}

/**
 * Saved sessions under the History nav item — flat list aligned with ref/history-view left panel.
 */
export function HistorySidebarArchive() {
  const { historySessions, selectedHistoryId, selectSession, deleteSession } = useHistoryContext()
  const [sessionPendingDelete, setSessionPendingDelete] = useState<HistorySessionMeta | null>(null)

  useEffect(() => {
    if (!sessionPendingDelete) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSessionPendingDelete(null)
    }
    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [sessionPendingDelete])

  async function confirmDelete(): Promise<void> {
    if (!sessionPendingDelete) return
    const id = sessionPendingDelete.id
    setSessionPendingDelete(null)
    await deleteSession(id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/5 px-4 pb-4 pt-6">
        <div className="mb-1 flex items-center gap-2">
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#F7931A]/10 text-[#F7931A]">
            <Icon name="group" size={14} />
          </div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[#F7931A]">Saved meetings</p>
        </div>
        <p className="mt-2 text-[11px] text-[#64748B]">
          {historySessions.length === 0
            ? 'Nothing here yet'
            : `${historySessions.length} sessions on this device`}
        </p>
      </div>

      {historySessions.length === 0 ? (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/20 bg-gradient-to-b from-primary/[0.05] to-transparent px-4 py-8 text-center">
          <span className="rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary/80">
            <Icon name="history" size={24} />
          </span>
          <p className="max-w-[200px] text-[11px] leading-relaxed text-muted-foreground/75">
            Finish a meeting transcription and save the session to see it here.
          </p>
        </div>
      ) : (
        <ScrollArea className="mt-3 min-h-0 flex-1 p-2 pr-1">
          <div className="space-y-1 pb-2">
            {historySessions.map((session) => (
              <SidebarSessionRow
                key={session.id}
                session={session}
                selected={selectedHistoryId === session.id}
                onSelect={() => selectSession(session.id)}
                onRequestDelete={() => setSessionPendingDelete(session)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <dialog
        open={sessionPendingDelete !== null}
        aria-modal
        aria-labelledby="history-delete-title"
        className={cn(
          'pointer-events-none fixed inset-0 z-[200] m-0 flex h-full w-full max-w-none items-center justify-center border-0 bg-transparent p-4',
          'open:flex [&:not([open])]:hidden',
        )}
      >
        {sessionPendingDelete ? (
          <>
            <button
              type="button"
              aria-label="Dismiss"
              className="pointer-events-auto absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity"
              onClick={() => setSessionPendingDelete(null)}
            />
            <div className="pointer-events-auto relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-[#121214] p-5 shadow-xl shadow-black/40">
              <h2 id="history-delete-title" className="text-base font-semibold text-white">
                Delete this session?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                <span className="font-medium text-white/90">{sessionPendingDelete.label}</span> will be removed from this
                device. This cannot be undone.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSessionPendingDelete(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => void confirmDelete()}>
                  Delete session
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </dialog>
    </div>
  )
}
