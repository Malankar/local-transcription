import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatClock, formatSessionDate, formatDuration } from '../lib/formatters'
import { mergeTranscriptSegments } from '../lib/transcriptMerge'
import { useHistoryContext } from '../contexts/HistoryContext'

import { HistorySessionAssistant } from './HistorySessionAssistant'

function Icon({ name, filled = false, size = 20 }: Readonly<{ name: string; filled?: boolean; size?: number }>) {
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
    selectedSession,
    historyExportStatus,
    exportSessionTxt,
    exportSessionSrt,
  } = useHistoryContext()

  const segments = selectedSession ? mergeTranscriptSegments(selectedSession.segments) : []
  const selectedProfileLabel = selectedSession?.profile === 'meeting' ? 'Meeting' : 'Live'

  const transcriptPlainText = useMemo(
    () =>
      segments
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join('\n\n'),
    [segments],
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-transparent">
      {selectedSession ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-6 pr-4">
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
                          className={cn(
                            'grid grid-cols-[56px_1fr] gap-4 rounded-2xl border border-border/60 bg-background/40 px-4 py-3',
                            'transition-colors hover:bg-background/70',
                          )}
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

          <HistorySessionAssistant
            sessionId={selectedSession.id}
            sessionLabel={selectedSession.label}
            transcriptPlainText={transcriptPlainText}
            wordCount={selectedSession.wordCount}
            segmentCount={segments.length}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center p-8">
          <Card className="w-full max-w-xl border-border/70 bg-card/88 shadow-xl shadow-black/20 backdrop-blur">
            <CardHeader className="items-center text-center">
              <div className="mb-2 rounded-2xl border border-primary/15 bg-primary/10 p-3 text-primary/90">
                <Icon name="article" filled size={24} />
              </div>
              <CardTitle>Select a session</CardTitle>
              <CardDescription>
                Use the <span className="font-medium text-foreground/90">History</span> section in the sidebar: open{' '}
                <span className="text-foreground/80">Meetings</span> or <span className="text-foreground/80">Live</span>{' '}
                and choose a saved run. Transcript opens here; the assistant stays on the right.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}
    </div>
  )
}
