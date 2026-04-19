import { useState } from 'react'
import { Check, Copy, Download, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export interface TranscriptViewerSegment {
  timestamp: string
  speaker: string
  text: string
}

export interface TranscriptViewerProps {
  title: string
  titlePending?: boolean
  date: string
  duration: string
  summary: string
  summaryPending?: boolean
  /** True when replacing an existing AI summary (copy + styling for loading state). */
  summaryRegeneration?: boolean
  transcript: string
  segments?: TranscriptViewerSegment[]
  onRegenerateTitle?: () => void
  regenerateTitleDisabled?: boolean
  onRegenerateSummary?: () => void
  regenerateSummaryDisabled?: boolean
  onDelete?: () => void
  onExportTxt?: () => void
  onExportSrt?: () => void
}

export function TranscriptViewer({
  title,
  titlePending = false,
  date,
  duration,
  summary,
  summaryPending = false,
  summaryRegeneration = false,
  transcript,
  segments: segmentsProp,
  onRegenerateTitle,
  regenerateTitleDisabled = false,
  onRegenerateSummary,
  regenerateSummaryDisabled = false,
  onDelete,
  onExportTxt,
  onExportSrt,
}: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false)

  function handleCopyTranscript() {
    void navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const segments = segmentsProp ?? parseTranscript(transcript)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-6">
        {titlePending ? (
          <div
            className="mb-2 flex items-center gap-2 text-muted-foreground"
            role="status"
            aria-label="Generating recording title"
          >
            <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden />
            <span className="text-lg font-medium">Generating title…</span>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-2">
            <h2
              className="truncate text-2xl font-semibold"
              style={{ maxWidth: '28ch' }}
              title={title || 'Untitled'}
            >
              {title || 'Untitled'}
            </h2>
            {onRegenerateTitle ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                disabled={regenerateTitleDisabled}
                onClick={() => onRegenerateTitle()}
                aria-label="Regenerate title"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {date} • {duration}
        </p>
      </div>

      <div className="shrink-0 px-6 pt-6">
        <Card className="border-border bg-muted/35 p-4 shadow-sm">
          <div className="-mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Summary</h3>
            {onRegenerateSummary ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs shadow-none"
                disabled={summaryPending || regenerateSummaryDisabled}
                onClick={() => onRegenerateSummary()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${summaryPending ? 'animate-spin' : ''}`} aria-hidden />
                Regenerate
              </Button>
            ) : null}
          </div>
          {summaryPending ? (
            <div
              className="flex min-h-[3.5rem] items-center gap-2 text-muted-foreground"
              role="status"
              aria-label={summaryRegeneration ? 'Regenerating summary' : 'Generating summary'}
            >
              <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden />
              <span className="text-sm font-medium">
                {summaryRegeneration ? 'Regenerating summary…' : 'Generating summary…'}
              </span>
            </div>
          ) : (
            <SummaryBody text={summary} />
          )}
        </Card>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Full Transcript</h3>
        <div className="space-y-4 pb-2">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No segments in this session.</p>
          ) : (
            segments.map((segment, idx) => (
              <div
                key={`${segment.timestamp}-${idx}`}
                className="flex gap-4 border-b border-border pb-4 last:border-b-0"
              >
                <div className="w-16 shrink-0">
                  <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {segment.timestamp}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{segment.speaker}</p>
                  <p className="text-sm leading-relaxed text-foreground">{segment.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-muted/25 px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyTranscript} className="gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Transcript
                </>
              )}
            </Button>
            {onExportTxt ? (
              <Button variant="outline" size="sm" onClick={onExportTxt} className="gap-2">
                <Download className="h-4 w-4" />
                Export TXT
              </Button>
            ) : null}
            {onExportSrt ? (
              <Button variant="outline" size="sm" onClick={onExportSrt} className="gap-2">
                <Download className="h-4 w-4" />
                Export SRT
              </Button>
            ) : null}
          </div>
          {onDelete ? (
            <div className="flex sm:ml-auto sm:pl-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="gap-2 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SummaryBody({ text }: Readonly<{ text: string }>) {
  const bullets = text
    .split(/•/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (bullets.length <= 1) {
    return <p className="text-sm leading-relaxed text-foreground">{text}</p>
  }

  return (
    <ul className="space-y-1">
      {bullets.map((bullet) => (
        <li key={bullet} className="flex gap-1.5 text-sm leading-relaxed text-foreground">
          <span className="mt-0.5 shrink-0 text-foreground/60">•</span>
          <span>{bullet}</span>
        </li>
      ))}
    </ul>
  )
}

function parseTranscript(transcript: string): TranscriptViewerSegment[] {
  const sentences = transcript.split('. ').filter((s) => s.trim())
  const segments: TranscriptViewerSegment[] = []

  let timeInSeconds = 0
  const speakers = ['Speaker 1', 'Speaker 2', 'Speaker 3']

  sentences.forEach((sentence, idx) => {
    const minutes = Math.floor(timeInSeconds / 60)
    const seconds = timeInSeconds % 60
    const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`

    segments.push({
      timestamp,
      speaker: speakers[idx % speakers.length]!,
      text: sentence.trim() + (idx < sentences.length - 1 ? '.' : ''),
    })

    timeInSeconds += Math.floor(sentence.length / 10) + 3
  })

  return segments
}
