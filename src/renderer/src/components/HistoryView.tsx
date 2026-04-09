import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatClock, formatSessionDate, formatDuration, getCaptureProfileAppearance } from '../lib/formatters'
import { mergeTranscriptSegments } from '../lib/transcriptMerge'
import { useHistoryContext } from '../contexts/HistoryContext'

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

export function HistoryView() {
  const {
    historySessions,
    selectedHistoryId,
    selectedSession,
    historyExportStatus,
    selectSession,
    deleteSession,
    exportSessionTxt,
    exportSessionSrt,
  } = useHistoryContext()

  const segments = selectedSession ? mergeTranscriptSegments(selectedSession.segments) : []
  const selectedProfileLabel = selectedSession?.profile === 'meeting' ? 'Meeting' : 'Live'

  return (
    <div className="flex h-full bg-background">
      <aside className="w-[360px] shrink-0 border-r border-border/70 bg-muted/10">
        <div className="flex h-full flex-col">
          <div className="border-b border-border/70 px-5 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-primary/70">
                  Session Archive
                </p>
                <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground">
                  Recent transcripts
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {historySessions.length} {historySessions.length === 1 ? 'session' : 'sessions'} saved locally
                </p>
              </div>
              <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon name="history" filled size={18} />
              </div>
            </div>
          </div>

          {historySessions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground/50">
              <div className="rounded-2xl border border-dashed border-primary/10 bg-primary/5 p-4 text-primary/75">
                <Icon name="history" size={36} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/80">Nothing here yet</p>
                <p className="text-sm">Complete a recording and it will show up in this archive.</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-3 p-4">
                {historySessions.map((session) => {
                  const profileAppearance = getCaptureProfileAppearance(session.profile)

                  return (
                    <button
                      key={session.id}
                      onClick={() => selectSession(session.id)}
                      className={cn(
                        'group block w-full rounded-2xl border p-4 text-left transition-all',
                        selectedHistoryId === session.id
                          ? profileAppearance.cardSelectedClass
                          : profileAppearance.cardClass,
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                            <span
                              className={cn(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border',
                                profileAppearance.iconWrapClass,
                              )}
                            >
                              <Icon
                                name={profileAppearance.icon}
                                filled={session.profile === 'meeting'}
                                size={14}
                              />
                            </span>
                            <span className="truncate">{profileAppearance.label}</span>
                            {selectedHistoryId === session.id && (
                              <span
                                className={cn(
                                  'h-2 w-2 shrink-0 rounded-full',
                                  profileAppearance.accentDotClass,
                                )}
                              />
                            )}
                          </div>

                          <p className="mt-3 truncate text-sm font-semibold text-foreground">
                            {session.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatSessionDate(session.startTime)}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteSession(session.id)
                          }}
                          className={cn(
                            'rounded-full p-2 text-muted-foreground/60 transition-all',
                            'opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive',
                          )}
                          title="Delete session"
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-muted px-2.5 py-1">{formatDuration(session.durationMs)}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1">{session.wordCount} words</span>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground/70">
                          Click to open transcript
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-background">
        {!selectedSession ? (
          <div className="flex h-full items-center justify-center p-8">
            <Card className="w-full max-w-xl border-border/70 bg-card/88 shadow-xl shadow-black/20 backdrop-blur">
              <CardHeader className="items-center text-center">
                <div className="mb-2 rounded-2xl border border-primary/15 bg-primary/10 p-3 text-primary/90">
                  <Icon name="article" filled size={24} />
                </div>
                <CardTitle>Select a session</CardTitle>
                <CardDescription>
                  Pick any saved transcript from the left to review, export, or clean up.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <div className="flex h-full flex-col p-6">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/70 bg-card/90 shadow-xl shadow-black/20 backdrop-blur">
              <CardHeader className="border-b border-border/70 pb-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em]">
                        {selectedProfileLabel}
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px]">
                        {formatDuration(selectedSession.durationMs)}
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px]">
                        {selectedSession.wordCount} words
                      </Badge>
                    </div>

                    <div className="min-w-0">
                      <CardTitle className="truncate text-2xl">{selectedSession.label}</CardTitle>
                      <CardDescription className="mt-2 text-sm">
                        {formatSessionDate(selectedSession.startTime)} • Saved locally and ready to export
                      </CardDescription>
                    </div>

                    {historyExportStatus?.stage === 'exported' && (
                      <div className="inline-flex max-w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm">
                        <span className="rounded-full bg-emerald-400 p-1 text-emerald-950">
                          <Icon name="check" size={12} />
                        </span>
                        <span className="truncate text-emerald-200">{historyExportStatus.detail}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 rounded-xl px-4"
                      onClick={exportSessionTxt}
                      disabled={segments.length === 0}
                    >
                      <Icon name="description" size={14} />
                      TXT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 rounded-xl px-4"
                      onClick={exportSessionSrt}
                      disabled={segments.length === 0}
                    >
                      <Icon name="subtitles" size={14} />
                      SRT
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="min-h-0 flex-1 p-0">
                <ScrollArea className="h-full">
                  {segments.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground/50">
                      <div className="rounded-2xl border border-dashed border-primary/10 bg-primary/5 p-4 text-primary/70">
                        <Icon name="edit_off" size={36} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground/80">No transcript content</p>
                        <p className="text-sm">This session was saved without transcript segments.</p>
                      </div>
                    </div>
                  ) : (
                    <article className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-6">
                      {segments.map((seg) => (
                        <div
                          key={seg.id}
                          className="grid grid-cols-[56px_1fr] gap-4 rounded-2xl border border-border/60 bg-background/40 px-4 py-3 transition-colors hover:bg-background/70"
                        >
                          <div className="pt-0.5 text-[11px] font-mono text-primary/70">
                            {formatClock(seg.startMs)}
                          </div>
                          <p className="text-sm leading-7 text-foreground/90">{seg.text}</p>
                        </div>
                      ))}
                    </article>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
