import { useState } from 'react'
import type { AppSettings, HistoryAutoDelete } from '../types'
import { Switch } from './ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { cn } from '@/lib/utils'

// ── Sub-components ─────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
  disabled,
}: {
  label: string
  description?: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3.5', disabled && 'opacity-50')}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground leading-none">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground leading-snug mt-1">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-primary/70">
      {children}
    </p>
  )
}

const UNLOAD_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'Never' },
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
]

const AUTO_DELETE_OPTIONS: { value: HistoryAutoDelete; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'keep-latest-5', label: 'Keep latest 5' },
  { value: 'keep-latest-10', label: 'Keep latest 10' },
  { value: 'keep-latest-20', label: 'Keep latest 20' },
  { value: 'keep-latest-50', label: 'Keep latest 50' },
  { value: 'older-than-7d', label: 'Older than 7 days' },
  { value: 'older-than-30d', label: 'Older than 30 days' },
  { value: 'older-than-90d', label: 'Older than 90 days' },
]

const HISTORY_LIMIT_OPTIONS = [
  { value: '0', label: 'Unlimited' },
  { value: '5', label: '5 sessions' },
  { value: '10', label: '10 sessions' },
  { value: '25', label: '25 sessions' },
  { value: '50', label: '50 sessions' },
  { value: '100', label: '100 sessions' },
]

// ── Main component ─────────────────────────────────────────────────────────

export interface SettingsViewProps {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
  isSaving: boolean
}

export function SettingsView({ settings, onUpdate, isSaving }: SettingsViewProps) {
  const [shortcutInput, setShortcutInput] = useState(settings.voiceToTextShortcut)
  const [shortcutEditing, setShortcutEditing] = useState(false)
  const [trayRestartNeeded, setTrayRestartNeeded] = useState(false)
  const isLinux = window.api.platform === 'linux'

  function handleShortcutKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault()
    e.stopPropagation()

    const parts: string[] = []
    if (e.ctrlKey) parts.push('Control')
    if (e.metaKey) parts.push('Meta')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

    const key = e.key
    if (key && !['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key)
      const accelerator = parts.join('+')
      setShortcutInput(accelerator)
      onUpdate({ voiceToTextShortcut: accelerator })
      setShortcutEditing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground mb-1.5">
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure application behaviour and history management.
        </p>
      </div>

      {/* ── General ── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-0">
          <SectionLabel>General</SectionLabel>
        </div>
        <div className="px-4 divide-y divide-border/60">

          <SettingRow
            label="Start hidden"
            description="Launch minimised to the tray instead of showing the window."
          >
            <Switch
              checked={settings.startHidden}
              onCheckedChange={(v) => onUpdate({ startHidden: v })}
              disabled={isSaving}
            />
          </SettingRow>

          <SettingRow
            label="Launch on startup"
            description="Automatically start LocalTranscribe when you log in."
          >
            <Switch
              checked={settings.launchOnStartup}
              onCheckedChange={(v) => onUpdate({ launchOnStartup: v })}
              disabled={isSaving}
            />
          </SettingRow>

          <SettingRow
            label="Show tray icon"
            description="Display an icon in the system tray for quick access."
          >
            <div className="flex flex-col items-end gap-1">
              <Switch
                checked={settings.showTrayIcon}
                onCheckedChange={(v) => {
                  onUpdate({ showTrayIcon: v })
                  if (isLinux) setTrayRestartNeeded(true)
                }}
                disabled={isSaving || (isLinux && trayRestartNeeded)}
              />
              {isLinux && trayRestartNeeded && (
                <span className="text-[10px] text-amber-500 leading-none">Restart to apply</span>
              )}
            </div>
          </SettingRow>

          <SettingRow
            label="Unload model after idle"
            description="Release the Whisper model from memory after the specified idle period."
          >
            <Select
              value={String(settings.unloadModelAfterMinutes)}
              onValueChange={(v) => onUpdate({ unloadModelAfterMinutes: Number(v) })}
              disabled={isSaving}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNLOAD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            label="Voice-to-text shortcut"
            description="Global keyboard shortcut to start / stop recording from anywhere."
          >
            <div className="relative">
              <input
                className={cn(
                  'h-8 w-44 rounded-md border bg-background px-3 text-xs font-mono text-foreground outline-none transition-colors',
                  shortcutEditing
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-input hover:border-border',
                )}
                readOnly
                value={shortcutEditing ? 'Press keys…' : shortcutInput}
                onFocus={() => setShortcutEditing(true)}
                onBlur={() => setShortcutEditing(false)}
                onKeyDown={handleShortcutKeyDown}
              />
              {!shortcutEditing && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 pointer-events-none select-none">
                  edit
                </span>
              )}
            </div>
          </SettingRow>

          <SettingRow
            label="Mute while recording"
            description="Automatically mute system audio output during capture."
          >
            <Switch
              checked={settings.muteWhileRecording}
              onCheckedChange={(v) => onUpdate({ muteWhileRecording: v })}
              disabled={isSaving}
            />
          </SettingRow>

        </div>
        <div className="px-4 pb-4" />
      </section>

      {/* ── History ── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-0">
          <SectionLabel>History</SectionLabel>
        </div>
        <div className="px-4 divide-y divide-border/60">

          <SettingRow
            label="Session limit"
            description="Maximum number of recording sessions to keep on disk."
          >
            <Select
              value={String(settings.historyLimit)}
              onValueChange={(v) => onUpdate({ historyLimit: Number(v) })}
              disabled={isSaving}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HISTORY_LIMIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            label="Auto-delete recordings"
            description="Automatically remove old recordings according to this policy."
          >
            <Select
              value={settings.autoDeleteRecordings}
              onValueChange={(v) => onUpdate({ autoDeleteRecordings: v as HistoryAutoDelete })}
              disabled={isSaving}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_DELETE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            label="Keep starred recordings"
            description="Starred sessions are exempt from auto-delete and the session limit."
          >
            <Switch
              checked={settings.keepStarredUntilDeleted}
              onCheckedChange={(v) => onUpdate({ keepStarredUntilDeleted: v })}
              disabled={isSaving}
            />
          </SettingRow>

        </div>
        <div className="px-4 pb-4" />
      </section>

      {isSaving && (
        <p className="text-[11px] text-muted-foreground text-center">Saving…</p>
      )}
    </div>
  )
}
