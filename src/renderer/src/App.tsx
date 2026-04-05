import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import type {
  AppSettings,
  AppStatus,
  AudioSource,
  AudioSourceMode,
  HistorySession,
  HistorySessionMeta,
  ModelDownloadProgress,
  TranscriptionModel,
  TranscriptSegment,
} from './types'
import { SettingsView } from '@/components/SettingsView'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type View = 'recording' | 'models' | 'history' | 'settings'
type RecordingSubView = 'meetings' | 'live'
type CaptureProfile = 'meeting' | 'live'
type CaptureProfileAppearance = {
  label: string
  icon: string
  accentDotClass: string
  iconWrapClass: string
  cardClass: string
  cardSelectedClass: string
}

const initialStatus: AppStatus = { stage: 'idle', detail: 'Load sources to begin' }
const TRANSCRIPT_MERGE_GAP_MS = 2_000

// ── Utilities ─────────────────────────────────────────────────────────────

function formatClock(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function getLiveCaptionHint(model: TranscriptionModel | null): string {
  if (!model) return 'Live captions typically appear every 3-6 seconds.'
  if (model.speed >= 4) return 'Live captions typically appear every 2-4 seconds.'
  if (model.speed === 3) return 'Live captions typically appear every 3-5 seconds.'
  return 'Live captions typically appear every 4-7 seconds.'
}

function getCaptureProfileAppearance(profile: CaptureProfile): CaptureProfileAppearance {
  if (profile === 'live') {
    return {
      label: 'Live Transcription',
      icon: 'instant_mix',
      accentDotClass: 'bg-sky-400',
      iconWrapClass: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
      cardClass:
        'border-border/70 bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(9,9,11,0.78)_30%,rgba(9,9,11,0.92))] hover:border-sky-500/30',
      cardSelectedClass:
        'border-sky-500/35 bg-[linear-gradient(180deg,rgba(56,189,248,0.14),rgba(9,9,11,0.86)_34%,rgba(9,9,11,0.96))] shadow-lg shadow-sky-950/20',
    }
  }

  return {
    label: 'Meeting Recording',
    icon: 'groups',
    accentDotClass: 'bg-primary',
    iconWrapClass: 'border-primary/20 bg-primary/10 text-primary',
    cardClass:
      'border-border/70 bg-[linear-gradient(180deg,rgba(139,92,246,0.08),rgba(9,9,11,0.78)_30%,rgba(9,9,11,0.92))] hover:border-primary/25',
    cardSelectedClass:
      'border-primary/35 bg-[linear-gradient(180deg,rgba(139,92,246,0.16),rgba(9,9,11,0.86)_34%,rgba(9,9,11,0.96))] shadow-lg shadow-primary/10',
  }
}

// ── Transcript merging ─────────────────────────────────────────────────────

function mergeTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const merged: TranscriptSegment[] = []
  for (const segment of segments) {
    const text = segment.text.trim()
    if (!text) continue
    const previous = merged.at(-1)
    if (!previous || !shouldMergeSegments(previous, segment)) {
      merged.push({ ...segment, text })
      continue
    }
    previous.endMs = Math.max(previous.endMs, segment.endMs)
    previous.timestamp = segment.timestamp
    previous.text = joinTranscriptText(previous.text, text)
  }
  return merged
}

function shouldMergeSegments(previous: TranscriptSegment, next: TranscriptSegment): boolean {
  const gapMs = Math.max(0, next.startMs - previous.endMs)
  if (gapMs > TRANSCRIPT_MERGE_GAP_MS) return false
  if (endsWithSentenceBoundary(previous.text)) return startsLikeSentenceContinuation(next.text)
  return true
}

function endsWithSentenceBoundary(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim())
}

function startsLikeSentenceContinuation(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^[a-z]/.test(trimmed)) return true
  if (
    /^(and|but|or|so|because|then|well|also|still|yet|to|of|for|with|in|on|at)\b/i.test(trimmed)
  )
    return true
  return false
}

function joinTranscriptText(left: string, right: string): string {
  const trimmedLeft = left.trimEnd()
  const trimmedRight = right.trimStart()
  if (!trimmedLeft) return trimmedRight
  if (!trimmedRight) return trimmedLeft
  if (/^[,.;:!?)/\]%]/.test(trimmedRight)) return `${trimmedLeft}${trimmedRight}`
  if (/[(/$£€#-]$/.test(trimmedLeft)) return `${trimmedLeft}${trimmedRight}`
  return `${trimmedLeft} ${trimmedRight}`
}

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

// ── Source Controls (inline, compact) ─────────────────────────────────────

interface SourceControlsProps {
  mode: AudioSourceMode
  setMode: (m: AudioSourceMode) => void
  systemSources: AudioSource[]
  micSources: AudioSource[]
  systemSourceId: string
  setSystemSourceId: (id: string) => void
  micSourceId: string
  setMicSourceId: (id: string) => void
  downloadedModels: TranscriptionModel[]
  selectedModelId: string | null
  onSelectModel: (id: string) => void
  onNavigateToModels: () => void
  onRefresh: () => void
  isBusy: boolean
  errorMessage: string
}

function ModelAndRefresh({
  downloadedModels, selectedModelId, onSelectModel, onNavigateToModels, onRefresh, isBusy,
}: Pick<SourceControlsProps, 'downloadedModels' | 'selectedModelId' | 'onSelectModel' | 'onNavigateToModels' | 'onRefresh' | 'isBusy'>) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Model</span>
        {downloadedModels.length > 0 ? (
          <Select value={selectedModelId ?? ''} onValueChange={onSelectModel} disabled={isBusy}>
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
            onClick={onNavigateToModels}
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
        onClick={onRefresh}
        disabled={isBusy}
        title="Refresh audio sources"
      >
        <Icon name="refresh" size={15} />
      </Button>
    </div>
  )
}

function SourceControls({
  subView, mode, setMode,
  systemSources, micSources,
  systemSourceId, setSystemSourceId,
  micSourceId, setMicSourceId,
  downloadedModels, selectedModelId, onSelectModel,
  onNavigateToModels,
  onRefresh, isBusy, errorMessage,
}: SourceControlsProps & { subView: RecordingSubView }) {
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
          <ModelAndRefresh
            downloadedModels={downloadedModels}
            selectedModelId={selectedModelId}
            onSelectModel={onSelectModel}
            onNavigateToModels={onNavigateToModels}
            onRefresh={onRefresh}
            isBusy={isBusy}
          />
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

        <ModelAndRefresh
          downloadedModels={downloadedModels}
          selectedModelId={selectedModelId}
          onSelectModel={onSelectModel}
          onNavigateToModels={onNavigateToModels}
          onRefresh={onRefresh}
          isBusy={isBusy}
        />
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

interface RecordingViewProps {
  segments: TranscriptSegment[]
  isCapturing: boolean
  isBusy: boolean
  status: AppStatus
  transcriptRef: RefObject<HTMLDivElement>
  onStop: () => void
  onStart: () => void
  canStart: boolean
  selectedModel: TranscriptionModel | null
}

function RecordingView({
  segments,
  isCapturing,
  isBusy,
  status,
  transcriptRef,
  onStop,
  onStart,
  canStart,
  selectedModel,
}: RecordingViewProps) {
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (isCapturing) {
      startTimeRef.current = Date.now()
      const id = setInterval(() => {
        setElapsed(Date.now() - (startTimeRef.current ?? Date.now()))
      }, 1000)
      return () => clearInterval(id)
    } else {
      startTimeRef.current = null
    }
    return undefined
  }, [isCapturing])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [segments, transcriptRef])

  const sessionName = `Session_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`
  const liveCaptionHint = getLiveCaptionHint(selectedModel)

  if (!isCapturing && segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-muted-foreground/50 px-8">
        <Icon name="graphic_eq" filled size={48} />
        <div className="text-center flex flex-col gap-2">
          <p className="text-base font-medium text-foreground/70">Ready to record a meeting</p>
          <p className="text-sm">{liveCaptionHint}</p>
        </div>
        <Button size="lg" className="gap-2 px-10" onClick={onStart} disabled={!canStart}>
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
        <Badge variant={isCapturing ? 'default' : 'secondary'} className="gap-1.5 mt-0.5">
          {isCapturing && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
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
                  {isLive && isCapturing && <span className="cursor" />}
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
            <WaveformBars active={isCapturing} />
            <p className="text-[11px] text-muted-foreground">
              {isCapturing
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
              onClick={onStop}
              disabled={!isCapturing || isBusy}
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

interface LiveTranscriptionViewProps {
  text: string
  isCapturing: boolean
  isBusy: boolean
  status: AppStatus
  selectedModel: TranscriptionModel | null
  canStart: boolean
  onStart: () => void
  onStop: () => void
}

function LiveTranscriptionView({
  text,
  isCapturing,
  isBusy,
  status,
  selectedModel,
  canStart,
  onStart,
  onStop,
}: LiveTranscriptionViewProps) {
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
              {isCapturing ? 'Listening now' : 'Ready'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {isCapturing
                ? 'Speech is transcribed with the low-latency live profile.'
                : 'Tap the mic to start instant live transcription.'}
            </p>
            {!isCapturing && !canStart && (
              <p className="text-xs text-destructive/70 mt-1">
                {selectedModel?.isDownloaded ? 'Select an audio source above.' : 'Download a model first (Models tab).'}
              </p>
            )}
          </div>

          <div className="flex items-end justify-center gap-2 min-h-24">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={cn('rounded-full bg-foreground transition-all duration-200', isCapturing && 'animate-pulse')}
                style={{
                  width: index === 1 || index === 2 ? 28 : 22,
                  height: isCapturing ? [34, 46, 46, 34][index] : [34, 42, 42, 34][index],
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
              isCapturing
                ? 'border-border bg-card text-foreground'
                : 'border-border bg-card/70 text-foreground hover:bg-card',
            )}
            onClick={isCapturing ? onStop : onStart}
            disabled={isCapturing ? isBusy : !canStart}
            title={isCapturing ? 'Stop live transcription' : 'Start live transcription'}
          >
            <Icon name="mic" filled size={20} />
          </button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={isCapturing ? 'default' : 'secondary'} className="gap-1.5">
              {isCapturing && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {status.stage}
            </Badge>
            <span>{isCapturing ? 'Low delay mode' : 'Tap mic to begin'}</span>
          </div>

          <button
            className={cn(
              'h-14 w-14 rounded-full flex items-center justify-center transition-colors',
              isCapturing
                ? 'bg-[#ff6b61] text-white hover:bg-[#f85c51]'
                : 'bg-muted text-muted-foreground',
            )}
            onClick={onStop}
            disabled={!isCapturing || isBusy}
            title="Stop"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}

interface RecordingHubViewProps {
  subView: RecordingSubView
  onChangeSubView: (view: RecordingSubView) => void
  meetingProps: RecordingViewProps
  liveProps: LiveTranscriptionViewProps
  sourceControlProps: SourceControlsProps
  isCapturing: boolean
}

function RecordingHubView({
  subView,
  onChangeSubView,
  meetingProps,
  liveProps,
  sourceControlProps,
  isCapturing,
}: RecordingHubViewProps) {
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
              onClick={() => onChangeSubView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline source controls — hidden while capturing */}
      {!isCapturing && <SourceControls {...sourceControlProps} subView={subView} />}

      <div className="flex-1 min-h-0">
        {subView === 'meetings' ? <RecordingView {...meetingProps} /> : <LiveTranscriptionView {...liveProps} />}
      </div>
    </div>
  )
}

// ── Models View ────────────────────────────────────────────────────────────

interface ModelsViewProps {
  models: TranscriptionModel[]
  selectedModelId: string | null
  downloadingId: string | null
  downloadProgress: ModelDownloadProgress | null
  downloadError: string
  isCapturing: boolean
  onSelectModel: (id: string) => void
  onDownload: (modelId: string) => void
  onCancelDownload: () => void
}

function ModelsView({
  models,
  selectedModelId,
  downloadingId,
  downloadProgress,
  downloadError,
  isCapturing,
  onSelectModel,
  onDownload,
  onCancelDownload,
}: ModelsViewProps) {
  return (
    <div className="px-8 py-6 max-w-5xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground mb-1.5">
          Model Library
        </h2>
        <p className="text-sm text-muted-foreground">Select and manage local transcription engines.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {models.map((model) => {
          const isSelected = model.id === selectedModelId
          const isDownloading = model.id === downloadingId

          return (
            <div
              key={model.id}
              onClick={() => !isCapturing && !downloadingId && onSelectModel(model.id)}
              role="button"
              className={cn(
                'relative rounded-xl border p-4 flex flex-col gap-2.5 transition-all duration-150',
                isSelected
                  ? 'border-primary/40 bg-primary/10 shadow-sm shadow-primary/5'
                  : 'border-border bg-card hover:border-border/80',
                (isCapturing || !!downloadingId) ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-muted-foreground/60">{model.id}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {model.recommended && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/15 border border-primary/25 rounded-full px-2 py-0.5">
                      Recommended
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatSize(model.sizeMb)}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">{model.name}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{model.description}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground/60">Accuracy</span>
                  <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                    {'★'.repeat(model.accuracy)}{'☆'.repeat(5 - model.accuracy)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', isSelected ? 'bg-primary' : 'bg-muted-foreground/20')}
                    style={{ width: `${(model.accuracy / 5) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                <span className="text-[11px] text-muted-foreground/60">
                  Speed {'★'.repeat(model.speed)}{'☆'.repeat(5 - model.speed)}
                </span>
                {model.isDownloaded ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <Icon name="check_circle" filled size={11} />
                    Ready
                  </span>
                ) : isDownloading ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={(e) => { e.stopPropagation(); onCancelDownload() }}
                  >
                    Cancel
                  </Button>
                ) : model.downloadManaged ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={(e) => { e.stopPropagation(); onDownload(model.id) }}
                    disabled={!!downloadingId || isCapturing}
                  >
                    <Icon name="download" size={11} />
                    Download
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">Auto</span>
                )}
              </div>

              {isDownloading && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50">
                  <Progress value={downloadProgress?.percent ?? 0} className="h-1" />
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {downloadProgress
                      ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                      : 'Starting download…'}
                  </span>
                </div>
              )}

              {model.setupHint && (
                <p className="text-[11px] text-muted-foreground/60 italic border-t border-border/50 pt-2">
                  {model.setupHint}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {downloadError && (
        <Alert variant="destructive">
          <Icon name="error" filled size={15} />
          <AlertDescription>{downloadError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ── History View ───────────────────────────────────────────────────────────

function formatSessionDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (date >= todayStart) return `Today, ${time}`
  if (date >= yesterdayStart) return `Yesterday, ${time}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1_000)
  const h = Math.floor(totalSec / 3_600)
  const m = Math.floor((totalSec % 3_600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

interface HistoryViewProps {
  sessions: HistorySessionMeta[]
  selectedSessionId: string | null
  selectedSession: HistorySession | null
  exportStatus: AppStatus | null
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onExportTxt: () => void
  onExportSrt: () => void
}

function HistoryView({
  sessions,
  selectedSessionId,
  selectedSession,
  exportStatus,
  onSelectSession,
  onDeleteSession,
  onExportTxt,
  onExportSrt,
}: HistoryViewProps) {
  const segments = selectedSession ? mergeTranscriptSegments(selectedSession.segments) : []
  const selectedProfileLabel = selectedSession?.profile === 'meeting' ? 'Meeting' : 'Live'

  return (
    <div className="flex h-full bg-background">
      <aside className="w-[360px] shrink-0 border-r border-border/70 bg-muted/20">
        <div className="flex h-full flex-col">
          <div className="border-b border-border/70 px-5 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-primary/70">
                  Session Archive
                </p>
                <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground">
                  Recent transcripts
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} saved locally
                </p>
              </div>
              <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon name="history" filled size={18} />
              </div>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground/50">
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4">
                <Icon name="history" size={36} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/80">Nothing here yet</p>
                <p className="text-sm">Complete a recording and it will show up in this archive.</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-3 p-4">
                {sessions.map((session) => {
                  const profileAppearance = getCaptureProfileAppearance(session.profile)

                  return (
                    <button
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className={cn(
                        'group block w-full rounded-2xl border p-4 text-left transition-all',
                        selectedSessionId === session.id
                          ? profileAppearance.cardSelectedClass
                          : profileAppearance.cardClass,
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                            <span
                              className={cn(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border',
                                profileAppearance.iconWrapClass,
                              )}
                            >
                              <Icon
                                name={profileAppearance.icon}
                                filled={session.profile === 'meeting'}
                                size={14}
                              />
                            </span>
                            <span className="truncate">{profileAppearance.label}</span>
                            {selectedSessionId === session.id && (
                              <span
                                className={cn(
                                  'h-2 w-2 shrink-0 rounded-full',
                                  profileAppearance.accentDotClass,
                                )}
                              />
                            )}
                          </div>

                          <p className="mt-3 truncate text-sm font-semibold text-foreground">
                            {session.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatSessionDate(session.startTime)}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSession(session.id)
                          }}
                          className={cn(
                            'rounded-full p-2 text-muted-foreground/60 transition-all',
                            'opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive',
                          )}
                          title="Delete session"
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-muted px-2.5 py-1">{formatDuration(session.durationMs)}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1">{session.wordCount} words</span>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground/70">
                          Click to open transcript
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_22%)]">
        {!selectedSession ? (
          <div className="flex h-full items-center justify-center p-8">
            <Card className="w-full max-w-xl border-border/70 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur">
              <CardHeader className="items-center text-center">
                <div className="mb-2 rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                  <Icon name="article" filled size={24} />
                </div>
                <CardTitle>Select a session</CardTitle>
                <CardDescription>
                  Pick any saved transcript from the left to review, export, or clean up.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : (
          <div className="flex h-full flex-col p-6">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/70 bg-card/85 shadow-2xl shadow-black/20 backdrop-blur">
              <CardHeader className="border-b border-border/70 pb-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em]">
                        {selectedProfileLabel}
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px]">
                        {formatDuration(selectedSession.durationMs)}
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px]">
                        {selectedSession.wordCount} words
                      </Badge>
                    </div>

                    <div className="min-w-0">
                      <CardTitle className="truncate text-2xl">{selectedSession.label}</CardTitle>
                      <CardDescription className="mt-2 text-sm">
                        {formatSessionDate(selectedSession.startTime)} • Saved locally and ready to export
                      </CardDescription>
                    </div>

                    {exportStatus?.stage === 'exported' && (
                      <div className="inline-flex max-w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm">
                        <span className="rounded-full bg-emerald-400 p-1 text-emerald-950">
                          <Icon name="check" size={12} />
                        </span>
                        <span className="truncate text-emerald-200">{exportStatus.detail}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 rounded-xl px-4"
                      onClick={onExportTxt}
                      disabled={segments.length === 0}
                    >
                      <Icon name="description" size={14} />
                      TXT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 rounded-xl px-4"
                      onClick={onExportSrt}
                      disabled={segments.length === 0}
                    >
                      <Icon name="subtitles" size={14} />
                      SRT
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="min-h-0 flex-1 p-0">
                <ScrollArea className="h-full">
                  {segments.length === 0 ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground/50">
                      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4">
                        <Icon name="edit_off" size={36} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground/80">No transcript content</p>
                        <p className="text-sm">This session was saved without transcript segments.</p>
                      </div>
                    </div>
                  ) : (
                    <article className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-6">
                      {segments.map((seg) => (
                        <div
                          key={seg.id}
                          className="grid grid-cols-[56px_1fr] gap-4 rounded-2xl border border-border/60 bg-background/40 px-4 py-3 transition-colors hover:bg-background/70"
                        >
                          <div className="pt-0.5 text-[11px] font-mono text-primary/70">
                            {formatClock(seg.startMs)}
                          </div>
                          <p className="text-sm leading-7 text-foreground/90">{seg.text}</p>
                        </div>
                      ))}
                    </article>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────

export function App() {
  const [sources, setSources] = useState<AudioSource[]>([])
  const [mode, setMode] = useState<AudioSourceMode>('mixed')
  const [systemSourceId, setSystemSourceId] = useState('')
  const [micSourceId, setMicSourceId] = useState('')
  const [meetingSegments, setMeetingSegments] = useState<TranscriptSegment[]>([])
  const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>([])
  const [status, setStatus] = useState<AppStatus>(initialStatus)
  const [errorMessage, setErrorMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)

  const [models, setModels] = useState<TranscriptionModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState('')

  const [activeView, setActiveView] = useState<View>('recording')
  const [recordingSubView, setRecordingSubView] = useState<RecordingSubView>('meetings')
  const [captureProfile, setCaptureProfile] = useState<CaptureProfile>('meeting')
  const transcriptRef = useRef<HTMLDivElement>(null)
  const captureProfileRef = useRef<CaptureProfile>('meeting')

  const [historySessions, setHistorySessions] = useState<HistorySessionMeta[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<HistorySession | null>(null)
  const [historyExportStatus, setHistoryExportStatus] = useState<AppStatus | null>(null)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const systemSources = useMemo(() => sources.filter((s) => s.isMonitor), [sources])
  const micSources = useMemo(() => sources.filter((s) => !s.isMonitor), [sources])
  const downloadedModels = useMemo(() => models.filter((m) => m.isDownloaded), [models])
  const mergedMeetingSegments = useMemo(() => mergeTranscriptSegments(meetingSegments), [meetingSegments])
  const mergedLiveSegments = useMemo(() => mergeTranscriptSegments(liveSegments), [liveSegments])
  const liveTranscriptText = useMemo(
    () => mergedLiveSegments.map((segment) => segment.text).join(' ').trim(),
    [mergedLiveSegments],
  )

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null
  const modelReady = selectedModel?.isDownloaded === true

  useEffect(() => {
    captureProfileRef.current = captureProfile
  }, [captureProfile])

  useEffect(() => {
    const unsubscribeSegment = window.api.onTranscriptSegment((segment) => {
      if (captureProfileRef.current === 'live') {
        setLiveSegments((current) => [...current, segment])
        return
      }
      setMeetingSegments((current) => [...current, segment])
    })
    const unsubscribeStatus = window.api.onStatus((nextStatus) => {
      setStatus(nextStatus)
      setIsBusy(nextStatus.stage === 'discovering' || nextStatus.stage === 'initializing-model')
      if (nextStatus.stage === 'capturing') setIsCapturing(true)
      if (
        nextStatus.stage === 'stopped' ||
        nextStatus.stage === 'ready' ||
        nextStatus.stage === 'error'
      ) {
        setIsCapturing(false)
      }
    })
    const unsubscribeError = window.api.onError((message) => {
      setErrorMessage(message)
      setIsBusy(false)
      setIsCapturing(false)
    })
    const unsubscribeProgress = window.api.onModelDownloadProgress((progress) => {
      setDownloadProgress(progress)
    })

    const unsubscribeHistorySaved = window.api.onHistorySaved((meta) => {
      setHistorySessions((prev) => [meta, ...prev.filter((s) => s.id !== meta.id)])
      setSelectedHistoryId(meta.id)
      if (meta.profile === 'meeting') {
        setMeetingSegments([])
      }
    })

    void loadModels()
    void refreshSources()
    void window.api.listHistory().then(setHistorySessions)
    void window.api.getSettings().then(setSettings)

    return () => {
      unsubscribeSegment()
      unsubscribeStatus()
      unsubscribeError()
      unsubscribeProgress()
      unsubscribeHistorySaved()
    }
  }, [])

  useEffect(() => {
    if (!selectedHistoryId) {
      setSelectedSession(null)
      return
    }
    void window.api.getHistorySession(selectedHistoryId).then(setSelectedSession)
  }, [selectedHistoryId])

  useEffect(() => {
    if (isCapturing) {
      setActiveView('recording')
    } else if (
      !isCapturing &&
      (status.stage === 'stopped' || status.stage === 'error') &&
      meetingSegments.length > 0 &&
      captureProfile === 'meeting'
    ) {
      setActiveView('history')
    }
  }, [captureProfile, isCapturing, meetingSegments.length, status.stage])

  async function loadModels(): Promise<void> {
    const list = await window.api.getModels()
    const current = await window.api.getSelectedModel()
    setModels(list)
    setSelectedModelId(current ?? list.find((m) => m.recommended)?.id ?? list[0]?.id ?? null)
  }

  async function refreshSources(): Promise<void> {
    setErrorMessage('')
    setIsBusy(true)
    try {
      const discovered = await window.api.getSources()
      setSources(discovered)
      setSystemSourceId((c) => c || discovered.find((s) => s.isMonitor)?.id || '')
      setMicSourceId((c) => c || discovered.find((s) => !s.isMonitor)?.id || '')
    } catch (error) {
      setErrorMessage(toMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSelectModel(modelId: string): Promise<void> {
    setSelectedModelId(modelId)
    await window.api.selectModel(modelId)
  }

  async function handleDownload(modelId: string): Promise<void> {
    setDownloadError('')
    setDownloadingId(modelId)
    setDownloadProgress(null)
    setSelectedModelId(modelId)
    try {
      await window.api.selectModel(modelId)
      await window.api.downloadModel(modelId)
      const list = await window.api.getModels()
      setModels(list)
    } catch (error) {
      setDownloadError(toMessage(error))
    } finally {
      setDownloadingId(null)
      setDownloadProgress(null)
    }
  }

  async function handleCancelDownload(): Promise<void> {
    if (!downloadingId) return
    await window.api.cancelDownload(downloadingId)
    setDownloadingId(null)
    setDownloadProgress(null)
  }

  async function startCapture(profile: CaptureProfile = 'meeting'): Promise<void> {
    setErrorMessage('')
    setCaptureProfile(profile)
    setRecordingSubView(profile === 'live' ? 'live' : 'meetings')
    setActiveView('recording')
    if (profile === 'live') {
      setLiveSegments([])
    } else {
      setMeetingSegments([])
    }
    setIsBusy(true)
    try {
      const effectiveMode = profile === 'live' ? 'mic' : mode
      await window.api.startCapture({ mode: effectiveMode, systemSourceId, micSourceId, profile })
    } catch (error) {
      setErrorMessage(toMessage(error))
      setIsCapturing(false)
    } finally {
      setIsBusy(false)
    }
  }

  async function stopCapture(): Promise<void> {
    setIsBusy(true)
    try {
      await window.api.stopCapture()
    } catch (error) {
      setErrorMessage(toMessage(error))
    } finally {
      setIsBusy(false)
      setIsCapturing(false)
    }
  }

  async function exportHistoryTxt(): Promise<void> {
    if (!selectedHistoryId) return
    try {
      const result = await window.api.exportHistoryTxt(selectedHistoryId)
      if (!result.canceled && result.path) {
        setHistoryExportStatus({ stage: 'exported', detail: result.path })
      }
    } catch (error) {
      setErrorMessage(toMessage(error))
    }
  }

  async function exportHistorySrt(): Promise<void> {
    if (!selectedHistoryId) return
    try {
      const result = await window.api.exportHistorySrt(selectedHistoryId)
      if (!result.canceled && result.path) {
        setHistoryExportStatus({ stage: 'exported', detail: result.path })
      }
    } catch (error) {
      setErrorMessage(toMessage(error))
    }
  }

  async function deleteHistorySession(id: string): Promise<void> {
    try {
      await window.api.deleteHistorySession(id)
      setHistorySessions((prev) => prev.filter((s) => s.id !== id))
      if (selectedHistoryId === id) {
        setSelectedHistoryId(null)
        setSelectedSession(null)
      }
    } catch (error) {
      setErrorMessage(toMessage(error))
    }
  }

  function handleNewTranscription() {
    setMeetingSegments([])
    setLiveSegments([])
    setErrorMessage('')
    setStatus(initialStatus)
    setActiveView('recording')
  }

  async function handleUpdateSettings(partial: Partial<AppSettings>): Promise<void> {
    setSettingsSaving(true)
    try {
      const updated = await window.api.setSettings(partial)
      setSettings(updated)
    } finally {
      setSettingsSaving(false)
    }
  }

  const canStart =
    !isBusy &&
    !isCapturing &&
    modelReady &&
    ((mode === 'system' && !!systemSourceId) ||
      (mode === 'mic' && !!micSourceId) ||
      (mode === 'mixed' && !!systemSourceId && !!micSourceId))

  const canStartLive = !isBusy && !isCapturing && modelReady && !!micSourceId

  const navItems = [
    { id: 'recording' as View, label: 'Transcribe', icon: 'mic' },
    { id: 'models' as View, label: 'Models', icon: 'memory' },
    { id: 'history' as View, label: 'History', icon: 'history' },
    { id: 'settings' as View, label: 'Settings', icon: 'settings' },
  ]

  const topBarSectionLabel: Record<View, string> = {
    recording: recordingSubView === 'live' ? 'Live Transcription' : 'Meeting Recording',
    models: 'Model Library',
    history: 'Session History',
    settings: 'Settings',
  }

  const sourceControlProps: SourceControlsProps = {
    mode, setMode,
    systemSources, micSources,
    systemSourceId, setSystemSourceId,
    micSourceId, setMicSourceId,
    downloadedModels,
    selectedModelId,
    onSelectModel: (id) => void handleSelectModel(id),
    onNavigateToModels: () => setActiveView('models'),
    onRefresh: () => void refreshSources(),
    isBusy,
    errorMessage,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-[220px] min-w-[220px] bg-sidebar border-r border-sidebar-border flex flex-col justify-between h-screen z-40">
        <div className="flex flex-col gap-5 p-4 pt-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0 shadow-lg shadow-primary/30">
              <Icon name="graphic_eq" filled size={15} />
            </div>
            <div>
              <h1 className="text-[13px] font-semibold tracking-tight leading-none text-foreground">
                LocalTranscribe
              </h1>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mt-0.5">
                V0.1 Alpha
              </p>
            </div>
          </div>

          {/* New Transcription */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 justify-center text-xs"
            onClick={handleNewTranscription}
          >
            <Icon name="add" size={13} />
            New Transcription
          </Button>

          {/* Nav */}
          <nav className="flex flex-col gap-0.5">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all text-left relative',
                  activeView === id
                    ? 'bg-sidebar-accent text-foreground'
                    : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/50',
                )}
              >
                <span className={cn(activeView === id && 'text-primary')}>
                  <Icon name={icon} filled={activeView === id} size={16} />
                </span>
                {label}
                {id === 'recording' && isCapturing && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
            <Icon name="verified_user" filled size={11} />
            <span>Local Only</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
            <Icon name="cloud_off" size={11} />
            <span>No Cloud</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Top Bar */}
        <header className="h-11 bg-background border-b border-border flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold tracking-tight">LocalTranscribe</span>
            <div className="w-px h-3.5 bg-border/80" />
            <span className="text-xs text-muted-foreground">{topBarSectionLabel[activeView]}</span>
            {isCapturing && (
              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium text-red-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Recording
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              title="Settings"
              onClick={() => setActiveView('settings')}
            >
              <Icon name="settings" size={16} />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-destructive transition-colors"
              title="Close"
              onClick={() => window.close()}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {activeView === 'recording' && (
            <RecordingHubView
              subView={recordingSubView}
              onChangeSubView={setRecordingSubView}
              isCapturing={isCapturing}
              sourceControlProps={sourceControlProps}
              meetingProps={{
                segments: mergedMeetingSegments,
                isCapturing: isCapturing && captureProfile === 'meeting',
                isBusy,
                status,
                transcriptRef,
                onStop: () => void stopCapture(),
                onStart: () => void startCapture('meeting'),
                canStart,
                selectedModel,
              }}
              liveProps={{
                text: liveTranscriptText,
                isCapturing: isCapturing && captureProfile === 'live',
                isBusy,
                status,
                selectedModel,
                canStart: canStartLive,
                onStart: () => void startCapture('live'),
                onStop: () => void stopCapture(),
              }}
            />
          )}
          {activeView === 'models' && (
            <ModelsView
              models={models}
              selectedModelId={selectedModelId}
              downloadingId={downloadingId}
              downloadProgress={downloadProgress}
              downloadError={downloadError}
              isCapturing={isCapturing}
              onSelectModel={(id) => void handleSelectModel(id)}
              onDownload={(id) => void handleDownload(id)}
              onCancelDownload={() => void handleCancelDownload()}
            />
          )}
          {activeView === 'history' && (
            <HistoryView
              sessions={historySessions}
              selectedSessionId={selectedHistoryId}
              selectedSession={selectedSession}
              exportStatus={historyExportStatus}
              onSelectSession={setSelectedHistoryId}
              onDeleteSession={(id) => void deleteHistorySession(id)}
              onExportTxt={() => void exportHistoryTxt()}
              onExportSrt={() => void exportHistorySrt()}
            />
          )}
          {activeView === 'settings' && settings && (
            <SettingsView
              settings={settings}
              onUpdate={(partial) => void handleUpdateSettings(partial)}
              isSaving={settingsSaving}
            />
          )}
        </div>
      </div>
    </div>
  )
}
