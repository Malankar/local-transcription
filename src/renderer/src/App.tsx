import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import type {
  AppStatus,
  AudioSource,
  AudioSourceMode,
  ModelDownloadProgress,
  TranscriptionModel,
  TranscriptSegment,
} from './types'

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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 48,
        gap: 2,
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {WAVE_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className={active ? 'waveBar waveBar--active' : 'waveBar'}
          style={{
            height: active ? h : Math.max(4, Math.round(h * 0.3)),
            animationDelay: active ? `${((i * 0.06) % 0.9).toFixed(2)}s` : undefined,
          }}
        />
      ))}
    </div>
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

  return (
    <div className="setupView">
      <div className="viewHeader">
        <div>
          <h2 className="viewTitle">Local-First Transcription</h2>
          <p className="viewSubtitle">
            High-performance AI transcription running directly on your hardware. No data ever
            leaves your machine.
          </p>
        </div>
        <div className="privacyBadge">
          <Icon name="verified_user" filled size={13} />
          <span>100% Local. No Cloud Backend.</span>
        </div>
      </div>

      <section className="setupSection">
        <div className="sectionLabel">
          <span>01 — Source Selection</span>
          <div className="sectionLine" />
        </div>
        <div className="sourceCards">
          {(
            [
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
          ).map(({ id, icon, title, desc }) => {
            const active = mode === id
            return (
              <button
                key={id}
                className={`sourceCard${active ? ' sourceCard--active' : ''}`}
                onClick={() => setMode(id)}
              >
                <div className="sourceCardTop">
                  <div className={`sourceCardIcon${active ? ' sourceCardIcon--active' : ''}`}>
                    <Icon name={icon} size={26} filled={active} />
                  </div>
                  {active ? (
                    <div className="sourceBadgeSelected">
                      <span className="sourceBadgeDot" />
                      Selected
                    </div>
                  ) : (
                    <span className="sourceBadge">Available</span>
                  )}
                </div>
                <h3 className={`sourceCardTitle${active ? ' sourceCardTitle--active' : ''}`}>
                  {title}
                </h3>
                <p className="sourceCardDesc">{desc}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="setupSection">
        <div className="sectionLabel">
          <span>02 — Device Selection</span>
          <div className="sectionLine" />
          <button className="refreshBtn" onClick={onRefresh} disabled={isBusy}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        </div>
        <div className="deviceFields">
          {(mode === 'system' || mode === 'mixed') && (
            <label className="deviceField">
              <span className="deviceFieldLabel">System Source</span>
              <select
                className="deviceSelect"
                value={systemSourceId}
                onChange={(e) => setSystemSourceId(e.target.value)}
              >
                <option value="">Select system source</option>
                {systemSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(mode === 'mic' || mode === 'mixed') && (
            <label className="deviceField">
              <span className="deviceFieldLabel">Microphone</span>
              <select
                className="deviceSelect"
                value={micSourceId}
                onChange={(e) => setMicSourceId(e.target.value)}
              >
                <option value="">Select microphone</option>
                {micSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="startSection">
        <div className="startLeft">
          <button className="modelInfoBtn" onClick={onNavigateToModels}>
            <div className="modelInfoIcon">
              <Icon name="memory" filled size={17} />
            </div>
            <div>
              <p className="modelInfoName">{selectedModel?.name ?? 'No model selected'}</p>
              <p className="modelInfoSub">
                {selectedModel?.isDownloaded ? (
                  <span style={{ color: '#4ade80' }}>Ready</span>
                ) : selectedModel?.downloadManaged ? (
                  <span style={{ color: '#ff3131' }}>Download required</span>
                ) : (
                  <span style={{ color: '#aaabb0' }}>Auto-managed</span>
                )}
                <span style={{ color: 'rgba(226,226,232,0.3)', margin: '0 4px' }}>·</span>
                <span style={{ color: '#ff3131', textDecoration: 'underline' }}>
                  Change model →
                </span>
              </p>
            </div>
          </button>

          {status.stage !== 'idle' && (
            <div className="statusRow">
              <span className="statusStage">{status.stage}</span>
              <span className="statusDetail">{status.detail}</span>
            </div>
          )}
        </div>

        <button className="startBtn" onClick={onStart} disabled={!canStart}>
          <Icon name="play_arrow" filled size={22} />
          Start Transcription
        </button>
      </section>

      {errorMessage && (
        <div className="errorBanner">
          <Icon name="error" filled size={15} />
          {errorMessage}
        </div>
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
    <div className="recordingView">
      <div className="sessionHeader">
        <div>
          <h2 className="sessionTitle">{sessionName}</h2>
          <div className="sessionMeta">
            <span className="sessionMetaItem">
              <Icon name="memory" size={14} />
              {selectedModel?.name ?? 'Whisper'}
            </span>
            <span className="sessionMetaItem">
              <Icon name="schedule" size={14} />
              {formatElapsed(elapsed)}
            </span>
          </div>
        </div>
        <div className="sessionLoad">
          <span className="sessionLoadLabel">Status</span>
          <span className="sessionLoadValue">{status.stage}</span>
        </div>
      </div>

      <div className="liveTranscript" ref={transcriptRef}>
        {segments.length === 0 ? (
          <div className="transcriptEmpty">
            <Icon name="graphic_eq" filled size={44} />
            <p>Listening… transcript will appear here shortly</p>
          </div>
        ) : (
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
            {segments.map((seg, i) => {
              const isLive = i === segments.length - 1
              return (
                <p
                  key={seg.id}
                  className={`transcriptParagraph${isLive ? ' transcriptParagraph--live' : ''}`}
                >
                  {seg.text}
                  {isLive && isCapturing && <span className="cursor" />}
                </p>
              )
            })}
          </div>
        )}
      </div>

      <div className="controlDock">
        <WaveformBars active={isCapturing} />
        <div className="dockControls">
          <div className="dockLeft">
            <button className="dockBtnSecondary" disabled>
              <Icon name="pause" size={17} />
              Pause
            </button>
          </div>
          <button
            className="dockBtnPrimary"
            onClick={onStop}
            disabled={!isCapturing || isBusy}
          >
            <Icon name="stop_circle" filled size={17} />
            Stop &amp; Process
          </button>
        </div>
      </div>

      <footer className="recordingFooter">
        <div className="footerItem">
          <Icon name="verified_user" filled size={12} />
          Private &amp; Offline
        </div>
        <div className="footerDot" />
        <div className="footerItem">
          <Icon name="cloud_off" size={12} />
          Zero Data Egress
        </div>
        <div className="footerDot" />
        <div className="footerItem">
          <Icon name="memory" size={12} />
          Neural Engine Active
        </div>
      </footer>
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
  onDownload: () => void
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
    <div className="modelsView">
      <div className="viewHeader">
        <div>
          <h2 className="viewTitle">Model Library</h2>
          <p className="viewSubtitle">Select and manage local transcription engines.</p>
        </div>
      </div>

      <div className="modelGrid">
        {models.map((model) => {
          const isSelected = model.id === selectedModelId
          const isDownloading = model.id === downloadingId

          return (
            <div
              key={model.id}
              className={`modelCard2${isSelected ? ' modelCard2--selected' : ''}`}
              onClick={() => !isCapturing && !downloadingId && onSelectModel(model.id)}
              role="button"
              style={{ cursor: isCapturing || !!downloadingId ? 'default' : 'pointer' }}
            >
              {model.recommended && <div className="modelRecommended">Recommended</div>}
              <div className="modelCardHeader">
                <span className="modelIdLabel">{model.id}</span>
                <span className="modelSize">{formatSize(model.sizeMb)}</span>
              </div>
              <h4 className="modelName">{model.name}</h4>
              <p className="modelDesc2">{model.description}</p>
              <div className="modelAccuracyRow">
                <span>Accuracy</span>
                <span className={isSelected ? 'modelAccValue--active' : ''}>
                  {'★'.repeat(model.accuracy)}
                  {'☆'.repeat(5 - model.accuracy)}
                </span>
              </div>
              <div className="modelAccBar">
                <div
                  className="modelAccFill"
                  style={{
                    width: `${(model.accuracy / 5) * 100}%`,
                    background: isSelected ? '#ff3131' : '#46484d',
                  }}
                />
              </div>
              <div className="modelCardFooter">
                <span className="modelSpeed">
                  Speed {'★'.repeat(model.speed)}
                  {'☆'.repeat(5 - model.speed)}
                </span>
                {model.isDownloaded ? (
                  <span className="modelStatusReady">
                    <Icon name="check_circle" filled size={11} />
                    Ready
                  </span>
                ) : isDownloading ? (
                  <button
                    className="modelBtnCancel"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCancelDownload()
                    }}
                  >
                    Cancel
                  </button>
                ) : model.downloadManaged ? (
                  <button
                    className="modelBtnDownload"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectModel(model.id)
                      onDownload()
                    }}
                    disabled={!!downloadingId || isCapturing}
                  >
                    <Icon name="download" size={11} />
                    Download
                  </button>
                ) : (
                  <span className="modelStatusRuntime">Auto</span>
                )}
              </div>

              {isDownloading && (
                <div className="modelDownloadProgress">
                  <div className="dlBar">
                    <div
                      className="dlFill"
                      style={{ width: `${downloadProgress?.percent ?? 0}%` }}
                    />
                  </div>
                  <span className="dlLabel">
                    {downloadProgress
                      ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                      : 'Starting download…'}
                  </span>
                </div>
              )}

              {model.setupHint && <p className="modelHintText">{model.setupHint}</p>}
            </div>
          )
        })}
      </div>

      {downloadError && (
        <div className="errorBanner" style={{ marginTop: 16 }}>
          <Icon name="error" filled size={15} />
          {downloadError}
        </div>
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
    <div className="historyView">
      <div className="transcriptWell">
        <div className="metaBar">
          <div className="metaItems">
            <div className="metaItem">
              <span className="metaItemLabel">Session</span>
              <span className="metaItemValue">{new Date().toLocaleDateString()}</span>
            </div>
            <div className="metaDivider" />
            <div className="metaItem">
              <span className="metaItemLabel">Segments</span>
              <span className="metaItemValue">{rawSegmentCount}</span>
            </div>
            <div className="metaDivider" />
            <div className="metaItem">
              <span className="metaItemLabel">Model</span>
              <span className="metaItemValue" style={{ color: '#ff3131' }}>
                {selectedModel?.name ?? '—'}
              </span>
            </div>
            {status.stage === 'exported' && (
              <>
                <div className="metaDivider" />
                <div className="metaItem">
                  <span className="metaItemLabel" style={{ color: '#4ade80' }}>Exported</span>
                  <span className="metaItemValue" style={{ fontSize: 11, color: '#aaabb0' }}>
                    {status.detail}
                  </span>
                </div>
              </>
            )}
          </div>
          <button className="clearBtn" onClick={onClear} disabled={segments.length === 0}>
            <Icon name="delete_sweep" size={13} />
            Clear
          </button>
        </div>

        <div className="transcriptWellContent">
          {segments.length === 0 ? (
            <div className="wellEmpty">
              <Icon name="edit_off" size={48} />
              <h3>No Transcript</h3>
              <p>Start a recording session to generate a transcript.</p>
            </div>
          ) : (
            <article className="transcriptArticle">
              {segments.map((seg) => (
                <div key={seg.id} className="transcriptBlock">
                  <span className="transcriptTimestamp">{formatClock(seg.startMs)}</span>
                  <p className="transcriptText">{seg.text}</p>
                </div>
              ))}
            </article>
          )}
        </div>
      </div>

      <aside className="exportSidebar">
        <div>
          <h2 className="exportTitle">Export Options</h2>
          <p className="exportSubtitle">Finalize your transcript for external use.</p>
        </div>

        <div className="exportFormats">
          <span className="exportLabel">Format Selection</span>
          <button
            className="exportFormatBtn exportFormatBtn--active"
            onClick={onExportTxt}
            disabled={segments.length === 0}
          >
            <div className="exportFormatLeft">
              <Icon name="description" size={20} />
              <div>
                <p className="exportFormatName">Plain Text (.txt)</p>
                <p className="exportFormatDesc">Continuous text, no timing.</p>
              </div>
            </div>
            <Icon name="download" size={16} />
          </button>
          <button
            className="exportFormatBtn"
            onClick={onExportSrt}
            disabled={segments.length === 0}
          >
            <div className="exportFormatLeft">
              <Icon name="subtitles" size={20} />
              <div>
                <p className="exportFormatName">SubRip (.srt)</p>
                <p className="exportFormatDesc">Includes precise timestamps.</p>
              </div>
            </div>
            <Icon name="download" size={16} />
          </button>
        </div>

        <div className="exportActions">
          <span className="exportLabel">Quick Actions</span>
          <button
            className="exportActionBtn"
            disabled={segments.length === 0}
            onClick={() => {
              const text = segments.map((s) => s.text).join('\n\n')
              void navigator.clipboard.writeText(text)
            }}
          >
            <Icon name="content_copy" size={16} />
            Copy to Clipboard
          </button>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(94,63,60,0.15)' }}>
          <p className="exportFooterNote">Processed locally. Zero data egress.</p>
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

  async function handleDownload(): Promise<void> {
    if (!selectedModelId) return
    setDownloadError('')
    setDownloadingId(selectedModelId)
    setDownloadProgress(null)
    try {
      await window.api.downloadModel(selectedModelId)
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
    <div className="shell">
      <style>{css}</style>

      <aside className="sidebar">
        <div className="sidebarContent">
          <div className="logo">
            <div className="logoIcon">
              <Icon name="graphic_eq" filled size={17} />
            </div>
            <div>
              <h1 className="logoTitle">LocalTranscribe</h1>
              <p className="logoSub">V0.1 Alpha</p>
            </div>
          </div>

          <button className="newBtn" onClick={handleNewTranscription}>
            <Icon name="add" size={14} />
            New Transcription
          </button>

          <nav className="nav">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                className={`navItem${activeView === id ? ' navItem--active' : ''}`}
                onClick={() => setActiveView(id)}
              >
                <Icon name={icon} filled={activeView === id} size={17} />
                {label}
                {id === 'recording' && isCapturing && <span className="navDot" />}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebarFooter">
          <div className="privacyRow">
            <Icon name="verified_user" filled size={11} />
            <span>Local Only</span>
            <span className="dot" />
            <Icon name="cloud_off" size={11} />
            <span>No Cloud</span>
          </div>
        </div>
      </aside>

      <div className="mainArea">
        <header className="topBar">
          <div className="topBarLeft">
            <span className="topBarTitle">LocalTranscribe</span>
            <div className="topBarDivider" />
            <span className="topBarSection">{topBarSectionLabel[activeView]}</span>
            {isCapturing && (
              <div className="recordingBadge">
                <span className="recordingDot" />
                <span>Recording</span>
              </div>
            )}
          </div>
          <div className="topBarRight">
            <button
              className="topBarBtn"
              title="Model settings"
              onClick={() => setActiveView('models')}
            >
              <Icon name="settings" size={17} />
            </button>
            <button
              className="topBarBtn topBarBtn--danger"
              title="Close"
              onClick={() => window.close()}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        </header>

        <div className="contentArea">
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
              onDownload={() => void handleDownload()}
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

// ── CSS ────────────────────────────────────────────────────────────────────

const css = `
  :root { color-scheme: dark; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; overflow: hidden; background: #0c0e12; }
  button, select, input { font-family: inherit; }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }

  /* ── Shell ─────────────────────── */
  .shell {
    display: flex;
    height: 100vh;
    background: #0c0e12;
    color: #e2e2e8;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
  }

  /* ── Sidebar ───────────────────── */
  .sidebar {
    width: 256px;
    min-width: 256px;
    background: #0c0e12;
    border-right: 1px solid rgba(94,63,60,0.15);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100vh;
    z-index: 40;
  }
  .sidebarContent { padding: 28px 20px 20px; }

  .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  .logoIcon {
    width: 32px; height: 32px;
    background: #ff3131; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    color: #690005; flex-shrink: 0;
  }
  .logoTitle {
    font-size: 17px; font-weight: 900; color: #ffb4ab;
    letter-spacing: -0.04em; line-height: 1;
  }
  .logoSub {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em;
    color: rgba(226,226,232,0.35); font-weight: 600; margin-top: 2px;
  }

  .newBtn {
    width: 100%; background: #fff; color: #0c0e12;
    border: none; border-radius: 4px; padding: 9px 14px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    margin-bottom: 20px; transition: background 150ms;
  }
  .newBtn:hover { background: #f0f0f0; }

  .nav { display: flex; flex-direction: column; gap: 2px; }
  .navItem {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 11px; border-radius: 4px;
    border: none; border-right: 2px solid transparent;
    background: transparent; color: rgba(226,226,232,0.38);
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; cursor: pointer;
    transition: all 180ms; position: relative; text-align: left;
  }
  .navItem:hover { color: #e2e2e8; background: rgba(30,32,36,0.5); }
  .navItem--active {
    color: #ffb4ab; background: #1e2024;
    border-right-color: #ff3131; border-radius: 4px 0 0 4px;
  }
  .navDot {
    width: 6px; height: 6px; background: #ff3131;
    border-radius: 50%; animation: pulse 1.4s ease-in-out infinite;
    margin-left: auto;
  }

  .sidebarFooter {
    padding: 14px 20px 20px;
    border-top: 1px solid rgba(94,63,60,0.15);
  }
  .privacyRow {
    display: flex; align-items: center; gap: 6px;
    color: rgba(226,226,232,0.28); font-size: 9px;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
  }
  .dot {
    width: 3px; height: 3px;
    background: rgba(226,226,232,0.15); border-radius: 50%;
  }

  /* ── Main area ─────────────────── */
  .mainArea { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

  /* ── Top bar ───────────────────── */
  .topBar {
    height: 46px; background: #111317;
    border-bottom: 1px solid #1e2024;
    display: flex; align-items: center;
    justify-content: space-between; padding: 0 18px; flex-shrink: 0;
  }
  .topBarLeft { display: flex; align-items: center; gap: 10px; }
  .topBarTitle { font-size: 13px; font-weight: 700; letter-spacing: -0.02em; color: #e2e2e8; }
  .topBarDivider { width: 1px; height: 14px; background: #1e2024; }
  .topBarSection {
    font-size: 10px; color: rgba(226,226,232,0.45);
    text-transform: uppercase; letter-spacing: 0.16em; font-weight: 600;
  }
  .recordingBadge {
    display: flex; align-items: center; gap: 6px;
    background: #1e2024; border-radius: 999px; padding: 3px 10px;
    font-size: 9px; font-weight: 700; color: #ffb4ab;
    text-transform: uppercase; letter-spacing: 0.1em;
  }
  .recordingDot {
    width: 6px; height: 6px; background: #ff3131;
    border-radius: 50%; animation: pulse 1.4s ease-in-out infinite;
  }
  .topBarRight { display: flex; align-items: center; gap: 3px; }
  .topBarBtn {
    width: 30px; height: 30px; border: none; background: transparent;
    color: rgba(226,226,232,0.45); border-radius: 4px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: all 140ms;
  }
  .topBarBtn:hover { background: #333539; color: #e2e2e8; }
  .topBarBtn--danger:hover { background: rgba(147,0,10,0.25); color: #ff3131; }

  /* ── Content area ──────────────── */
  .contentArea {
    flex: 1; overflow: auto;
    scrollbar-width: thin; scrollbar-color: #46484d transparent;
  }

  /* ── Setup View ────────────────── */
  .setupView {
    padding: 36px 44px; max-width: 880px; margin: 0 auto;
    display: flex; flex-direction: column; gap: 36px;
  }
  .viewHeader {
    display: flex; justify-content: space-between;
    align-items: flex-end; gap: 20px; flex-wrap: wrap;
  }
  .viewTitle {
    font-size: 28px; font-weight: 900; letter-spacing: -0.03em;
    color: #e2e2e8; line-height: 1; margin-bottom: 8px;
  }
  .viewSubtitle { font-size: 13px; color: #aaabb0; line-height: 1.6; max-width: 460px; }
  .privacyBadge {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 11px; background: rgba(255,49,49,0.08);
    border: 1px solid rgba(255,49,49,0.18); border-radius: 4px;
    font-size: 9px; font-weight: 900; color: #ff3131;
    text-transform: uppercase; letter-spacing: 0.12em;
    white-space: nowrap; flex-shrink: 0;
  }

  .setupSection { display: flex; flex-direction: column; gap: 14px; }
  .sectionLabel {
    display: flex; align-items: center; gap: 10px;
    font-size: 9px; font-weight: 900; color: rgba(226,226,232,0.38);
    text-transform: uppercase; letter-spacing: 0.16em;
  }
  .sectionLine { flex: 1; height: 1px; background: rgba(94,63,60,0.2); }
  .refreshBtn {
    display: flex; align-items: center; gap: 4px;
    background: transparent; border: 1px solid rgba(94,63,60,0.3);
    color: rgba(226,226,232,0.45); font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    padding: 4px 8px; border-radius: 3px; cursor: pointer; transition: all 140ms;
  }
  .refreshBtn:hover { color: #e2e2e8; border-color: rgba(226,226,232,0.3); }
  .refreshBtn:disabled { opacity: 0.4; cursor: not-allowed; }

  .sourceCards { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
  .sourceCard {
    background: #1d2025; border: 1px solid transparent;
    border-radius: 6px; padding: 18px; text-align: left; cursor: pointer;
    transition: all 180ms;
  }
  .sourceCard:hover { background: #23262c; border-color: rgba(255,49,49,0.1); }
  .sourceCard--active { background: #23262c; border-color: #ff3131; box-shadow: 0 0 20px rgba(255,49,49,0.04); }

  .sourceCardTop {
    display: flex; justify-content: space-between;
    align-items: flex-start; margin-bottom: 14px;
  }
  .sourceCardIcon {
    width: 42px; height: 42px; background: #2a2d33;
    border-radius: 6px; display: flex; align-items: center;
    justify-content: center; color: #aaabb0; transition: all 180ms;
  }
  .sourceCardIcon--active { background: #ff3131; color: #fff; }

  .sourceBadge {
    font-size: 9px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.1em; padding: 3px 8px;
    background: #23262c; color: rgba(226,226,232,0.45); border-radius: 3px;
  }
  .sourceBadgeSelected {
    display: flex; align-items: center; gap: 5px;
    font-size: 9px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.1em; color: #ff3131;
  }
  .sourceBadgeDot {
    width: 6px; height: 6px; background: #ff3131;
    border-radius: 50%; animation: pulse 1.4s ease-in-out infinite;
  }
  .sourceCardTitle { font-size: 14px; font-weight: 700; color: #e2e2e8; margin-bottom: 4px; }
  .sourceCardTitle--active { color: #ff3131; }
  .sourceCardDesc { font-size: 12px; color: #aaabb0; line-height: 1.5; }

  .deviceFields { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 10px; }
  .deviceField { display: flex; flex-direction: column; gap: 5px; }
  .deviceFieldLabel {
    font-size: 9px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.15em; color: rgba(226,226,232,0.45);
  }
  .deviceSelect {
    background: #0c0e12; border: 1px solid #1e2024;
    color: #e2e2e8; border-radius: 4px; padding: 9px 11px;
    font-size: 13px; cursor: pointer; transition: border-color 140ms; outline: none;
  }
  .deviceSelect:focus { border-color: #ff3131; }
  .deviceSelect option { background: #111317; }

  .startSection {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.04);
    gap: 20px; flex-wrap: wrap;
  }
  .startLeft { display: flex; flex-direction: column; gap: 10px; }
  .modelInfoBtn {
    display: flex; align-items: center; gap: 11px;
    padding: 11px 14px; background: #1e2024; border-radius: 6px;
    border: 1px solid transparent; cursor: pointer;
    transition: border-color 140ms; text-align: left; color: inherit;
  }
  .modelInfoBtn:hover { border-color: rgba(255,49,49,0.2); }
  .modelInfoIcon {
    width: 34px; height: 34px; background: rgba(255,49,49,0.1);
    border-radius: 4px; display: flex; align-items: center;
    justify-content: center; color: #ff3131; flex-shrink: 0;
  }
  .modelInfoName { font-size: 13px; font-weight: 600; color: #e2e2e8; margin-bottom: 3px; }
  .modelInfoSub { font-size: 11px; color: #aaabb0; }

  .statusRow { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .statusStage {
    background: #1e2024; padding: 3px 8px; border-radius: 3px;
    font-size: 9px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.1em; color: #aaabb0;
  }
  .statusDetail { color: rgba(226,226,232,0.45); }

  .startBtn {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 28px; background: #fff; color: #0c0e12;
    border: none; border-radius: 4px; font-size: 14px; font-weight: 900;
    text-transform: uppercase; letter-spacing: -0.02em; cursor: pointer;
    transition: all 180ms; box-shadow: 0 8px 24px rgba(255,255,255,0.05);
    white-space: nowrap;
  }
  .startBtn:hover:not(:disabled) { background: #f0f0f0; transform: scale(1.02); }
  .startBtn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

  .errorBanner {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 13px; background: rgba(147,0,10,0.2);
    border: 1px solid rgba(255,49,49,0.2); border-radius: 4px;
    font-size: 13px; color: #ffb4ab;
  }

  /* ── Recording View ─────────────── */
  .recordingView {
    display: flex; flex-direction: column;
    height: calc(100vh - 46px); position: relative; overflow: hidden;
  }
  .sessionHeader {
    padding: 20px 36px; border-bottom: 1px solid #1e2024;
    display: flex; justify-content: space-between;
    align-items: flex-end; flex-shrink: 0;
  }
  .sessionTitle {
    font-size: 22px; font-weight: 900; letter-spacing: -0.03em;
    color: #f6f6fc; margin-bottom: 6px;
  }
  .sessionMeta { display: flex; align-items: center; gap: 16px; }
  .sessionMetaItem {
    display: flex; align-items: center; gap: 5px;
    font-size: 13px; font-weight: 500; color: #aaabb0;
  }
  .sessionMetaItem .material-symbols-outlined { color: #ff3131; }
  .sessionLoad { text-align: right; }
  .sessionLoadLabel {
    display: block; font-size: 9px; font-weight: 900;
    text-transform: uppercase; letter-spacing: 0.15em; color: #ff3131; margin-bottom: 3px;
  }
  .sessionLoadValue {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #aaabb0;
  }

  .liveTranscript {
    flex: 1; overflow-y: auto; padding: 36px;
    scrollbar-width: thin; scrollbar-color: #46484d transparent;
    padding-bottom: 160px;
  }
  .transcriptEmpty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100%; gap: 12px;
    color: rgba(170,171,176,0.28); text-align: center;
  }
  .transcriptEmpty .material-symbols-outlined { font-size: 44px; }
  .transcriptEmpty p { font-size: 13px; color: rgba(170,171,176,0.38); margin-top: 4px; }

  .transcriptParagraph {
    font-size: 17px; line-height: 1.85;
    color: rgba(246,246,252,0.55); font-weight: 400;
  }
  .transcriptParagraph--live { color: #ffb4ab; font-weight: 600; }
  .cursor {
    display: inline-block; width: 2px; height: 20px;
    background: #ff3131; margin-left: 2px;
    animation: blink 1s step-end infinite; vertical-align: middle;
  }

  .controlDock {
    position: absolute; bottom: 36px; left: 50%; transform: translateX(-50%);
    width: calc(100% - 72px); max-width: 620px;
    background: rgba(29,32,37,0.88); backdrop-filter: blur(16px);
    border: 1px solid rgba(94,63,60,0.18); border-radius: 12px;
    padding: 14px 18px; display: flex; flex-direction: column; gap: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.45);
  }
  .dockControls { display: flex; align-items: center; justify-content: space-between; }
  .dockLeft { display: flex; align-items: center; gap: 8px; }
  .dockBtnSecondary {
    display: flex; align-items: center; gap: 6px;
    padding: 0 14px; height: 42px;
    background: #23262c; border: 1px solid rgba(255,255,255,0.05);
    color: #e2e2e8; border-radius: 4px; font-size: 13px; font-weight: 700;
    cursor: pointer; transition: all 140ms;
  }
  .dockBtnSecondary:hover:not(:disabled) { background: #333539; }
  .dockBtnSecondary:disabled { opacity: 0.4; cursor: not-allowed; }
  .dockBtnSecondary .material-symbols-outlined { color: #ff3131; }
  .dockBtnPrimary {
    display: flex; align-items: center; gap: 8px;
    padding: 0 22px; height: 42px; background: #fff; border: none;
    color: #0c0e12; border-radius: 4px; font-size: 13px; font-weight: 900;
    cursor: pointer; transition: all 140ms; box-shadow: 0 4px 16px rgba(255,255,255,0.05);
  }
  .dockBtnPrimary:hover:not(:disabled) { background: #f0f0f0; transform: scale(1.01); }
  .dockBtnPrimary:disabled { opacity: 0.4; cursor: not-allowed; }

  .recordingFooter {
    height: 34px; background: rgba(0,0,0,0.5);
    border-top: 1px solid #1e2024;
    display: flex; align-items: center; justify-content: center;
    gap: 18px; flex-shrink: 0;
  }
  .footerItem {
    display: flex; align-items: center; gap: 5px;
    font-size: 9px; font-weight: 700; color: #aaabb0;
    text-transform: uppercase; letter-spacing: 0.1em;
  }
  .footerItem .material-symbols-outlined { color: #ff3131; }
  .footerDot { width: 3px; height: 3px; background: #1e2024; border-radius: 50%; }

  /* ── Waveform ───────────────────── */
  .waveBar {
    width: 3px; background: #ff3131; border-radius: 2px;
    transition: height 200ms ease; transform-origin: center; flex-shrink: 0;
  }
  .waveBar--active { animation: wave 0.9s ease-in-out infinite; }
  @keyframes wave {
    0%, 100% { transform: scaleY(0.35); }
    50% { transform: scaleY(1); }
  }

  /* ── Models View ────────────────── */
  .modelsView { padding: 36px 44px; max-width: 960px; margin: 0 auto; }
  .modelGrid {
    display: grid; grid-template-columns: repeat(auto-fill,minmax(230px,1fr));
    gap: 12px; margin-top: 20px;
  }
  .modelCard2 {
    background: #1d2025; border: 1px solid rgba(94,63,60,0.1);
    border-radius: 6px; padding: 16px; transition: all 180ms; position: relative;
  }
  .modelCard2:hover { background: #23262c; }
  .modelCard2--selected { background: #23262c; border-color: rgba(255,49,49,0.22); }

  .modelRecommended {
    position: absolute; top: -9px; left: 13px;
    background: #ff3131; color: #fff;
    font-size: 8px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.1em; padding: 2px 8px; border-radius: 3px;
  }
  .modelCardHeader {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 5px;
  }
  .modelIdLabel { font-size: 11px; font-family: monospace; color: #ff3131; font-weight: 600; }
  .modelSize {
    font-size: 9px; font-weight: 700; padding: 2px 7px;
    border-radius: 999px; background: rgba(70,72,77,0.3); color: #aaabb0; text-transform: uppercase;
  }
  .modelName { font-size: 14px; font-weight: 700; color: #e2e2e8; margin-bottom: 5px; }
  .modelDesc2 { font-size: 11px; color: rgba(170,171,176,0.65); line-height: 1.5; margin-bottom: 13px; }

  .modelAccuracyRow {
    display: flex; justify-content: space-between;
    font-size: 9px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 0.1em; color: rgba(226,226,232,0.38); margin-bottom: 4px;
  }
  .modelAccValue--active { color: #ff3131; }
  .modelAccBar { height: 3px; background: #000; border-radius: 999px; overflow: hidden; margin-bottom: 13px; }
  .modelAccFill { height: 100%; border-radius: 999px; transition: width 280ms ease; }

  .modelCardFooter {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.04);
  }
  .modelSpeed { font-size: 9px; font-weight: 700; color: rgba(226,226,232,0.38); text-transform: uppercase; letter-spacing: 0.08em; }
  .modelStatusReady { display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 900; color: #4ade80; text-transform: uppercase; letter-spacing: 0.1em; }
  .modelStatusRuntime { font-size: 9px; font-weight: 900; color: #aaabb0; text-transform: uppercase; letter-spacing: 0.1em; }
  .modelBtnDownload {
    display: flex; align-items: center; gap: 4px;
    font-size: 9px; font-weight: 900; color: #ff3131;
    background: transparent; border: none; cursor: pointer;
    text-transform: uppercase; letter-spacing: 0.08em; transition: opacity 140ms;
  }
  .modelBtnDownload:hover:not(:disabled) { text-decoration: underline; }
  .modelBtnDownload:disabled { opacity: 0.4; cursor: not-allowed; }
  .modelBtnCancel { font-size: 9px; font-weight: 900; color: #aaabb0; background: transparent; border: none; cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; }
  .modelBtnCancel:hover { color: #ff3131; }

  .modelDownloadProgress { margin-top: 10px; }
  .dlBar { height: 3px; background: #000; border-radius: 999px; overflow: hidden; margin-bottom: 4px; }
  .dlFill { height: 100%; background: #ff3131; border-radius: 999px; transition: width 180ms; box-shadow: 0 0 8px rgba(255,49,49,0.5); }
  .dlLabel { font-size: 9px; color: rgba(226,226,232,0.38); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  .modelHintText { margin-top: 8px; font-size: 11px; color: rgba(170,171,176,0.55); line-height: 1.5; }

  /* ── History View ────────────────── */
  .historyView { display: flex; height: calc(100vh - 46px); overflow: hidden; }
  .transcriptWell { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

  .metaBar {
    padding: 12px 22px; background: #111317;
    border-bottom: 1px solid rgba(94,63,60,0.1);
    display: flex; justify-content: space-between;
    align-items: center; flex-shrink: 0;
  }
  .metaItems { display: flex; align-items: center; gap: 18px; }
  .metaItem { display: flex; flex-direction: column; gap: 2px; }
  .metaItemLabel { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(226,226,232,0.38); }
  .metaItemValue { font-size: 13px; font-weight: 600; color: #e2e2e8; }
  .metaDivider { width: 1px; height: 26px; background: rgba(70,72,77,0.3); }

  .clearBtn {
    display: flex; align-items: center; gap: 5px;
    background: #1e2024; border: 1px solid transparent;
    color: rgba(226,226,232,0.45); font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    padding: 6px 11px; border-radius: 4px; cursor: pointer; transition: all 140ms;
  }
  .clearBtn:hover:not(:disabled) { border-color: rgba(255,49,49,0.3); color: #ff3131; }
  .clearBtn:disabled { opacity: 0.4; cursor: not-allowed; }

  .transcriptWellContent {
    flex: 1; overflow-y: auto; background: #050505; padding: 36px;
    scrollbar-width: thin; scrollbar-color: #46484d transparent;
  }
  .wellEmpty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100%; gap: 12px; text-align: center;
  }
  .wellEmpty .material-symbols-outlined { font-size: 48px; color: rgba(255,49,49,0.28); }
  .wellEmpty h3 { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; color: #e2e2e8; }
  .wellEmpty p { font-size: 13px; color: #aaabb0; max-width: 300px; line-height: 1.6; }

  .transcriptArticle { max-width: 620px; margin: 0 auto; display: flex; flex-direction: column; gap: 26px; }
  .transcriptBlock { position: relative; }
  .transcriptTimestamp { font-size: 9px; font-family: monospace; color: rgba(170,171,176,0.38); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 5px; }
  .transcriptText { font-size: 16px; line-height: 1.9; color: #e2e2e8; font-weight: 400; }

  .exportSidebar {
    width: 270px; min-width: 270px; background: #111317;
    border-left: 1px solid rgba(94,63,60,0.15);
    padding: 24px 20px; display: flex; flex-direction: column; gap: 24px;
    overflow-y: auto;
  }
  .exportTitle { font-size: 17px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; color: #e2e2e8; margin-bottom: 4px; }
  .exportSubtitle { font-size: 11px; color: #aaabb0; font-weight: 500; }
  .exportLabel { display: block; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(226,226,232,0.38); margin-bottom: 8px; }

  .exportFormats { display: flex; flex-direction: column; gap: 6px; }
  .exportFormatBtn {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 13px; border-radius: 4px;
    background: rgba(30,32,36,0.5); border: 1px solid transparent;
    color: #e2e2e8; cursor: pointer; transition: all 140ms; text-align: left;
  }
  .exportFormatBtn:hover:not(:disabled) { background: #1e2024; border-color: rgba(255,49,49,0.18); }
  .exportFormatBtn--active { background: #1e2024; border-color: rgba(255,49,49,0.28); }
  .exportFormatBtn:disabled { opacity: 0.4; cursor: not-allowed; }
  .exportFormatBtn .material-symbols-outlined { color: #ff3131; }
  .exportFormatLeft { display: flex; align-items: center; gap: 11px; }
  .exportFormatName { font-size: 13px; font-weight: 700; color: #e2e2e8; margin-bottom: 2px; }
  .exportFormatDesc { font-size: 9px; color: #aaabb0; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }

  .exportActions { display: flex; flex-direction: column; gap: 6px; }
  .exportActionBtn {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 13px; border-radius: 4px; background: #1e2024; border: none;
    color: #e2e2e8; font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; cursor: pointer; transition: background 140ms;
  }
  .exportActionBtn:hover:not(:disabled) { background: #23262c; }
  .exportActionBtn:disabled { opacity: 0.4; cursor: not-allowed; }
  .exportActionBtn .material-symbols-outlined { color: #ff3131; }

  .exportFooterNote { font-size: 9px; color: rgba(226,226,232,0.28); text-align: center; text-transform: uppercase; letter-spacing: 0.08em; }

  /* ── Animations ─────────────────── */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
`
