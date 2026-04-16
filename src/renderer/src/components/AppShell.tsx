import { useEffect } from 'react'
import { useNavigationContext, type View } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'
import { useTranscriptContext } from '../contexts/TranscriptContext'
import { cn } from '@/lib/utils'
import RecordingHubView from './RecordingHubView'
import { ModelsView } from './ModelsView'
import { HistoryView } from './HistoryView'
import { HistorySidebarArchive } from './HistorySidebarArchive'
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
  const { activeView, navigateTo } = useNavigationContext()
  const { isCapturing, status } = useRecordingContext()
  const { meetingSegments } = useTranscriptContext()

  useEffect(() => {
    if (isCapturing) { navigateTo('recording'); return }
    if (!isCapturing && (status.stage === 'stopped' || status.stage === 'error')
        && meetingSegments.length > 0) {
      navigateTo('history')
    }
  }, [isCapturing, status.stage, meetingSegments.length])

  const topBarSectionLabel: Record<View, string> = {
    recording: 'Meeting Recording',
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
          'z-40 flex h-screen flex-col overflow-hidden border-r border-white/10',
          activeView === 'history' ? 'w-[288px] min-w-[288px] bg-[#0A0A0B]' : 'w-56 min-w-[224px] bg-[#0F1115]',
        )}
      >
        <div className="flex shrink-0 flex-col gap-0 border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                'bg-gradient-to-br from-[#EA580C] to-[#F7931A] text-white shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)]',
              )}
            >
              <Icon name="mic" filled size={18} />
            </div>
            <div>
              <h1 className="font-heading text-sm font-semibold leading-none tracking-tight text-white">
                LocalTranscribe
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">
                V0.1 Alpha
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 p-4">
          <button
            type="button"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#EA580C] to-[#F7931A] text-sm font-medium text-white shadow-[0_0_20px_-5px_rgba(234,88,12,0.5)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_-5px_rgba(247,147,26,0.6)]"
            onClick={handleNewTranscription}
          >
            <Icon name="add" size={16} />
            New Transcription
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <nav className="shrink-0 px-3 py-2" aria-label="Primary">
            <div className="flex flex-col gap-1">
              {navItems.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigateTo(id)}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200',
                    activeView === id
                      ? 'border border-[#F7931A]/30 bg-[#F7931A]/10 text-[#F7931A]'
                      : 'border border-transparent text-[#94A3B8] hover:bg-white/5 hover:text-white',
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
            </div>
          </nav>

          {activeView === 'history' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/10 px-2 pb-1 pt-2">
              <HistorySidebarArchive />
            </div>
          ) : (
            <div className="min-h-0 flex-1" aria-hidden />
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-500">
                <Icon name="verified_user" filled size={14} />
              </span>
              <span>Local Only</span>
            </span>
            <span className="text-white/20" aria-hidden>
              •
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="cloud_off" size={14} />
              <span>No Cloud</span>
            </span>
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
            'relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-6',
            'bg-[#0F1115]/80 backdrop-blur-md',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="font-heading text-sm font-semibold tracking-tight text-white">LocalTranscribe</span>
            <div className="h-3.5 w-px bg-white/15" />
            <span className="font-mono text-xs text-[#94A3B8]">{topBarSectionLabel[activeView]}</span>
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

        <div
          className={cn(
            'relative z-10 flex min-h-0 flex-1 flex-col',
            activeView === 'history' ? 'overflow-hidden' : 'overflow-auto',
          )}
        >
          {activeView === 'recording' && <RecordingHubView />}
          {activeView === 'models' && <ModelsView />}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  )
}
