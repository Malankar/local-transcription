import { useEffect } from 'react'
import { useNavigationContext, type View } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'
import { useTranscriptContext } from '../contexts/TranscriptContext'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import RecordingHubView from './RecordingHubView'
import { ModelsView } from './ModelsView'
import { HistoryView } from './HistoryView'
import { SettingsView } from './SettingsView'

// ── Icon ────────────────────────────────────────────────────────────────────

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

// ── Nav items ────────────────────────────────────────────────────────────────

const navItems = [
  { id: 'recording' as View, label: 'Transcribe', icon: 'mic' },
  { id: 'models' as View, label: 'Models', icon: 'memory' },
  { id: 'history' as View, label: 'History', icon: 'history' },
  { id: 'settings' as View, label: 'Settings', icon: 'settings' },
]

// ── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const { activeView, recordingSubView, navigateTo } = useNavigationContext()
  const { isCapturing, status, captureProfile } = useRecordingContext()
  const { meetingSegments } = useTranscriptContext()

  useEffect(() => {
    if (isCapturing) { navigateTo('recording'); return }
    if (!isCapturing && (status.stage === 'stopped' || status.stage === 'error')
        && meetingSegments.length > 0 && captureProfile === 'meeting') {
      navigateTo('history')
    }
  }, [isCapturing, status.stage, meetingSegments.length, captureProfile])

  const topBarSectionLabel: Record<View, string> = {
    recording: recordingSubView === 'live' ? 'Live Transcription' : 'Meeting Recording',
    models: 'Model Library',
    history: 'Session History',
    settings: 'Settings',
  }

  function handleNewTranscription() {
    navigateTo('recording')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          'z-40 flex h-screen w-[220px] min-w-[220px] flex-col justify-between',
          'border-r border-white/10 bg-sidebar/95 backdrop-blur-xl',
        )}
      >
        <div className="flex flex-col gap-5 p-4 pt-5">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                'bg-gradient-to-br from-[#EA580C] to-[#F7931A] text-white shadow-glow-orange',
              )}
            >
              <Icon name="graphic_eq" filled size={15} />
            </div>
            <div>
              <h1 className="font-heading text-[13px] font-semibold leading-none tracking-tight text-foreground">
                LocalTranscribe
              </h1>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                V0.1 Alpha
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-1.5 border-white/15 text-xs font-medium normal-case tracking-normal"
            onClick={handleNewTranscription}
          >
            <Icon name="add" size={13} />
            New Transcription
          </Button>

          <nav className="flex flex-col gap-1" aria-label="Primary">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigateTo(id)}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-all duration-300',
                  activeView === id
                    ? 'border border-primary/40 bg-white/[0.06] text-foreground shadow-[0_0_24px_-10px_rgba(247,147,26,0.35)]'
                    : 'border border-transparent text-sidebar-foreground hover:border-white/10 hover:bg-white/[0.04] hover:text-foreground',
                )}
              >
                <span className={cn(activeView === id && 'text-[#F7931A]')}>
                  <Icon name={icon} filled={activeView === id} size={16} />
                </span>
                {label}
                {id === 'recording' && isCapturing && (
                  <span className="relative ml-auto flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
            <Icon name="verified_user" filled size={11} />
            <span>Local Only</span>
            <span className="mx-0.5 h-1 w-1 rounded-full bg-white/20" />
            <Icon name="cloud_off" size={11} />
            <span>No Cloud</span>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-grid-void opacity-[0.35]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#F7931A]/[0.07] blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[#FFD600]/[0.05] blur-[140px]"
          aria-hidden
        />

        <header
          className={cn(
            'relative z-10 flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-5',
            'bg-background/80 backdrop-blur-md',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="font-heading text-[13px] font-semibold tracking-tight">LocalTranscribe</span>
            <div className="h-3.5 w-px bg-white/15" />
            <span className="font-mono text-xs text-muted-foreground">{topBarSectionLabel[activeView]}</span>
            {isCapturing && (
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-950/40 px-2.5 py-1',
                  'text-[11px] font-medium text-red-200',
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                Recording
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-[#F7931A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Settings"
              onClick={() => navigateTo('settings')}
            >
              <Icon name="settings" size={16} />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Close"
              onClick={() => window.close()}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="relative z-10 flex-1 overflow-auto">
          {activeView === 'recording' && <RecordingHubView />}
          {activeView === 'models' && <ModelsView />}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  )
}
