import { Fragment, useEffect, useRef, useState } from 'react'

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
import { useNavigationContext } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'
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

/** Static three-bar mark — meeting idle hero only (ref screenshot). */
function MeetingIdleBarsIcon() {
  const bars = [
    { id: 'l', h: 14 },
    { id: 'c', h: 22 },
    { id: 'r', h: 14 },
  ] as const
  return (
    <div className="mb-1 flex h-11 items-end justify-center gap-[5px]" aria-hidden>
      {bars.map(({ id, h }) => (
        <div key={id} className="w-1 rounded-[2px] bg-[#64748B]/70" style={{ height: h }} />
      ))}
    </div>
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
      <span className="font-mono text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 min-w-[160px] gap-2 text-sm">
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
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
          Model
        </span>
        {downloadedModels.length > 0 ? (
          <Select value={selectedModelId ?? ''} onValueChange={selectModel} disabled={isBusy}>
            <SelectTrigger className="h-10 gap-2 text-sm">
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
            type="button"
            className="flex h-10 items-center gap-2 rounded-lg border border-red-500/30 bg-black/40 px-3 text-sm text-red-300 transition-colors hover:border-red-500/50 hover:bg-red-950/30"
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
        className="h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-transparent p-0 text-[#94A3B8] hover:border-[#F7931A]/50 hover:bg-transparent hover:text-[#F7931A]"
        onClick={() => void refreshSources()}
        disabled={isBusy}
        title="Refresh audio sources"
      >
        <Icon name="refresh" size={16} />
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
    transcribeMeetingFile,
    isUploadingMeetingFile,
    isBusy,
  } = useRecordingContext()

  const sourceModes: { id: AudioSourceMode; icon: string; label: string }[] = [
    { id: 'system', icon: 'computer', label: 'System' },
    { id: 'mic', icon: 'mic', label: 'Mic' },
    { id: 'mixed', icon: 'library_music', label: 'Mixed' },
  ]

  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-white/10 bg-transparent px-8 pb-6 pt-0">
      <div className="flex flex-wrap items-end gap-6">
        {/* Mode selector */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
            Audio Input
          </span>
          <div className="inline-flex gap-0.5 rounded-xl border border-white/10 bg-[#0F1115] p-1">
            {sourceModes.map(({ id, icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-300',
                  mode === id
                    ? 'bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-white shadow-glow-orange'
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
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5"
          onClick={() => void transcribeMeetingFile()}
          disabled={isBusy || isUploadingMeetingFile}
        >
          <Icon name="upload_file" size={15} />
          {isUploadingMeetingFile ? 'Uploading...' : 'Upload meeting file'}
        </Button>
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
  const {
    isCapturing,
    captureProfile,
    isBusy,
    status,
    startCapture,
    stopCapture,
    transcribeMeetingFile,
    mode,
    systemSourceId,
    micSourceId,
    isUploadingMeetingFile,
  } = useRecordingContext()
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
  const meetingIdleSubline = 'Live captions typically appear every 3-5 seconds.'

  if (!isMeetingCapturing && segments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-8 py-12">
        <MeetingIdleBarsIcon />
        <div className="flex max-w-md flex-col items-center gap-2 text-center">
          <p className="text-base font-medium text-white">Ready to record a meeting</p>
          <p className="text-sm leading-relaxed text-[#94A3B8]">{meetingIdleSubline}</p>
        </div>
        <button
          type="button"
          onClick={() => void startCapture()}
          disabled={!canStart}
          className={cn(
            'flex h-14 items-center gap-3 rounded-full px-10 text-sm font-bold uppercase tracking-[0.14em] text-white transition-all duration-300',
            'bg-gradient-to-r from-[#EA580C] to-[#F7931A] shadow-[0_0_30px_-5px_rgba(247,147,26,0.5)]',
            'hover:scale-[1.02] hover:shadow-[0_0_40px_-5px_rgba(247,147,26,0.65)]',
            'disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100',
          )}
        >
          <Icon name="play_arrow" filled size={20} />
          Start recording
        </button>
        <Button
          variant="outline"
          size="sm"
          className="h-10 px-5"
          onClick={() => void transcribeMeetingFile()}
          disabled={isBusy || isUploadingMeetingFile}
        >
          <Icon name="upload_file" size={15} />
          {isUploadingMeetingFile ? 'Uploading...' : 'Upload meeting file'}
        </Button>
        {!canStart && (
          <p className="max-w-xs text-center text-xs text-[#64748B]">
            {selectedModel?.isDownloaded ? 'Select an audio source above.' : 'Download a model first (Models tab).'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Session Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-8 py-5">
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">{sessionName}</h2>
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
      <div className="shrink-0 border-t border-white/10 bg-black/20 px-8 py-4 backdrop-blur-sm">
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
      <div className="flex shrink-0 items-center gap-3 border-t border-white/5 px-8 py-2.5">
        {[
          { icon: 'verified_user', label: 'Private & Offline' },
          { icon: 'cloud_off', label: 'Zero Data Egress' },
          { icon: 'memory', label: 'Neural Engine Active' },
        ].map(({ icon, label }, i) => (
          <Fragment key={label}>
            {i > 0 && (
              <span className="h-1 w-1 rounded-full bg-white/15" aria-hidden />
            )}
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/55">
              <Icon name={icon} size={11} />
              {label}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ── RecordingHubView ───────────────────────────────────────────────────────

export default function RecordingHubView() {
  const { isCapturing } = useRecordingContext()
  const pageEyebrow = 'Transcription Workspace'
  const pageDescription = 'Capture longer sessions locally with saved transcripts, exports, and post-processing.'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-8 pb-6 pt-8">
        <div className="mb-2 flex items-center gap-2 font-mono text-xs text-[#64748B]">
          <span>LocalTranscribe</span>
          <span aria-hidden className="text-white/20">
            |
          </span>
          <span>Meeting Recording</span>
        </div>
        <p className="mb-2 font-mono text-xs font-medium uppercase tracking-[0.28em] text-[#F7931A]">
          {pageEyebrow}
        </p>
        <h2 className="font-heading mb-2 text-4xl font-bold tracking-tight text-white">
          Meeting Recording
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-[#94A3B8]">{pageDescription}</p>
      </div>

      {!isCapturing && <SourceControls />}

      <div className="min-h-0 flex-1">
        <RecordingView />
      </div>
    </div>
  )
}
