import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatSessionDate, formatDuration, getCaptureProfileAppearance } from '../lib/formatters'
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
  onDelete,
}: Readonly<{
  session: HistorySessionMeta
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}>) {
  const profileAppearance = getCaptureProfileAppearance(session.profile)
  const railMutedClass = session.profile === 'meeting' ? 'bg-primary/22' : 'bg-[#FFD600]/22'
  const railClass = selected ? profileAppearance.accentDotClass : railMutedClass

  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'relative w-full rounded-xl border py-2 pl-2 pr-9 text-left transition-[border-color,box-shadow,background-color] duration-200 outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--sidebar-background))]',
          selected ? profileAppearance.cardSelectedClass : profileAppearance.cardClass,
        )}
      >
        <div className="flex min-w-0 gap-2.5">
          <span
            className={cn('my-0.5 min-h-[2.25rem] w-0.5 shrink-0 self-stretch rounded-full', railClass)}
            aria-hidden
          />
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate text-[11px] font-medium leading-tight tracking-tight text-foreground/95">{session.label}</p>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] leading-tight text-muted-foreground/78">
              <span className="min-w-0 truncate">{formatSessionDate(session.startTime)}</span>
              <span className="shrink-0 select-none text-muted-foreground/28" aria-hidden>
                ·
              </span>
              <span className="shrink-0 font-mono tabular-nums tracking-tight text-muted-foreground/72">
                {formatDuration(session.durationMs)}
              </span>
              <span className="shrink-0 select-none text-muted-foreground/28" aria-hidden>
                ·
              </span>
              <span className="shrink-0 font-mono tabular-nums tracking-tight text-muted-foreground/72">
                {session.wordCount.toLocaleString()} words
              </span>
            </p>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onDelete}
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

type ArchiveTone = 'meeting' | 'live'

const archiveToneChrome: Record<
  ArchiveTone,
  { openGlow: string; chevron: string; summaryHover: string; countChip: string }
> = {
  meeting: {
    openGlow: 'group-open:shadow-[inset_0_0_0_1px_rgba(247,147,26,0.14),0_0_24px_-12px_rgba(247,147,26,0.2)]',
    chevron: 'text-primary/55 group-open:text-primary/80',
    summaryHover: 'hover:bg-primary/[0.04]',
    countChip: 'border-primary/15 bg-primary/[0.07] text-[#FDBA74]/90',
  },
  live: {
    openGlow: 'group-open:shadow-[inset_0_0_0_1px_rgba(255,214,0,0.12),0_0_24px_-12px_rgba(255,214,0,0.18)]',
    chevron: 'text-[#FDE047]/40 group-open:text-[#FDE047]/75',
    summaryHover: 'hover:bg-[#FFD600]/[0.04]',
    countChip: 'border-[#FFD600]/15 bg-[#FFD600]/[0.07] text-[#FDE047]/85',
  },
}

function SidebarArchiveSection({
  title,
  icon,
  count,
  accentClass,
  tone,
  defaultOpen,
  emptyHint,
  children,
}: Readonly<{
  title: string
  icon: string
  count: number
  accentClass: string
  tone: ArchiveTone
  defaultOpen: boolean
  emptyHint: string
  children: ReactNode
}>) {
  const [open, setOpen] = useState(defaultOpen)
  const chrome = archiveToneChrome[tone]

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn(
        'group overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent',
        'transition-shadow duration-300',
        chrome.openGlow,
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2.5 text-left transition-colors',
          'rounded-t-2xl [&::-webkit-details-marker]:hidden',
          chrome.summaryHover,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
              accentClass,
            )}
          >
            <Icon name={icon} size={16} />
          </span>
          <span className="min-w-0">
            <span className="font-heading block truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/88">
              {title}
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground/65">{count === 1 ? '1 saved run' : `${count} saved runs`}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums',
              chrome.countChip,
            )}
          >
            {count}
          </span>
          <span
            className={cn(
              'material-symbols-outlined text-[20px] text-muted-foreground/70 transition-transform duration-200 group-open:rotate-180',
              chrome.chevron,
            )}
          >
            expand_more
          </span>
        </span>
      </summary>
      <div className="border-t border-white/[0.05] bg-black/[0.12] px-2 pb-2 pt-2">
        {count === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] leading-relaxed text-muted-foreground/70">{emptyHint}</p>
        ) : (
          <div className="ml-0.5 border-l border-white/[0.07] pl-2">{children}</div>
        )}
      </div>
    </details>
  )
}

/** Scrollable session library under the History nav item; matches sidebar chrome. */
export function HistorySidebarArchive() {
  const { historySessions, selectedHistoryId, selectSession, deleteSession } = useHistoryContext()

  const meetingSessions = useMemo(
    () => historySessions.filter((s) => s.profile === 'meeting'),
    [historySessions],
  )
  const liveSessions = useMemo(() => historySessions.filter((s) => s.profile === 'live'), [historySessions])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-l-2 border-primary/35 pl-3 pr-1">
        <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">Saved sessions</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/75">
          {historySessions.length === 0
            ? 'Nothing here yet'
            : `${historySessions.length} on this device — pick a run to open`}
        </p>
      </div>

      {historySessions.length === 0 ? (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/20 bg-gradient-to-b from-primary/[0.05] to-transparent px-4 py-8 text-center">
          <span className="rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary/80">
            <Icon name="history" size={24} />
          </span>
          <p className="max-w-[200px] text-[11px] leading-relaxed text-muted-foreground/75">
            Finish a transcription and your saved runs show up under Meetings or Live.
          </p>
        </div>
      ) : (
        <ScrollArea className="mt-3 min-h-0 flex-1 pr-1">
          <div className="space-y-3 pb-2">
            <SidebarArchiveSection
              title="Meetings"
              icon="groups"
              count={meetingSessions.length}
              accentClass="border-primary/25 bg-primary/10 text-[#FDBA74]"
              tone="meeting"
              defaultOpen
              emptyHint="No meeting-style runs saved yet."
            >
              <div className="space-y-1.5">
                {meetingSessions.map((session) => (
                  <SidebarSessionRow
                    key={session.id}
                    session={session}
                    selected={selectedHistoryId === session.id}
                    onSelect={() => selectSession(session.id)}
                    onDelete={() => deleteSession(session.id)}
                  />
                ))}
              </div>
            </SidebarArchiveSection>

            <SidebarArchiveSection
              title="Live"
              icon="instant_mix"
              count={liveSessions.length}
              accentClass="border-[#FFD600]/25 bg-[#FFD600]/10 text-[#FDE047]"
              tone="live"
              defaultOpen={false}
              emptyHint="No live-caption runs saved yet."
            >
              <div className="space-y-1.5">
                {liveSessions.map((session) => (
                  <SidebarSessionRow
                    key={session.id}
                    session={session}
                    selected={selectedHistoryId === session.id}
                    onSelect={() => selectSession(session.id)}
                    onDelete={() => deleteSession(session.id)}
                  />
                ))}
              </div>
            </SidebarArchiveSection>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
