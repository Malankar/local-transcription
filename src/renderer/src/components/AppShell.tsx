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

  // Auto-navigate effect
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
                onClick={() => navigateTo(id)}
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
              onClick={() => navigateTo('settings')}
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
          {activeView === 'recording' && <RecordingHubView />}
          {activeView === 'models' && <ModelsView />}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  )
}
