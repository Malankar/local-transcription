import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Mic, Square, Upload } from 'lucide-react'

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
      (mode === 'mixed' && !!systemSourceId && !!micSourceId))

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
    if ((status.stage === 'stopped' || status.stage === 'error') && meetingText.length > 0) {
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
      <div className="flex min-h-0 w-[min(100%,18rem)] min-w-[16.5rem] shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/30 p-5 sm:w-72 sm:min-w-[18rem] sm:p-6">
        {isCapturing && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-700">Recording</span>
            </div>
            <div className="font-mono text-2xl text-red-600">{formatTime(elapsedSec)}</div>
          </div>
        )}

        <div className="mb-8 min-w-0">
          <RecordingSourceControls />
        </div>

        <div className="mb-8 space-y-3">
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
              disabled={isBusy}
              onClick={() => void stopCapture()}
            >
              <Square className="h-5 w-5" />
              Stop Recording
            </Button>
          )}

          <Button
            variant="outline"
            size="lg"
            className="w-full gap-2"
            disabled
            title="Import file is not available in this build"
            onClick={() => undefined}
          >
            <Upload className="h-5 w-5" />
            Import File
          </Button>
        </div>

        {!canStartMeeting && !isCapturing && (
          <p className="mb-6 text-xs text-muted-foreground">
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

        <div className="mt-auto space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          {selectedModel ? (
            <p>
              <strong className="text-foreground">Model:</strong> {selectedModel.name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {showTranscriptWorkspace ? (
          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <div className="mb-4 shrink-0">
                <h2 className="mb-1 text-lg font-semibold">Recording Transcript</h2>
                <p className="text-xs text-muted-foreground">Source: {sourceSummary(mode)}</p>
              </div>

              <Card className="mb-4 flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border bg-muted/50 p-0">
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
                <Card className="shrink-0 border-green-200 bg-green-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-200">
                      <Check className="h-5 w-5 text-green-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 text-sm font-semibold text-green-900">Recording saved</h3>
                      <p className="mb-3 text-xs text-green-800">Your transcript is ready for review.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 border-green-300 text-xs text-green-700 hover:bg-green-100"
                        onClick={() => setMainTab('library')}
                      >
                        Open in Library
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-3 text-2xl font-semibold">Ready to Record</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Select your audio source and click Start Recording to begin. Your transcript will appear here in
              real-time.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
