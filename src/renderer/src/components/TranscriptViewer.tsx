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
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
          <div className="mb-2 flex items-start gap-2">
            <h2
              className="min-w-0 flex-1 break-words text-2xl font-semibold leading-tight"
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

      <div className="px-6 pt-6">
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
      </div>{/* end scrollable region */}

      <div className="shrink-0 border-t border-border bg-muted/25 px-6 py-4">
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
          {onDelete ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="gap-2 text-destructive hover:border-destructive/70 hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function splitSummaryContent(text: string): { reasoning?: string; answer: string } {
  const lines = text.split(/\r?\n/)
  const reasoningStart = lines.findIndex((line) => /^#{1,6}\s*Reasoning(?:\s*\([^)]*\))?\s*$/i.test(line.trim()))
  if (reasoningStart === -1) return { answer: text }

  const answerOffset = lines
    .slice(reasoningStart + 1)
    .findIndex((line) => /^#{1,6}\s*Answer\s*$/i.test(line.trim()))

  if (answerOffset === -1) return { answer: text }

  const answerStart = reasoningStart + 1 + answerOffset
  return {
    reasoning: lines.slice(reasoningStart + 1, answerStart).join('\n').trim(),
    answer: lines.slice(answerStart + 1).join('\n').trim(),
  }
}

function SummaryBody({ text }: Readonly<{ text: string }>) {
  const { reasoning, answer } = splitSummaryContent(text)

  return (
    <div className="space-y-2">
      {reasoning && (
        <details className="group rounded border border-border/50 bg-muted/20 px-2.5 py-1.5">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground/70 marker:text-muted-foreground/50">
            Reasoning
          </summary>
          <p className="mt-1.5 border-t border-border/40 pt-1.5 text-xs leading-relaxed text-muted-foreground/60">
            {reasoning}
          </p>
        </details>
      )}
      <SummaryAnswerBody text={answer} />
    </div>
  )
}

function SummaryAnswerBody({ text }: Readonly<{ text: string }>) {
  const legacyBullets = text
    .split(/•/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (!text.includes('\n') && legacyBullets.length > 1) {
    return (
      <ul className="space-y-1">
        {legacyBullets.map((bullet, idx) => (
          <li key={`${idx}-${bullet}`} className="flex gap-1.5 text-sm leading-relaxed text-foreground">
            <span className="mt-0.5 shrink-0 text-foreground/60">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    )
  }

  const blocks = parseSummaryBlocks(text)
  if (blocks.length === 0) {
    return <p className="text-sm leading-relaxed text-foreground">{text}</p>
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, blockIdx) => (
        <section key={`${block.heading ?? 'summary'}-${blockIdx}`} className="space-y-1.5">
          {block.heading ? <h4 className="text-sm font-semibold text-foreground">{block.heading}</h4> : null}
          {block.paragraphs.map((paragraph, idx) => (
            <p key={`${idx}-${paragraph}`} className="text-sm leading-relaxed text-foreground">
              {paragraph}
            </p>
          ))}
          {block.bullets.length > 0 ? (
            <ul className="space-y-1">
              {block.bullets.map((bullet, idx) => (
                <li key={`${idx}-${bullet}`} className="flex gap-1.5 text-sm leading-relaxed text-foreground">
                  <span className="mt-0.5 shrink-0 text-foreground/60">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
}

interface SummaryBlock {
  heading?: string
  paragraphs: string[]
  bullets: string[]
}

const summaryHeadings = new Set(['overview', 'key points', 'decisions', 'action items', 'open questions'])
const summaryHeadingPattern = /^#{1,3}\s+(.+)$/
const summaryBulletPattern = /^[-*•]\s+(.+)$/
const summaryInlineHeadingPattern = /^(overview|key points|decisions|action items|open questions):\s*(.*)$/i

function parseSummaryBlocks(text: string): SummaryBlock[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const hasSummaryMarkup = lines.some((line) => getSummaryHeading(line) || getSummaryBullet(line))
  if (!hasSummaryMarkup) return []

  const blocks: SummaryBlock[] = []
  let current: SummaryBlock | undefined

  for (const line of lines) {
    const headingLine = getSummaryHeadingLine(line)
    if (headingLine) {
      const { heading, rest } = headingLine
      current = { heading, paragraphs: [], bullets: [] }
      blocks.push(current)
      if (rest) current.paragraphs.push(rest)
      continue
    }

    current ??= { paragraphs: [], bullets: [] }
    if (!blocks.includes(current)) blocks.push(current)

    const bullet = getSummaryBullet(line)
    if (bullet) {
      current.bullets.push(bullet)
    } else {
      current.paragraphs.push(line)
    }
  }

  return blocks
}

function getSummaryHeading(line: string): string | null {
  return getSummaryHeadingLine(line)?.heading ?? null
}

function getSummaryHeadingLine(line: string): { heading: string; rest: string } | null {
  const markdownHeading = summaryHeadingPattern.exec(line)
  const rawHeading = markdownHeading?.[1] ?? line
  const inlineHeading = summaryInlineHeadingPattern.exec(rawHeading)
  if (inlineHeading?.[1]) {
    return { heading: toSummaryHeadingLabel(inlineHeading[1]), rest: inlineHeading[2]?.trim() ?? '' }
  }

  const normalized = rawHeading
    .replace(/^\*\*/, '')
    .replace(/\*\*:?$/, '')
    .replace(/:$/, '')
    .trim()

  return summaryHeadings.has(normalized.toLowerCase()) ? { heading: toSummaryHeadingLabel(normalized), rest: '' } : null
}

function toSummaryHeadingLabel(heading: string): string {
  return heading
    .toLowerCase()
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function getSummaryBullet(line: string): string | null {
  const match = summaryBulletPattern.exec(line)
  return match?.[1]?.trim() || null
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
