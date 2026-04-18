import { useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'

import { useHistoryContext } from '../contexts/HistoryContext'
import { useNavigationContext } from '../contexts/NavigationContext'
import { formatClock, formatSessionDate } from '../lib/formatters'
import { mergeTranscriptSegments } from '../lib/transcriptMerge'
import { TranscriptViewer } from './TranscriptViewer'
import { ChatAssistant } from './ChatAssistant'

export function LibrarySurface() {
  const { mainTab } = useNavigationContext()
  const {
    historySessions,
    selectedHistoryId,
    selectedSession,
    selectSession,
    deleteSession,
    exportSessionTxt,
    exportSessionSrt,
  } = useHistoryContext()

  useEffect(() => {
    if (mainTab !== 'library') return
    if (selectedHistoryId === null && historySessions.length > 0) {
      selectSession(historySessions[0].id)
    }
  }, [mainTab, selectedHistoryId, historySessions, selectSession])

  const segments = selectedSession ? mergeTranscriptSegments(selectedSession.segments) : []

  const transcriptPlain = useMemo(
    () =>
      segments
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join('\n\n'),
    [segments],
  )

  const summaryText = selectedSession?.aiSummary?.trim()
    ? selectedSession.aiSummary
    : selectedSession?.preview?.trim()
      ? selectedSession.preview
      : 'No summary yet.'

  const titlePending = selectedSession?.aiTitleStatus === 'pending'
  const summaryPending = selectedSession?.aiSummaryStatus === 'pending'
  const chatSessionTitle =
    titlePending || !selectedSession?.label?.trim()
      ? 'this recording'
      : selectedSession.label

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30">
        <div className="space-y-2 p-4">
          <h3 className="mb-4 px-1 text-xs font-semibold uppercase text-muted-foreground">
            Transcriptions
          </h3>
          {historySessions.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">No saved sessions yet.</p>
          ) : (
            historySessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => selectSession(session.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedHistoryId === session.id
                    ? 'border-border bg-muted font-medium text-foreground shadow-sm'
                    : 'border-transparent text-foreground hover:bg-muted/80'
                }`}
              >
                {session.aiTitleStatus === 'pending' ? (
                  <div
                    className="flex min-h-[1.25rem] items-center gap-2 text-muted-foreground"
                    role="status"
                    aria-label="Generating recording title"
                  >
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    <span className="truncate text-sm">Generating title…</span>
                  </div>
                ) : (
                  <h3 className="truncate text-sm font-medium">{session.label || 'Untitled'}</h3>
                )}
                <p className="mt-1 text-xs opacity-70">
                  {formatSessionDate(session.startTime)} • {formatClock(session.durationMs)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {selectedSession ? (
        <>
          <TranscriptViewer
            title={selectedSession.label}
            titlePending={titlePending}
            date={formatSessionDate(selectedSession.startTime)}
            duration={formatClock(selectedSession.durationMs)}
            summary={summaryText}
            summaryPending={summaryPending}
            transcript={transcriptPlain}
            segments={segments.map((s) => ({
              timestamp: formatClock(s.startMs),
              speaker: 'Transcript',
              text: s.text.trim(),
            }))}
            onExportTxt={() => void exportSessionTxt()}
            onExportSrt={() => void exportSessionSrt()}
            onDelete={() => void deleteSession(selectedSession.id)}
          />
          <ChatAssistant
            key={selectedSession.id}
            sessionTitle={chatSessionTitle}
            transcript={transcriptPlain}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Select a session to view transcript
        </div>
      )}
    </div>
  )
}
