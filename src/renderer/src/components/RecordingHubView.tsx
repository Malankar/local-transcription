import { useEffect, useRef, useState } from 'react'

import type { AudioSource, AudioSourceMode } from '../types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatElapsed, getLiveCaptionHint } from '../lib/formatters'
import { useModelsContext } from '../contexts/ModelsContext'
import { useRecordingContext } from '../contexts/RecordingContext'
import { useNavigationContext, type RecordingSubView } from '../contexts/NavigationContext'
import { useTranscriptContext } from '../contexts/TranscriptContext'

// ── Icon ───────────────────────────────────────────────────────────────────

function Icon({ name, filled = false, size = 20 }: { name: string; filled?: boolean; size?: number }) {
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

// ── Waveform ───────────────────────────────────────────────────────────────

const WAVE_HEIGHTS = [8, 14, 20, 12, 28, 36, 30, 44, 48, 40, 36, 46, 52, 44, 56, 48, 40, 32, 44, 28, 14, 20, 36, 52, 44, 28, 36, 42, 52, 44, 32, 20, 12, 8, 14, 10]

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center h-12 gap-0.5 justify-center overflow-hidden">
      {WAVE_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className={cn('waveBar', active && 'waveBar--active')}
          style={{
            height: active ? h : Math.max(4, Math.round(h * 0.3)),
            animationDelay: active ? `${((i * 0.06) % 0.9).toFixed(2)}s` : undefined,
          }}
        />
      ))}
    </div>
  )
}

// ── DeviceSelect ───────────────────────────────────────────────────────────

function DeviceSelect({
  label,
  value,
  onChange,
  sources,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  sources: AudioSource[]
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 bg-card border-input text-sm gap-2">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── ModelAndRefresh ────────────────────────────────────────────────────────

function ModelAndRefresh() {
  const { downloadedModels, selectedModelId, selectModel } = useModelsContext()
  const { isBusy, refreshSources } = useRecordingContext()
  const { navigateTo } = useNavigationContext()

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Model</span>
        {downloadedModels.length > 0 ? (
          <Select value={selectedModelId ?? ''} onValueChange={selectModel} disabled={isBusy}>
            <SelectTrigger className="h-9 bg-card border-input text-sm gap-2">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {downloadedModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <button
            className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors text-sm text-destructive/80"
            onClick={() => navigateTo('models')}
          >
            <Icon name="memory" filled size={14} />
            No models downloaded
          </button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 text-muted-foreground"
        onClick={() => void refreshSources()}
        disabled={isBusy}
        title="Refresh audio sources"
      >
        <Icon name="refresh" size={15} />
      </Button>
    </div>
  )
}

// ── Source Controls (inline, compact) ─────────────────────────────────────

function SourceControls() {
  const {
    mode, setMode,
    systemSources, micSources,
    systemSourceId, setSystemSourceId,
    micSourceId, setMicSourceId,
    errorMessage,
  } = useRecordingContext()
  const { recordingSubView } = useNavigationContext()

  const subView = recordingSubView

  if (subView === 'live') {
    return (
      <div className="px-6 py-4 border-b border-border bg-card/20 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-40">
            <DeviceSelect
              label="Microphone"
              value={micSourceId}
              onChange={setMicSourceId}
              sources={micSources}
              placeholder="Select microphone"
            />
          </div>
          <ModelAndRefresh />
        </div>
        {errorMessage && (
          <Alert variant="destructive" className="py-2">
            <Icon name="error" filled size={13} />
            <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  const sourceModes: { id: AudioSourceMode; icon: string; label: string }[] = [
    { id: 'system', icon: 'computer', label: 'System' },
    { id: 'mic', icon: 'mic', label: 'Mic' },
    { id: 'mixed', icon: 'library_music', label: 'Mixed' },
  ]

  return (
    <div className="px-6 py-4 border-b border-border bg-card/20 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        {/* Mode selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Audio Input</span>
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5 gap-0.5">
            {sourceModes.map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  mode === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon name={icon} size={13} filled={mode === id} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Device dropdowns */}
        {(mode === 'system' || mode === 'mixed') && (
          <div className="flex-1 min-w-40">
            <DeviceSelect
              label="System Source"
              value={systemSourceId}
              onChange={setSystemSourceId}
              sources={systemSources}
              placeholder="Select system source"
            />
          </div>
        )}
        {(mode === 'mic' || mode === 'mixed') && (
          <div className="flex-1 min-w-40">
            <DeviceSelect
              label="Microphone"
              value={micSourceId}
              onChange={setMicSourceId}
              sources={micSources}
              placeholder="Select microphone"
            />
          </div>
        )}

        <ModelAndRefresh />
      </div>

      {errorMessage && (
        <Alert variant="destructive" className="py-2">
          <Icon name="error" filled size={13} />
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ── Recording View ─────────────────────────────────────────────────────────

function RecordingView() {
  const { mergedMeetingSegments } = useTranscriptContext()
  const { isCapturing, captureProfile, isBusy, status, startCapture, stopCapture, mode, systemSourceId, micSourceId } = useRecordingContext()
  const { selectedModel } = useModelsContext()

  const transcriptRef = useRef<HTMLDivElement>(null)

  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  const segments = mergedMeetingSegments
  const isMeetingCapturing = isCapturing && captureProfile === 'meeting'

  const canStart =
    !isBusy &&
    !isCapturing &&
    selectedModel?.isDownloaded === true &&
    ((mode === 'system' && !!systemSourceId) ||
      (mode === 'mic' && !!micSourceId) ||
      (mode === 'mixed' && !!systemSourceId && !!micSourceId))

  useEffect(() => {
    if (isMeetingCapturing) {
      startTimeRef.current = Date.now()
      const id = setInterval(() => {
        setElapsed(Date.now() - (startTimeRef.current ?? Date.now()))
      }, 1000)
      return () => clearInterval(id)
    } else {
      startTimeRef.current = null
    }
    return undefined
  }, [isMeetingCapturing])

  useEffect(() => {
    const viewport = transcriptRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [segments])

  const sessionName = `Session_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`
  const liveCaptionHint = getLiveCaptionHint(selectedModel)

  if (!isMeetingCapturing && segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-muted-foreground/50 px-8">
        <Icon name="graphic_eq" filled size={48} />
        <div className="text-center flex flex-col gap-2">
          <p className="text-base font-medium text-foreground/70">Ready to record a meeting</p>
          <p className="text-sm">{liveCaptionHint}</p>
        </div>
        <Button size="lg" className="gap-2 px-10" onClick={() => void startCapture('meeting')} disabled={!canStart}>
          <Icon name="play_arrow" filled size={18} />
          Start Recording
        </Button>
        {!canStart && (
          <p className="text-xs text-muted-foreground/50">
            {selectedModel?.isDownloaded ? 'Select an audio source above.' : 'Download a model first (Models tab).'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Session Header */}
      <div className="px-8 py-5 border-b border-border flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">{sessionName}</h2>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="memory" size={13} />
              {selectedModel?.name ?? 'Whisper'}
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Icon name="schedule" size={13} />
              {formatElapsed(elapsed)}
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="flex items-center gap-1.5 text-xs text-primary/80">
              <Icon name="subtitles" size={13} />
              {liveCaptionHint}
            </span>
          </div>
        </div>
        <Badge variant={isMeetingCapturing ? 'default' : 'secondary'} className="gap-1.5 mt-0.5">
          {isMeetingCapturing && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
          {status.stage}
        </Badge>
      </div>

      {/* Transcript Area */}
      <ScrollArea className="flex-1 px-8 py-6" ref={transcriptRef}>
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground/40">
            <Icon name="graphic_eq" filled size={44} />
            <p className="text-sm">Listening... live transcript will appear here in a few seconds</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-7">
            {segments.map((seg, i) => {
              const isLive = i === segments.length - 1
              return (
                <p
                  key={seg.id}
                  className={cn(
                    'text-base leading-relaxed font-sans transition-opacity duration-300',
                    isLive ? 'text-foreground' : 'text-foreground/75',
                  )}
                >
                  {seg.text}
                  {isLive && isMeetingCapturing && <span className="cursor" />}
                </p>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* Control Dock */}
      <div className="shrink-0 border-t border-border bg-card/50 px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <WaveformBars active={isMeetingCapturing} />
            <p className="text-[11px] text-muted-foreground">
              {isMeetingCapturing
                ? 'Short audio windows are being transcribed continuously for faster live text.'
                : 'Capture stopped. Final queued windows will finish processing below.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <Icon name="pause" size={15} />
              Pause
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => void stopCapture()}
              disabled={!isMeetingCapturing || isBusy}
            >
              <Icon name="stop_circle" filled size={15} />
              Stop &amp; Process
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/50 px-8 py-2.5 flex items-center gap-3">
        {[
          { icon: 'verified_user', label: 'Private & Offline' },
          { icon: 'cloud_off', label: 'Zero Data Egress' },
          { icon: 'memory', label: 'Neural Engine Active' },
        ].map(({ icon, label }, i) => (
          <>
            {i > 0 && <span key={`sep-${i}`} className="w-1 h-1 rounded-full bg-border" />}
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <Icon name={icon} size={11} />
              {label}
            </span>
          </>
        ))}
      </div>
    </div>
  )
}

// ── Live Transcription View ────────────────────────────────────────────────

function LiveTranscriptionView() {
  const { liveTranscriptText } = useTranscriptContext()
  const { isCapturing, captureProfile, isBusy, status, startCapture, stopCapture, micSourceId } = useRecordingContext()
  const { selectedModel } = useModelsContext()

  const text = liveTranscriptText
  const isLiveCapturing = isCapturing && captureProfile === 'live'

  const canStartLive =
    !isBusy &&
    !isCapturing &&
    selectedModel?.isDownloaded === true &&
    !!micSourceId

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8 min-h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center gap-10 py-10">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/60">
              {isLiveCapturing ? 'Listening now' : 'Ready'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {isLiveCapturing
                ? 'Speech is transcribed with the low-latency live profile.'
                : 'Tap the mic to start instant live transcription.'}
            </p>
            {!isLiveCapturing && !canStartLive && (
              <p className="text-xs text-destructive/70 mt-1">
                {selectedModel?.isDownloaded ? 'Select an audio source above.' : 'Download a model first (Models tab).'}
              </p>
            )}
          </div>

          <div className="flex items-end justify-center gap-2 min-h-24">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={cn('rounded-full bg-foreground transition-all duration-200', isLiveCapturing && 'animate-pulse')}
                style={{
                  width: index === 1 || index === 2 ? 28 : 22,
                  height: isLiveCapturing ? [34, 46, 46, 34][index] : [34, 42, 42, 34][index],
                  animationDelay: `${index * 0.08}s`,
                }}
              />
            ))}
          </div>

          <div className="w-full max-w-md">
            <div className="relative rounded-3xl border border-border bg-card shadow-sm">
              <textarea
                value={text}
                readOnly
                placeholder="Your words will appear here..."
                className={cn(
                  'min-h-[132px] w-full resize-none rounded-3xl bg-transparent px-5 py-4 pr-14',
                  'text-sm leading-6 text-foreground focus:outline-none',
                  'placeholder:text-muted-foreground/50',
                )}
              />
              <button
                className={cn(
                  'absolute right-3 top-3 h-9 w-9 rounded-full border border-border bg-background/90',
                  'flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground',
                  !text.trim() && 'opacity-40 cursor-not-allowed',
                )}
                onClick={() => void handleCopy()}
                disabled={!text.trim()}
                title={copied ? 'Copied' : 'Copy text'}
              >
                <Icon name={copied ? 'check' : 'content_copy'} size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-4">
          <button
            className={cn(
              'h-14 w-14 rounded-full border flex items-center justify-center transition-colors',
              isLiveCapturing
                ? 'border-border bg-card text-foreground'
                : 'border-border bg-card/70 text-foreground hover:bg-card',
            )}
            onClick={isLiveCapturing ? () => void stopCapture() : () => void startCapture('live')}
            disabled={isLiveCapturing ? isBusy : !canStartLive}
            title={isLiveCapturing ? 'Stop live transcription' : 'Start live transcription'}
          >
            <Icon name="mic" filled size={20} />
          </button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={isLiveCapturing ? 'default' : 'secondary'} className="gap-1.5">
              {isLiveCapturing && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {status.stage}
            </Badge>
            <span>{isLiveCapturing ? 'Low delay mode' : 'Tap mic to begin'}</span>
          </div>

          <button
            className={cn(
              'h-14 w-14 rounded-full flex items-center justify-center transition-colors',
              isLiveCapturing
                ? 'bg-[#ff6b61] text-white hover:bg-[#f85c51]'
                : 'bg-muted text-muted-foreground',
            )}
            onClick={() => void stopCapture()}
            disabled={!isLiveCapturing || isBusy}
            title="Stop"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RecordingHubView ───────────────────────────────────────────────────────

export default function RecordingHubView() {
  const { recordingSubView, setRecordingSubView } = useNavigationContext()
  const { isCapturing } = useRecordingContext()

  const subView = recordingSubView

  const pageTitle = subView === 'meetings' ? 'Meeting Recording' : 'Live Transcription'
  const pageEyebrow = subView === 'meetings' ? 'Transcription Workspace' : 'Low-Latency Capture'
  const pageDescription =
    subView === 'meetings'
      ? 'Capture longer sessions locally with saved transcripts, exports, and post-processing.'
      : 'Convert speech into live local text with the fastest response profile.'

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 bg-background px-8 py-6 shrink-0">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-primary/70">
          {pageEyebrow}
        </p>
        <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground">
          {pageTitle}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{pageDescription}</p>
      </div>

      {/* Tab bar */}
      <div className="px-8 py-3 border-b border-border bg-background/90 shrink-0">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {[
            { id: 'meetings' as RecordingSubView, label: 'Meeting Recording' },
            { id: 'live' as RecordingSubView, label: 'Live Transcription' },
          ].map((item) => (
            <button
              key={item.id}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                subView === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setRecordingSubView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline source controls — hidden while capturing */}
      {!isCapturing && <SourceControls />}

      <div className="flex-1 min-h-0">
        {subView === 'meetings' ? <RecordingView /> : <LiveTranscriptionView />}
      </div>
    </div>
  )
}
