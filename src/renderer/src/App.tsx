import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import type {
  AppStatus,
  AudioSource,
  AudioSourceMode,
  ModelDownloadProgress,
  TranscriptionModel,
  TranscriptSegment,
} from './types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type View = 'setup' | 'recording' | 'models' | 'history'

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
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1',
          'text-sm text-foreground shadow-sm transition-colors',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// ── Setup View ─────────────────────────────────────────────────────────────

interface SetupViewProps {
  mode: AudioSourceMode
  setMode: (m: AudioSourceMode) => void
  systemSources: AudioSource[]
  micSources: AudioSource[]
  systemSourceId: string
  setSystemSourceId: (id: string) => void
  micSourceId: string
  setMicSourceId: (id: string) => void
  selectedModel: TranscriptionModel | null
  onNavigateToModels: () => void
  canStart: boolean
  isBusy: boolean
  status: AppStatus
  errorMessage: string
  onStart: () => void
  onRefresh: () => void
}

function SetupView(props: SetupViewProps) {
  const {
    mode, setMode,
    systemSources, micSources,
    systemSourceId, setSystemSourceId,
    micSourceId, setMicSourceId,
    selectedModel, onNavigateToModels,
    canStart, isBusy, status, errorMessage,
    onStart, onRefresh,
  } = props

  const sourceModes = [
    {
      id: 'system' as AudioSourceMode,
      icon: 'computer',
      title: 'System Audio',
      desc: 'Capture meeting audio, videos, or system sounds directly.',
    },
    {
      id: 'mic' as AudioSourceMode,
      icon: 'mic',
      title: 'Microphone',
      desc: 'Direct input from your default recording device.',
    },
    {
      id: 'mixed' as AudioSourceMode,
      icon: 'library_music',
      title: 'Mixed Output',
      desc: 'Combine mic and system audio for full context.',
    },
  ] as const

  return (
    <div className="px-8 py-6 max-w-5xl w-full mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground leading-tight">
            Local-First Transcription
          </h2>
          <Badge variant="outline" className="gap-1.5 text-primary border-primary/30 bg-primary/10 px-3 py-1.5 shrink-0">
            <Icon name="verified_user" filled size={12} />
            100% Local. No Cloud Backend.
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          High-performance AI transcription running directly on your hardware. No data ever
          leaves your machine.
        </p>
      </div>

      {/* Source Selection */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">01 — Source</span>
          <Separator className="flex-1" />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {sourceModes.map(({ id, icon, title, desc }) => {
            const active = mode === id
            return (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={cn(
                  'flex flex-col gap-3 p-4 rounded-xl border text-left transition-all duration-150',
                  active
                    ? 'border-primary/40 bg-primary/10 shadow-sm shadow-primary/10'
                    : 'border-border bg-card hover:border-border/80 hover:bg-card/80',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}>
                    <Icon name={icon} size={18} filled={active} />
                  </div>
                  {active ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/15 border border-primary/25 rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Selected
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 border border-border rounded-full px-2 py-0.5">
                      Available
                    </span>
                  )}
                </div>
                <div>
                  <h3 className={cn('text-sm font-semibold mb-1', active ? 'text-foreground' : 'text-foreground/80')}>
                    {title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Device Selection */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">02 — Device</span>
          <Separator className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1"
            onClick={onRefresh}
            disabled={isBusy}
          >
            <Icon name="refresh" size={11} />
            Refresh
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {(mode === 'system' || mode === 'mixed') && (
            <DeviceSelect
              label="System Source"
              value={systemSourceId}
              onChange={setSystemSourceId}
              sources={systemSources}
              placeholder="Select system source"
            />
          )}
          {(mode === 'mic' || mode === 'mixed') && (
            <DeviceSelect
              label="Microphone"
              value={micSourceId}
              onChange={setMicSourceId}
              sources={micSources}
              placeholder="Select microphone"
            />
          )}
        </div>
      </section>

      {/* Model + Start */}
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <button
            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
            onClick={onNavigateToModels}
          >
            <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center text-primary shrink-0">
              <Icon name="memory" filled size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground leading-none mb-1">
                {selectedModel?.name ?? 'No model selected'}
              </p>
              <p className="text-xs flex items-center gap-1">
                {selectedModel?.isDownloaded && <span className="text-emerald-400">Ready</span>}
                {!selectedModel?.isDownloaded && selectedModel?.downloadManaged && <span className="text-destructive">Download required</span>}
                {!selectedModel?.isDownloaded && !selectedModel?.downloadManaged && <span className="text-muted-foreground">Auto-managed</span>}
                <span className="text-muted-foreground/30">·</span>
                <span className="text-primary/80">Change model →</span>
              </p>
            </div>
          </button>
          {status.stage !== 'idle' && (
            <div className="flex items-center gap-2 px-1">
              <Badge variant="secondary" className="text-[11px] font-mono">{status.stage}</Badge>
              <span className="text-xs text-muted-foreground">{status.detail}</span>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="gap-2 px-8"
          onClick={onStart}
          disabled={!canStart}
        >
          <Icon name="play_arrow" filled size={18} />
          Start Transcription
        </Button>
      </section>

      {errorMessage && (
        <Alert variant="destructive">
          <Icon name="error" filled size={15} />
          <AlertDescription>{errorMessage}</AlertDescription>
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
  selectedModel: TranscriptionModel | null
}

function RecordingView({
  segments,
  isCapturing,
  isBusy,
  status,
  transcriptRef,
  onStop,
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
            <p className="text-sm">Listening… transcript will appear here shortly</p>
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
          <WaveformBars active={isCapturing} />
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

interface HistoryViewProps {
  segments: TranscriptSegment[]
  rawSegmentCount: number
  selectedModel: TranscriptionModel | null
  status: AppStatus
  onClear: () => void
  onExportTxt: () => void
  onExportSrt: () => void
}

function HistoryView({
  segments,
  rawSegmentCount,
  selectedModel,
  status,
  onClear,
  onExportTxt,
  onExportSrt,
}: HistoryViewProps) {
  return (
    <div className="flex h-full">
      {/* Transcript Well */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">
        {/* Meta Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 bg-card/30">
          <div className="flex items-center gap-4">
            {[
              { label: 'Session', value: new Date().toLocaleDateString() },
              { label: 'Segments', value: String(rawSegmentCount) },
              { label: 'Model', value: selectedModel?.name ?? '—', highlight: true },
            ].map(({ label, value, highlight }, i) => (
              <>
                {i > 0 && <Separator key={`sep-${i}`} orientation="vertical" className="h-4" />}
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">{label}</span>
                  <span className={cn('text-xs font-medium', highlight ? 'text-primary/80' : 'text-foreground/80')}>
                    {value}
                  </span>
                </div>
              </>
            ))}
            {status.stage === 'exported' && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400">Exported</span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-48">{status.detail}</span>
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground h-7 px-2 text-xs"
            onClick={onClear}
            disabled={segments.length === 0}
          >
            <Icon name="delete_sweep" size={13} />
            Clear
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-8 py-6">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground/30">
              <Icon name="edit_off" size={44} />
              <h3 className="text-base font-medium text-muted-foreground/40">No Transcript</h3>
              <p className="text-sm">Start a recording session to generate a transcript.</p>
            </div>
          ) : (
            <article className="max-w-2xl mx-auto flex flex-col gap-5">
              {segments.map((seg) => (
                <div key={seg.id} className="flex gap-4 group">
                  <span className="text-[11px] font-mono text-muted-foreground/50 pt-0.5 shrink-0 w-10">
                    {formatClock(seg.startMs)}
                  </span>
                  <p className="text-sm text-foreground/85 leading-relaxed">{seg.text}</p>
                </div>
              ))}
            </article>
          )}
        </ScrollArea>
      </div>

      {/* Export Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col gap-6 p-6 bg-card/20">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">Export Options</h2>
          <p className="text-xs text-muted-foreground">Finalize your transcript for external use.</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Format</span>
          <button
            className={cn(
              'flex items-center justify-between p-3 rounded-lg border transition-all',
              'border-primary/30 bg-primary/10 hover:bg-primary/15',
              segments.length === 0 && 'opacity-40 cursor-not-allowed',
            )}
            onClick={onExportTxt}
            disabled={segments.length === 0}
          >
            <div className="flex items-center gap-2.5">
              <Icon name="description" size={18} />
              <div className="text-left">
                <p className="text-xs font-medium text-foreground">Plain Text (.txt)</p>
                <p className="text-[10px] text-muted-foreground">Continuous text, no timing.</p>
              </div>
            </div>
            <Icon name="download" size={14} />
          </button>
          <button
            className={cn(
              'flex items-center justify-between p-3 rounded-lg border border-border transition-all hover:bg-muted/50',
              segments.length === 0 && 'opacity-40 cursor-not-allowed',
            )}
            onClick={onExportSrt}
            disabled={segments.length === 0}
          >
            <div className="flex items-center gap-2.5">
              <Icon name="subtitles" size={18} />
              <div className="text-left">
                <p className="text-xs font-medium text-foreground">SubRip (.srt)</p>
                <p className="text-[10px] text-muted-foreground">Includes precise timestamps.</p>
              </div>
            </div>
            <Icon name="download" size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Quick Actions</span>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 justify-start"
            disabled={segments.length === 0}
            onClick={() => {
              const text = segments.map((s) => s.text).join('\n\n')
              void navigator.clipboard.writeText(text)
            }}
          >
            <Icon name="content_copy" size={14} />
            Copy to Clipboard
          </Button>
        </div>

        <div className="mt-auto pt-4 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground/40">Processed locally. Zero data egress.</p>
        </div>
      </aside>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────

export function App() {
  const [sources, setSources] = useState<AudioSource[]>([])
  const [mode, setMode] = useState<AudioSourceMode>('system')
  const [systemSourceId, setSystemSourceId] = useState('')
  const [micSourceId, setMicSourceId] = useState('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [status, setStatus] = useState<AppStatus>(initialStatus)
  const [errorMessage, setErrorMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)

  const [models, setModels] = useState<TranscriptionModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState('')

  const [activeView, setActiveView] = useState<View>('setup')
  const transcriptRef = useRef<HTMLDivElement>(null)

  const systemSources = useMemo(() => sources.filter((s) => s.isMonitor), [sources])
  const micSources = useMemo(() => sources.filter((s) => !s.isMonitor), [sources])
  const mergedSegments = useMemo(() => mergeTranscriptSegments(segments), [segments])

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null
  const modelReady = selectedModel?.isDownloaded === true

  useEffect(() => {
    const unsubscribeSegment = window.api.onTranscriptSegment((segment) => {
      setSegments((current) => [...current, segment])
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

    void loadModels()
    void refreshSources()

    return () => {
      unsubscribeSegment()
      unsubscribeStatus()
      unsubscribeError()
      unsubscribeProgress()
    }
  }, [])

  useEffect(() => {
    if (isCapturing) {
      setActiveView('recording')
    } else if (
      !isCapturing &&
      (status.stage === 'stopped' || status.stage === 'error') &&
      segments.length > 0
    ) {
      setActiveView('history')
    }
  }, [isCapturing, status.stage])

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

  async function startCapture(): Promise<void> {
    setErrorMessage('')
    setSegments([])
    setIsBusy(true)
    try {
      await window.api.startCapture({ mode, systemSourceId, micSourceId })
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

  async function exportTxt(): Promise<void> {
    await runExport(() => window.api.exportTxt())
  }

  async function exportSrt(): Promise<void> {
    await runExport(() => window.api.exportSrt())
  }

  async function runExport(
    action: () => Promise<{ canceled: boolean; path?: string }>,
  ): Promise<void> {
    setErrorMessage('')
    try {
      const result = await action()
      if (!result.canceled && result.path) {
        setStatus({ stage: 'exported', detail: result.path })
      }
    } catch (error) {
      setErrorMessage(toMessage(error))
    }
  }

  function handleNewTranscription() {
    setSegments([])
    setErrorMessage('')
    setStatus(initialStatus)
    setActiveView('setup')
  }

  const canStart =
    !isBusy &&
    !isCapturing &&
    modelReady &&
    ((mode === 'system' && !!systemSourceId) ||
      (mode === 'mic' && !!micSourceId) ||
      (mode === 'mixed' && !!systemSourceId && !!micSourceId))

  const navItems = [
    { id: 'setup' as View, label: 'Setup', icon: 'settings_input_component' },
    { id: 'recording' as View, label: 'Recording', icon: 'mic' },
    { id: 'models' as View, label: 'Models', icon: 'memory' },
    { id: 'history' as View, label: 'History', icon: 'history' },
  ]

  const topBarSectionLabel: Record<View, string> = {
    setup: 'Configure',
    recording: 'Live View',
    models: 'Model Library',
    history: 'Transcript',
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
              title="Model settings"
              onClick={() => setActiveView('models')}
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
          {activeView === 'setup' && (
            <SetupView
              mode={mode}
              setMode={setMode}
              systemSources={systemSources}
              micSources={micSources}
              systemSourceId={systemSourceId}
              setSystemSourceId={setSystemSourceId}
              micSourceId={micSourceId}
              setMicSourceId={setMicSourceId}
              selectedModel={selectedModel}
              onNavigateToModels={() => setActiveView('models')}
              canStart={canStart}
              isBusy={isBusy}
              status={status}
              errorMessage={errorMessage}
              onStart={() => void startCapture()}
              onRefresh={() => void refreshSources()}
            />
          )}
          {activeView === 'recording' && (
            <RecordingView
              segments={mergedSegments}
              isCapturing={isCapturing}
              isBusy={isBusy}
              status={status}
              transcriptRef={transcriptRef}
              onStop={() => void stopCapture()}
              selectedModel={selectedModel}
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
              segments={mergedSegments}
              rawSegmentCount={segments.length}
              selectedModel={selectedModel}
              status={status}
              onClear={handleNewTranscription}
              onExportTxt={() => void exportTxt()}
              onExportSrt={() => void exportSrt()}
            />
          )}
        </div>
      </div>
    </div>
  )
}
