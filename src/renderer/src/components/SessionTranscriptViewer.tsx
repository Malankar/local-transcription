import { useState } from 'react'
import { Check, Copy, Download, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { TranscriptSegment } from '../types'
import { formatClock } from '../lib/formatters'

export interface SessionTranscriptViewerProps {
  title: string
  dateLabel: string
  durationLabel: string
  summaryText: string
  segments: TranscriptSegment[]
  transcriptPlain: string
  onExportTxt: () => void
  onExportSrt: () => void
  onDelete: () => void
}

export function SessionTranscriptViewer({
  title,
  dateLabel,
  durationLabel,
  summaryText,
  segments,
  transcriptPlain,
  onExportTxt,
  onExportSrt,
  onDelete,
}: SessionTranscriptViewerProps) {
  const [copied, setCopied] = useState(false)

  function handleCopyTranscript() {
    void navigator.clipboard.writeText(transcriptPlain)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-6 shrink-0">
        <h2 className="mb-2 text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {dateLabel} • {durationLabel}
        </p>
      </div>

      <Card className="mb-6 shrink-0 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Quick summary</h3>
        <p className="text-sm leading-relaxed text-foreground">{summaryText}</p>
      </Card>

      <div className="mb-6 min-h-0 flex-1">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Full transcript</h3>
        <div className="space-y-4">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No segments in this session.</p>
          ) : (
            segments.map((segment) => (
              <div
                key={segment.id}
                className="flex gap-4 border-b border-border pb-4 last:border-b-0"
              >
                <div className="w-16 shrink-0">
                  <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {formatClock(segment.startMs)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Transcript</p>
                  <p className="text-sm leading-relaxed text-foreground">{segment.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={handleCopyTranscript} className="gap-2">
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={onExportTxt} className="gap-2">
          <Download className="h-4 w-4" />
          Export TXT
        </Button>
        <Button variant="outline" size="sm" onClick={onExportSrt} className="gap-2">
          <Download className="h-4 w-4" />
          Export SRT
        </Button>
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
    </div>
  )
}
