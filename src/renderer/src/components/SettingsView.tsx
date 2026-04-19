import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

import type { AssistantProviderId, HistoryAutoDelete, OllamaPullProgress, OllamaStatusResult } from '../types'
import {
  ASSISTANT_OLLAMA_MODEL_CHAT,
  ASSISTANT_OLLAMA_MODEL_TITLE,
  ASSISTANT_OLLAMA_MODELS_TO_PULL,
} from '../../../shared/assistantModels'
import { useSettingsContext } from '../contexts/SettingsContext'
import { ModelLibrarySection } from './ModelsView'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
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
        'flex items-start justify-between gap-4 px-6 py-5 transition-colors hover:bg-muted/30',
        disabled && 'opacity-50',
      )}
    >
      <div className="min-w-0 pr-4">
        <h3 className="mb-0.5 text-sm font-medium text-foreground">{label}</h3>
        {description && <p className="text-sm leading-snug text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h2>
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

function ollamaHasModel(installed: Set<string>, id: string): boolean {
  if (installed.has(id)) return true
  for (const n of installed) {
    if (n === id || n.startsWith(`${id}:`)) return true
  }
  return false
}

function OllamaLocalAssistantCard() {
  const [status, setStatus] = useState<OllamaStatusResult | null>(null)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pullingRef = useRef<string | null>(null)

  useEffect(() => {
    pullingRef.current = pulling
  }, [pulling])

  useEffect(() => {
    return window.api.onOllamaPullProgress((p) => {
      if (pullingRef.current !== p.model) return
      setPullProgress(p)
    })
  }, [])

  function refresh(): void {
    void window.api
      .ollamaStatus()
      .then((s) => {
        setStatus(s)
        setError(null)
      })
      .catch((e) => {
        setStatus({ ok: false, models: [] })
        setError(e instanceof Error ? e.message : String(e))
      })
  }

  useEffect(() => {
    refresh()
  }, [])

  async function pullModel(model: string): Promise<void> {
    setError(null)
    setPulling(model)
    setPullProgress({ model, status: 'Starting…', percent: null })
    try {
      await window.api.ollamaPull(model)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPulling(null)
      setPullProgress(null)
    }
  }

  function cancelPull(): void {
    void window.api.ollamaPullCancel()
  }

  const names = new Set(status?.models ?? [])

  return (
    <div className="px-6 py-5">
      <h3 className="mb-2 text-sm font-medium text-foreground">Ollama models (assistant)</h3>
      <p className="mb-3 text-sm leading-snug text-muted-foreground">
        Titles use <span className="font-mono">{ASSISTANT_OLLAMA_MODEL_TITLE}</span>; summaries and Library chat use{' '}
        <span className="font-mono">{ASSISTANT_OLLAMA_MODEL_CHAT}</span> (no per-task picker in the app). Install{' '}
        <a href="https://ollama.com/download" className="font-medium underline underline-offset-2" target="_blank" rel="noreferrer">
          Ollama
        </a>{' '}
        and pull weights here (default server <span className="font-mono">127.0.0.1:11434</span>).
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-foreground">Status:</span>
        {status === null ? (
          <span className="text-muted-foreground">Checking…</span>
        ) : status.ok ? (
          <span className="text-green-600">Reachable</span>
        ) : (
          <span className="text-amber-600">
            Not reachable{status.error ? ` (${status.error})` : ''}
          </span>
        )}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => refresh()}>
          Refresh
        </Button>
      </div>
      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}
      <ul className="space-y-2">
        {ASSISTANT_OLLAMA_MODELS_TO_PULL.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <span className="font-mono text-xs">{m.id}</span>
              <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
              {ollamaHasModel(names, m.id) ? (
                <span className="ml-2 text-xs text-green-600">on disk</span>
              ) : null}
            </div>
            {pulling === m.id ? (
              <div className="flex w-full min-w-0 flex-col gap-1.5 sm:max-w-md sm:flex-1">
                <div className="flex items-center gap-2">
                  {pullProgress?.percent != null ? (
                    <Progress value={pullProgress.percent} className="h-2 flex-1" />
                  ) : (
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5 shadow-inner">
                      <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-[#EA580C]/45 to-[#F7931A]/45" />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={cancelPull}
                    aria-label="Stop pull"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
                <p className="truncate text-xs text-muted-foreground" title={pullProgress?.status ?? ''}>
                  {pullProgress?.status ?? 'Pulling…'}
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 shrink-0 text-xs sm:self-center"
                disabled={pulling !== null}
                onClick={() => void pullModel(m.id)}
              >
                Pull
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

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
  const surfaceCard = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-card'
  const selectTriggerClass = 'h-10 min-w-[140px] border-input bg-background text-xs text-foreground'

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
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Preferences
              </p>
              <h1 className="font-heading mb-2 text-4xl font-bold tracking-tight text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure application behaviour and history management.
              </p>
            </div>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-muted text-foreground">
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
        <div className={surfaceCard}>
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
              <SelectTrigger className={cn(selectTriggerClass, 'min-w-[140px]')}>
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
                  'flex h-10 items-center rounded-xl border border-input bg-background px-4 font-mono text-sm text-foreground outline-none transition-colors',
                  shortcutEditing ? 'ring-1 ring-ring' : 'hover:border-muted-foreground/30',
                )}
              >
                <input
                  className="min-w-[10rem] flex-1 bg-transparent text-sm font-mono text-foreground outline-none"
                  readOnly
                  value={shortcutEditing ? 'Press keys…' : shortcutInput}
                  onFocus={() => setShortcutEditing(true)}
                  onBlur={() => setShortcutEditing(false)}
                  onKeyDown={handleShortcutKeyDown}
                />
              </div>
              {!shortcutEditing && <span className="text-xs text-muted-foreground">edit</span>}
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

      {/* ── Transcription models ── */}
      <section>
        <SectionLabel>Transcription models</SectionLabel>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start gap-4 border-b border-border bg-muted/15 px-5 py-4 sm:px-6 sm:py-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-foreground">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 22,
                  fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
                  userSelect: 'none',
                  lineHeight: 1,
                }}
                aria-hidden
              >
                graphic_eq
              </span>
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">Whisper weights</h2>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                Pick one engine for local transcription. Next recording uses your selection after download finishes.
              </p>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <ModelLibrarySection layout="settings" />
          </div>
        </div>
      </section>

      {/* ── History ── */}
      <section>
        <SectionLabel>History</SectionLabel>
        <div className={surfaceCard}>
          <SettingRow
            label="Session limit"
            description="Maximum number of recording sessions to keep on disk."
          >
            <Select
              value={String(settings.historyLimit)}
              onValueChange={(v) => updateSettings({ historyLimit: Number(v) })}
              disabled={settingsSaving}
            >
              <SelectTrigger className={cn(selectTriggerClass, 'min-w-[140px]')}>
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
              <SelectTrigger className={cn(selectTriggerClass, 'min-w-[160px]')}>
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
        <div className={surfaceCard}>
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
              <SelectTrigger className={cn(selectTriggerClass, 'min-w-[180px]')}>
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

          <OllamaLocalAssistantCard />
        </div>
      </section>

      {settingsSaving && <p className="text-center text-[11px] text-muted-foreground">Saving…</p>}
      </div>
    </div>
  )
}
