import { useEffect, useState } from 'react'
import type { AssistantProviderId, HistoryAutoDelete } from '../types'
import { useSettingsContext } from '../contexts/SettingsContext'
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
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-6 py-5 transition-colors hover:bg-white/[0.02]',
        disabled && 'opacity-50',
      )}
    >
      <div className="min-w-0 pr-4">
        <h3 className="mb-0.5 text-sm font-medium text-white">{label}</h3>
        {description && <p className="text-sm leading-snug text-[#94A3B8]">{description}</p>}
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-[#F7931A]">
      {children}
    </h2>
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

const ASSISTANT_PROVIDER_OPTIONS: { value: AssistantProviderId; label: string }[] = [
  { value: 'local', label: 'Local (default)' },
  { value: 'openai-gpt4', label: 'OpenAI GPT-4' },
  { value: 'openai-gpt4mini', label: 'OpenAI GPT-4 Mini' },
  { value: 'anthropic-sonnet', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'anthropic-opus', label: 'Anthropic Claude 3 Opus' },
  { value: 'gemini-pro', label: 'Google Gemini Pro' },
  { value: 'gemini-flash', label: 'Google Gemini Flash' },
]

// ── Main component ─────────────────────────────────────────────────────────

export function SettingsView({ variant = 'page' }: { variant?: 'page' | 'modal' }) {
  const { settings, updateSettings, settingsSaving } = useSettingsContext()
  const [shortcutInput, setShortcutInput] = useState(settings?.voiceToTextShortcut ?? '')
  const [shortcutEditing, setShortcutEditing] = useState(false)
  const [trayRestartNeeded, setTrayRestartNeeded] = useState(false)
  const isLinux = window.api.platform === 'linux'

  useEffect(() => {
    if (!shortcutEditing) {
      setShortcutInput(settings?.voiceToTextShortcut ?? '')
    }
  }, [settings?.voiceToTextShortcut, shortcutEditing])

  if (!settings) return null

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
      updateSettings({ voiceToTextShortcut: accelerator })
      setShortcutEditing(false)
    }
  }

  const pageShell = variant === 'page'

  return (
    <div
      className={
        pageShell
          ? 'flex min-h-0 flex-1 flex-col overflow-auto p-8'
          : 'flex flex-col overflow-visible p-4 pb-6'
      }
    >
      <div className={pageShell ? 'mx-auto w-full max-w-3xl space-y-8' : 'w-full space-y-6'}>
        {pageShell ? (
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-[#F7931A]">
                Preferences
              </p>
              <h1 className="font-heading mb-2 text-4xl font-bold text-white">Settings</h1>
              <p className="text-sm text-[#94A3B8]">
                Configure application behaviour and history management.
              </p>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#F7931A]/30 bg-[#F7931A]/10 text-[#F7931A]">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 20,
                  fontVariationSettings: `'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
                  userSelect: 'none',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                settings
              </span>
            </div>
          </div>
        ) : null}

      {/* ── General ── */}
      <section>
        <SectionLabel>General</SectionLabel>
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#0F1115]">
          <SettingRow
            label="Start hidden"
            description="Launch minimised to the tray instead of showing the window."
          >
            <Switch
              checked={settings.startHidden}
              onCheckedChange={(v) => updateSettings({ startHidden: v })}
              disabled={settingsSaving}
            />
          </SettingRow>

          <SettingRow
            label="Launch on startup"
            description="Automatically start LocalTranscribe when you log in."
          >
            <Switch
              checked={settings.launchOnStartup}
              onCheckedChange={(v) => updateSettings({ launchOnStartup: v })}
              disabled={settingsSaving}
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
                  updateSettings({ showTrayIcon: v })
                  if (isLinux) setTrayRestartNeeded(true)
                }}
                disabled={settingsSaving || (isLinux && trayRestartNeeded)}
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
              onValueChange={(v) => updateSettings({ unloadModelAfterMinutes: Number(v) })}
              disabled={settingsSaving}
            >
              <SelectTrigger className="h-10 min-w-[140px] border-[#030304] bg-[#030304] text-xs text-white">
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
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-10 items-center rounded-xl border border-white/10 bg-[#030304] px-4 font-mono text-sm text-white outline-none transition-colors',
                  shortcutEditing ? 'border-[#F7931A]/50 ring-1 ring-[#F7931A]/30' : 'hover:border-white/20',
                )}
              >
                <input
                  className="min-w-[10rem] flex-1 bg-transparent text-sm font-mono text-white outline-none"
                  readOnly
                  value={shortcutEditing ? 'Press keys…' : shortcutInput}
                  onFocus={() => setShortcutEditing(true)}
                  onBlur={() => setShortcutEditing(false)}
                  onKeyDown={handleShortcutKeyDown}
                />
              </div>
              {!shortcutEditing && (
                <span className="text-xs text-[#94A3B8]">edit</span>
              )}
            </div>
          </SettingRow>

          <SettingRow
            label="Mute while recording"
            description="Automatically mute system audio output during capture."
          >
            <Switch
              checked={settings.muteWhileRecording}
              onCheckedChange={(v) => updateSettings({ muteWhileRecording: v })}
              disabled={settingsSaving}
            />
          </SettingRow>
        </div>
      </section>

      {/* ── History ── */}
      <section>
        <SectionLabel>History</SectionLabel>
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#0F1115]">
          <SettingRow
            label="Session limit"
            description="Maximum number of recording sessions to keep on disk."
          >
            <Select
              value={String(settings.historyLimit)}
              onValueChange={(v) => updateSettings({ historyLimit: Number(v) })}
              disabled={settingsSaving}
            >
              <SelectTrigger className="h-10 min-w-[140px] border-[#030304] bg-[#030304] text-xs text-white">
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
              onValueChange={(v) => updateSettings({ autoDeleteRecordings: v as HistoryAutoDelete })}
              disabled={settingsSaving}
            >
              <SelectTrigger className="h-10 min-w-[160px] border-[#030304] bg-[#030304] text-xs text-white">
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
              onCheckedChange={(v) => updateSettings({ keepStarredUntilDeleted: v })}
              disabled={settingsSaving}
            />
          </SettingRow>
        </div>
      </section>

      <section>
        <SectionLabel>Assistant &amp; integrations</SectionLabel>
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#0F1115]">
          <SettingRow
            label="Assistant provider"
            description="Reserved for a future assistant backend. Transcription stays local today."
          >
            <Select
              value={settings.uiFeatures.assistantProvider}
              onValueChange={(v) =>
                updateSettings({
                  uiFeatures: { ...settings.uiFeatures, assistantProvider: v as AssistantProviderId },
                })
              }
              disabled={settingsSaving}
            >
              <SelectTrigger className="h-10 min-w-[180px] border-[#030304] bg-[#030304] text-xs text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSISTANT_PROVIDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            label="Enable external assistant"
            description="Opt in to cloud assist when an assistant service is wired up (not available yet)."
          >
            <Switch
              checked={settings.uiFeatures.enableExternalAssistant}
              onCheckedChange={(v) =>
                updateSettings({
                  uiFeatures: { ...settings.uiFeatures, enableExternalAssistant: v },
                })
              }
              disabled={settingsSaving}
            />
          </SettingRow>

          <SettingRow
            label="Third-party integrations"
            description="Reserved for exports to external services (Notion, Drive, etc.)."
          >
            <Switch
              checked={settings.uiFeatures.enableIntegrations}
              onCheckedChange={(v) =>
                updateSettings({
                  uiFeatures: { ...settings.uiFeatures, enableIntegrations: v },
                })
              }
              disabled={settingsSaving}
            />
          </SettingRow>
        </div>
      </section>

      {settingsSaving && (
        <p className="text-center text-[11px] text-[#64748B]">Saving…</p>
      )}
      </div>
    </div>
  )
}
