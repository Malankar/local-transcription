import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type {
  AppStatus,
  AudioSource,
  AudioSourceMode,
  ModelDownloadProgress,
  TranscriptionModel,
  TranscriptSegment,
} from './types'

const initialStatus: AppStatus = {
  stage: 'idle',
  detail: 'Load sources to begin',
}

const TRANSCRIPT_MERGE_GAP_MS = 2_000

function stars(n: number, max = 5): string {
  return '★'.repeat(n) + '☆'.repeat(max - n)
}

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

  // Model state
  const [models, setModels] = useState<TranscriptionModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState('')

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

      if (nextStatus.stage === 'capturing') {
        setIsCapturing(true)
      }

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
      // Refresh model list to reflect new download status
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

  async function runExport(action: () => Promise<{ canceled: boolean; path?: string }>): Promise<void> {
    setErrorMessage('')

    try {
      const result = await action()
      if (!result.canceled && result.path) {
        setStatus({ stage: 'exported', detail: `Saved transcript to ${result.path}` })
      }
    } catch (error) {
      setErrorMessage(toMessage(error))
    }
  }

  const canStart =
    !isBusy &&
    !isCapturing &&
    modelReady &&
    ((mode === 'system' && systemSourceId) ||
      (mode === 'mic' && micSourceId) ||
      (mode === 'mixed' && systemSourceId && micSourceId))

  const isDownloading = downloadingId === selectedModelId

  return (
    <div style={styles.shell}>
      <style>{css}</style>
      <div style={styles.hero}>
        <div>
          <p className="eyebrow">Local-first desktop transcription</p>
          <h1 style={styles.heading}>LocalTranscribe</h1>
          <p style={styles.subheading}>
            Capture system audio or microphone input, transcribe locally with Whisper or NVIDIA Parakeet, and export TXT or SRT.
          </p>
        </div>
        <button className="ghostButton" onClick={() => void refreshSources()} disabled={isBusy}>
          Refresh Sources
        </button>
      </div>

      <div style={styles.layout}>
        <section className="panel">
          <h2>Model</h2>

          <label className="field">
            <span>Transcription model</span>
            <select
              value={selectedModelId ?? ''}
              onChange={(e) => void handleSelectModel(e.target.value)}
              disabled={isCapturing || downloadingId !== null}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.recommended ? ' — Recommended' : ''}{m.isDownloaded ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </label>

          {selectedModel && (
            <div className="modelCard">
              <p className="modelDesc">{selectedModel.description}</p>
              <div className="modelMeta">
                <span>{formatSize(selectedModel.sizeMb)}</span>
                <span>{selectedModel.languages}</span>
                <span>{selectedModel.runtime}</span>
                <span title="Speed">Speed {stars(selectedModel.speed)}</span>
                <span title="Accuracy">Accuracy {stars(selectedModel.accuracy)}</span>
                {selectedModel.gpuAccelerationLabel ? <span>{selectedModel.gpuAccelerationLabel}</span> : null}
              </div>

              {selectedModel.downloadManaged && selectedModel.isDownloaded && (
                <div className="modelStatus modelStatus--ready">Model ready</div>
              )}
              {!selectedModel.downloadManaged && (
                <div className="modelStatus modelStatus--runtime">Loaded on first use</div>
              )}
              {!selectedModel.isDownloaded && selectedModel.downloadManaged && isDownloading && (
                <div>
                  <div className="progressBar">
                    <div
                      className="progressFill"
                      style={{ width: `${downloadProgress?.percent ?? 0}%` }}
                    />
                  </div>
                  <div className="progressLabel">
                    {downloadProgress
                      ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                      : 'Starting download…'}
                  </div>
                  <button
                    className="ghostButton"
                    style={{ marginTop: 10 }}
                    onClick={() => void handleCancelDownload()}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {!selectedModel.isDownloaded && selectedModel.downloadManaged && !isDownloading && (
                <button
                  className="primaryButton"
                  style={{ marginTop: 10 }}
                  onClick={() => void handleDownload()}
                  disabled={downloadingId !== null}
                >
                  Download ({formatSize(selectedModel.sizeMb)})
                </button>
              )}

              {selectedModel.setupHint ? (
                <p className="modelHint">{selectedModel.setupHint}</p>
              ) : null}

              {downloadError ? <div className="errorCard" style={{ marginTop: 10 }}>{downloadError}</div> : null}
            </div>
          )}

          <h2 style={{ marginTop: 24 }}>Capture Setup</h2>

          <label className="field">
            <span>Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as AudioSourceMode)}>
              <option value="system">System audio</option>
              <option value="mic">Microphone</option>
              <option value="mixed">Mixed system + mic</option>
            </select>
          </label>

          <label className="field">
            <span>System source</span>
            <select
              value={systemSourceId}
              onChange={(e) => setSystemSourceId(e.target.value)}
              disabled={mode === 'mic'}
            >
              <option value="">Select system source</option>
              {systemSources.map((source) => (
                <option key={source.id} value={source.id}>{source.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Mic source</span>
            <select
              value={micSourceId}
              onChange={(e) => setMicSourceId(e.target.value)}
              disabled={mode === 'system'}
            >
              <option value="">Select microphone</option>
              {micSources.map((source) => (
                <option key={source.id} value={source.id}>{source.label}</option>
              ))}
            </select>
          </label>

          <div className="actionRow">
            <button className="primaryButton" onClick={() => void startCapture()} disabled={!canStart}>
              Start
            </button>
            <button className="ghostButton" onClick={() => void stopCapture()} disabled={!isCapturing}>
              Stop
            </button>
          </div>

          {!modelReady && selectedModel?.downloadManaged && !isDownloading && (
            <div className="errorCard" style={{ marginTop: 14 }}>
              Download a model above before starting capture.
            </div>
          )}

          <div className="statusCard">
            <p className="statusLabel">{status.stage}</p>
            <p>{status.detail}</p>
          </div>

          {errorMessage ? <div className="errorCard">{errorMessage}</div> : null}
        </section>

        <section className="panel transcriptPanel">
          <div className="transcriptHeader">
            <div>
              <h2>Live Transcript</h2>
              <p className="muted">
                {mergedSegments.length} continuous passages from {segments.length} transcript windows
              </p>
            </div>
            <div className="actionRow">
              <button className="ghostButton" onClick={() => setSegments([])} disabled={segments.length === 0}>
                Clear
              </button>
              <button className="ghostButton" onClick={() => void exportTxt()} disabled={segments.length === 0}>
                Export TXT
              </button>
              <button className="ghostButton" onClick={() => void exportSrt()} disabled={segments.length === 0}>
                Export SRT
              </button>
            </div>
          </div>

          <div className="transcriptList">
            {mergedSegments.length === 0 ? (
              <div className="emptyState">
                Transcript output will appear here after enough audio is captured to form a natural phrase or pause.
              </div>
            ) : (
              mergedSegments.map((segment) => (
                <article key={segment.id} className="segmentCard">
                  <div className="segmentMeta">
                    <span>{formatClock(segment.startMs)} - {formatClock(segment.endMs)}</span>
                    <span>{new Date(segment.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p>{segment.text}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

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
  if (gapMs > TRANSCRIPT_MERGE_GAP_MS) {
    return false
  }

  if (endsWithSentenceBoundary(previous.text)) {
    return startsLikeSentenceContinuation(next.text)
  }

  return true
}

function endsWithSentenceBoundary(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim())
}

function startsLikeSentenceContinuation(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^[a-z]/.test(trimmed)) return true
  if (/^(and|but|or|so|because|then|well|also|still|yet|to|of|for|with|in|on|at)\b/i.test(trimmed)) {
    return true
  }

  return false
}

function joinTranscriptText(left: string, right: string): string {
  const trimmedLeft = left.trimEnd()
  const trimmedRight = right.trimStart()

  if (!trimmedLeft) return trimmedRight
  if (!trimmedRight) return trimmedLeft
  if (/^[,.;:!?)/\]%]/.test(trimmedRight)) {
    return `${trimmedLeft}${trimmedRight}`
  }
  if (/[(/$£€#-]$/.test(trimmedLeft)) {
    return `${trimmedLeft}${trimmedRight}`
  }

  return `${trimmedLeft} ${trimmedRight}`
}

const styles = {
  shell: {
    minHeight: '100vh',
    padding: '32px',
    background:
      'radial-gradient(circle at top left, rgba(234, 142, 92, 0.16), transparent 28%), linear-gradient(180deg, #f4f1e8 0%, #e7dfd0 100%)',
    color: '#1c1917',
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
  },
  hero: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '24px',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  heading: {
    margin: '6px 0 8px',
    fontSize: '44px',
    lineHeight: 1,
  },
  subheading: {
    maxWidth: '680px',
    margin: 0,
    fontSize: '16px',
    lineHeight: 1.5,
    color: '#57534e',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 400px) minmax(0, 1fr)',
    gap: '24px',
  },
} satisfies Record<string, CSSProperties>

const css = `
  :root {
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
  }

  button,
  select {
    font: inherit;
  }

  .panel {
    background: rgba(255, 252, 247, 0.9);
    border: 1px solid rgba(120, 113, 108, 0.18);
    border-radius: 22px;
    box-shadow: 0 16px 40px rgba(28, 25, 23, 0.08);
    padding: 22px;
    backdrop-filter: blur(12px);
  }

  .transcriptPanel {
    display: flex;
    flex-direction: column;
    min-height: 70vh;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 12px;
    color: #b45309;
    font-weight: 700;
  }

  .field {
    display: grid;
    gap: 8px;
    margin-bottom: 16px;
  }

  .field span,
  .statusLabel,
  .muted {
    color: #78716c;
  }

  .field select {
    width: 100%;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(120, 113, 108, 0.24);
    background: #fffdf8;
  }

  .actionRow {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primaryButton,
  .ghostButton {
    border-radius: 999px;
    padding: 11px 16px;
    border: none;
    cursor: pointer;
    transition: transform 140ms ease, opacity 140ms ease, background 140ms ease;
  }

  .primaryButton {
    background: #c2410c;
    color: #fff7ed;
  }

  .ghostButton {
    background: rgba(120, 113, 108, 0.1);
    color: #292524;
  }

  .primaryButton:hover,
  .ghostButton:hover {
    transform: translateY(-1px);
  }

  .primaryButton:disabled,
  .ghostButton:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  .statusCard,
  .errorCard,
  .emptyState,
  .segmentCard {
    margin-top: 18px;
    border-radius: 18px;
    padding: 16px;
  }

  .statusCard {
    background: #f5f5f4;
  }

  .errorCard {
    background: #fee2e2;
    color: #991b1b;
    border-radius: 14px;
    padding: 12px 14px;
  }

  .modelCard {
    background: #f5f5f4;
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 4px;
  }

  .modelDesc {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.5;
    color: #44403c;
  }

  .modelMeta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: 12px;
    color: #78716c;
    margin-bottom: 10px;
  }

  .modelStatus {
    font-size: 13px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 999px;
    display: inline-block;
  }

  .modelStatus--ready {
    background: #dcfce7;
    color: #166534;
  }

  .modelStatus--runtime {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .modelHint {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: #57534e;
  }

  .progressBar {
    height: 8px;
    background: rgba(120, 113, 108, 0.15);
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 6px;
  }

  .progressFill {
    height: 100%;
    background: #c2410c;
    border-radius: 999px;
    transition: width 200ms ease;
  }

  .progressLabel {
    font-size: 12px;
    color: #78716c;
  }

  .transcriptHeader {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .transcriptList {
    display: grid;
    gap: 14px;
    overflow: auto;
    padding-right: 4px;
  }

  .emptyState {
    margin-top: 18px;
    border-radius: 18px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.72);
    color: #57534e;
  }

  .segmentCard {
    margin-top: 0;
    border-radius: 18px;
    padding: 16px;
    background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,248,241,0.88));
    border: 1px solid rgba(251, 146, 60, 0.18);
  }

  .segmentMeta {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
    color: #78716c;
    margin-bottom: 10px;
  }

  @media (max-width: 900px) {
    .transcriptHeader {
      flex-direction: column;
    }
  }

  @media (max-width: 820px) {
    body {
      min-width: 320px;
    }

    .panel {
      padding: 18px;
    }
  }
`
