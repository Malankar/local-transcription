import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type {
  AppStatus,
  AudioSource,
  AudioSourceMode,
  TranscriptSegment,
} from './types'

const initialStatus: AppStatus = {
  stage: 'idle',
  detail: 'Load sources to begin',
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

  const systemSources = useMemo(
    () => sources.filter((source) => source.isMonitor),
    [sources]
  )
  const micSources = useMemo(
    () => sources.filter((source) => !source.isMonitor),
    [sources]
  )

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

      if (nextStatus.stage === 'stopped' || nextStatus.stage === 'ready' || nextStatus.stage === 'error') {
        setIsCapturing(false)
      }
    })
    const unsubscribeError = window.api.onError((message) => {
      setErrorMessage(message)
      setIsBusy(false)
      setIsCapturing(false)
    })

    void refreshSources()

    return () => {
      unsubscribeSegment()
      unsubscribeStatus()
      unsubscribeError()
    }
  }, [])

  async function refreshSources(): Promise<void> {
    setErrorMessage('')
    setIsBusy(true)

    try {
      const discovered = await window.api.getSources()
      setSources(discovered)
      setSystemSourceId((current) => current || discovered.find((source) => source.isMonitor)?.id || '')
      setMicSourceId((current) => current || discovered.find((source) => !source.isMonitor)?.id || '')
    } catch (error) {
      setErrorMessage(toMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function startCapture(): Promise<void> {
    setErrorMessage('')
    setSegments([])
    setIsBusy(true)

    try {
      await window.api.startCapture({
        mode,
        systemSourceId,
        micSourceId,
      })
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
    ((mode === 'system' && systemSourceId) ||
      (mode === 'mic' && micSourceId) ||
      (mode === 'mixed' && systemSourceId && micSourceId))

  return (
    <div style={styles.shell}>
      <style>{css}</style>
      <div style={styles.hero}>
        <div>
          <p className="eyebrow">Local-first desktop transcription</p>
          <h1 style={styles.heading}>LocalTranscribe</h1>
          <p style={styles.subheading}>
            Capture system audio or microphone input, transcribe with local Whisper inference, and export TXT or SRT.
          </p>
        </div>
        <button className="ghostButton" onClick={() => void refreshSources()} disabled={isBusy}>
          Refresh Sources
        </button>
      </div>

      <div style={styles.layout}>
        <section className="panel">
          <h2>Capture Setup</h2>
          <label className="field">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as AudioSourceMode)}>
              <option value="system">System audio</option>
              <option value="mic">Microphone</option>
              <option value="mixed">Mixed system + mic</option>
            </select>
          </label>

          <label className="field">
            <span>System source</span>
            <select
              value={systemSourceId}
              onChange={(event) => setSystemSourceId(event.target.value)}
              disabled={mode === 'mic'}
            >
              <option value="">Select system source</option>
              {systemSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Mic source</span>
            <select
              value={micSourceId}
              onChange={(event) => setMicSourceId(event.target.value)}
              disabled={mode === 'system'}
            >
              <option value="">Select microphone</option>
              {micSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
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
              <p className="muted">{segments.length} segments captured</p>
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
            {segments.length === 0 ? (
              <div className="emptyState">
                Transcript output will appear here after the first 5-second chunk is processed.
              </div>
            ) : (
              segments.map((segment) => (
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

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
    gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)',
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
    background: rgba(255, 255, 255, 0.72);
    color: #57534e;
  }

  .segmentCard {
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
