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
    <div className="flex h-full flex-col bg-background">
      {!isCapturing && (
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="mx-auto min-w-0 max-w-2xl">
            <RecordingSourceControls />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-12 text-center">
            {isCapturing ? (
              <div className="inline-flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="font-medium text-red-700">Recording in progress</span>
                <span className="font-mono text-lg text-red-600">{formatTime(elapsedSec)}</span>
              </div>
            ) : null}
          </div>

          <Card className="mb-8 min-h-64 overflow-hidden border-border bg-muted p-0">
            <ScrollArea className="h-64" ref={scrollRef}>
              <div className="p-6 leading-relaxed text-muted-foreground">
                {!meetingText ? (
                  <span>Your transcript will appear here...</span>
                ) : (
                  <div className="space-y-4 text-foreground">
                    {mergedMeetingSegments.map((seg) => (
                      <p key={seg.id} className="text-sm">
                        {seg.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          <div className="mb-12 flex flex-wrap justify-center gap-3">
            {!isCapturing ? (
              <Button
                size="lg"
                variant="outline"
                className="gap-2 border-foreground/25 bg-background px-8 text-foreground hover:bg-muted"
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
                className="gap-2 px-8"
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
              className="gap-2 px-8"
              disabled
              title="Import file is not available in this build"
              onClick={() => undefined}
            >
              <Upload className="h-5 w-5" />
              Import File
            </Button>
          </div>

          {!canStartMeeting && !isCapturing && (
            <p className="mb-6 text-center text-xs text-muted-foreground">
              {selectedModel?.isDownloaded
                ? 'Select audio sources above.'
                : (
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

          {showCompletionCard && (
            <Card className="border-green-200 bg-green-50 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-200">
                  <Check className="h-6 w-6 text-green-700" />
                </div>
                <div className="flex-1">
                  <h3 className="mb-1 font-semibold text-green-900">Recording saved</h3>
                  <p className="mb-4 text-sm text-green-800/90">
                    Your transcript has been saved and is ready for review. Open it in the Library to add a summary or
                    make edits.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-green-300 text-green-700 hover:bg-green-100"
                    onClick={() => setMainTab('library')}
                  >
                    Open in Library
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
