import { useState } from 'react'
import { Check, Copy, Download, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export interface TranscriptViewerSegment {
  timestamp: string
  speaker: string
  text: string
}

export interface TranscriptViewerProps {
  title: string
  date: string
  duration: string
  summary: string
  transcript: string
  segments?: TranscriptViewerSegment[]
  onDelete?: () => void
  onExportTxt?: () => void
  onExportSrt?: () => void
}

export function TranscriptViewer({
  title,
  date,
  duration,
  summary,
  transcript,
  segments: segmentsProp,
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
        <h2 className="mb-2 text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {date} • {duration}
        </p>
      </div>

      <div className="shrink-0 px-6 pt-6">
        <Card className="border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Quick Summary</h3>
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
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

      <div className="shrink-0 border-t border-border bg-background px-6 py-4">
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
