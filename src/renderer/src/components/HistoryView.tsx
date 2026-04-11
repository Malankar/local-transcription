import { useMemo } from 'react'

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

  const transcriptPlainText = useMemo(
    () =>
      segments
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join('\n\n'),
    [segments],
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#030304]">
      {selectedSession ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-row">
          {/* Center — transcript (ref/history-view center panel) */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/5 px-8 pb-6 pt-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded bg-[#F7931A] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-black">
                    Meeting
                  </span>
                  <span className="rounded-full border border-white/20 px-3 py-1 font-mono text-[11px] text-[#94A3B8]">
                    {formatDuration(selectedSession.durationMs)}
                  </span>
                  <span className="rounded-full border border-white/20 px-3 py-1 font-mono text-[11px] text-[#94A3B8]">
                    {selectedSession.wordCount} words
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm text-white transition-colors hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={exportSessionTxt}
                    disabled={segments.length === 0}
                  >
                    <Icon name="description" size={16} />
                    TXT
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm text-white transition-colors hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={exportSessionSrt}
                    disabled={segments.length === 0}
                  >
                    <Icon name="subtitles" size={16} />
                    SRT
                  </button>
                </div>
              </div>

              <h1 className="font-heading mt-4 truncate text-2xl font-bold text-white">{selectedSession.label}</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                {formatSessionDate(selectedSession.startTime)} • Saved locally and ready to export
              </p>

              {historyExportStatus?.stage === 'exported' && (
                <div className="mt-4 inline-flex max-w-full items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm">
                  <span className="rounded-full bg-emerald-400 p-1 text-emerald-950">
                    <Icon name="check" size={12} />
                  </span>
                  <span className="truncate text-emerald-200">{historyExportStatus.detail}</span>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="px-8 py-6">
                  {segments.length === 0 ? (
                    <div className="flex min-h-[280px] flex-col items-center justify-center text-center text-[#64748B]">
                      <p>No transcript available</p>
                      <p className="mt-2 max-w-sm text-sm">
                        This session was saved without transcript segments.
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl space-y-6">
                      {segments.map((seg) => (
                        <div key={seg.id} className="flex gap-6">
                          <span className="w-12 shrink-0 pt-0.5 font-mono text-sm text-[#F7931A]">
                            {formatClock(seg.startMs)}
                          </span>
                          <p className="flex-1 text-sm leading-relaxed text-[#CBD5E1]">{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
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
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#F7931A]/30 bg-[#F7931A]/10 text-[#F7931A]">
              <Icon name="article" filled size={32} />
            </div>
            <h2 className="font-heading mb-2 text-xl font-semibold text-white">Select a session</h2>
            <p className="mx-auto max-w-xs text-sm text-[#94A3B8]">
              Pick any saved transcript from the left to review, export, or clean up.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
