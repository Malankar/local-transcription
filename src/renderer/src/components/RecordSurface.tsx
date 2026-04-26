import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Loader2, Mic, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNavigationContext } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'
import { useTranscriptContext } from '../contexts/TranscriptContext'
import { useModelsContext } from '../contexts/ModelsContext'
import { RecordingSourceControls } from './recording/RecordingSourceControls'

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function sourceSummary(mode: 'system' | 'mic' | 'mixed'): string {
  if (mode === 'mic') return 'Microphone'
  if (mode === 'system') return 'System Audio'
  return 'Microphone + System Audio'
}

export default function RecordSurface() {
  const { setMainTab, setSettingsOpen } = useNavigationContext()
  const {
    isCapturing,
    isBusy,
    status,
    startCapture,
    stopCapture,
    mode,
    systemSourceId,
    micSourceId,
  } = useRecordingContext()
  const { mergedMeetingSegments } = useTranscriptContext()
  const { selectedModel } = useModelsContext()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [showCompletionCard, setShowCompletionCard] = useState(false)

  const meetingText = mergedMeetingSegments.map((s) => s.text).join(' ').trim()
  const showTranscriptWorkspace =
    isCapturing || showCompletionCard || mergedMeetingSegments.length > 0

  const canStartMeeting =
    !isBusy &&
    !isCapturing &&
    selectedModel?.isDownloaded === true &&
    ((mode === 'system' && !!systemSourceId) ||
      (mode === 'mic' && !!micSourceId) ||
      (mode === 'mixed' && (!!systemSourceId || !!micSourceId)))

  useEffect(() => {
    if (!isCapturing) {
      setElapsedSec(0)
      return undefined
    }
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [isCapturing])

  useEffect(() => {
    if (isCapturing) {
      setShowCompletionCard(false)
      return
    }
    if (
      ['stopped', 'processing', 'ready', 'error'].includes(status.stage) &&
      meetingText.length > 0
    ) {
      setShowCompletionCard(true)
    }
  }, [isCapturing, status.stage, meetingText])

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLDivElement | null
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [mergedMeetingSegments])

  return (
    <div className="flex h-full min-h-0 bg-background">
        <aside className="flex min-h-0 w-[min(100%,18rem)] min-w-[16.5rem] shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar p-5 text-sidebar-foreground sm:w-72 sm:min-w-[18rem] sm:p-6">
        {isCapturing && (
          <div className="mb-4 shrink-0 rounded-xl border border-destructive/35 bg-destructive/10 p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
              <span className="text-sm font-medium text-destructive">Recording</span>
            </div>
            <div className="font-mono text-2xl tabular-nums tracking-tight text-foreground">
              {formatTime(elapsedSec)}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 overflow-y-auto">
          <RecordingSourceControls />
        </div>

        <div className="mt-4 shrink-0">
          {!isCapturing ? (
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={!canStartMeeting}
              title="Start meeting recording"
              onClick={() => void startCapture('meeting')}
            >
              <Mic className="h-5 w-5" />
              Start Recording
            </Button>
          ) : (
            <Button
              size="lg"
              variant="destructive"
              className="w-full gap-2"
              onClick={() => void stopCapture()}
            >
              <Square className="h-5 w-5" />
              Stop Recording
            </Button>
          )}
        </div>

        {!canStartMeeting && !isCapturing && (
          <p className="mt-3 shrink-0 text-xs text-sidebar-foreground/75">
            {selectedModel?.isDownloaded ? (
              'Select audio sources above.'
            ) : (
              <>
                Download a transcription model in{' '}
                <button
                  type="button"
                  className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                  onClick={() => setSettingsOpen(true)}
                >
                  Settings
                </button>
                .
              </>
            )}
          </p>
        )}

        <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4 text-xs text-sidebar-foreground/80">
          {selectedModel ? (
            <p>
              <span className="font-medium text-sidebar-foreground">Model</span>
              <span className="text-sidebar-foreground/70"> · </span>
              {selectedModel.name}
            </p>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {showTranscriptWorkspace ? (
          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <div className="mb-4 shrink-0">
                <h2 className="mb-1 text-lg font-semibold tracking-tight text-foreground">Live transcript</h2>
                <p className="text-xs text-muted-foreground">Source · {sourceSummary(mode)}</p>
              </div>

              <Card className="mb-4 flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border bg-card p-0 shadow-sm">
                <ScrollArea className="h-full min-h-0 flex-1" ref={scrollRef}>
                  <div className="space-y-2 p-4 text-sm">
                    {!meetingText ? (
                      <p className="text-muted-foreground">Transcript will appear here...</p>
                    ) : (
                      mergedMeetingSegments.map((seg) => (
                        <div key={seg.id} className="flex gap-3">
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            [{formatTime(Math.floor(seg.startMs / 1000))}]
                          </span>
                          <span className="min-w-0 break-words text-foreground">{seg.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>

              {showCompletionCard ? (
                <Card className="shrink-0 border-border bg-muted/40 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {status.stage === 'ready' ? (
                        <Check className="h-5 w-5" aria-hidden />
                      ) : (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 text-sm font-semibold text-foreground">
                        {status.stage === 'ready' ? 'Saved to library' : 'Finalizing transcript…'}
                      </h3>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {status.stage === 'ready'
                          ? 'Transcript ready for review or export.'
                          : 'Processing remaining audio…'}
                      </p>
                      {status.stage === 'ready' && (
                        <Button variant="default" size="sm" className="h-8 gap-2 text-xs" onClick={() => setMainTab('library')}>
                          Open in Library
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
            <Card className="max-w-md border-dashed border-border/80 bg-card/80 p-8 text-center shadow-sm backdrop-blur-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Mic className="h-7 w-7 text-muted-foreground" aria-hidden />
              </div>
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground">Ready when you are</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Pick a source, start recording, transcript streams here in real time.
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
