import { Blend, Mic, Volume2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { AudioSource, AudioSourceMode } from '../../types'
import { useRecordingContext } from '../../contexts/RecordingContext'

function DeviceSelect({
  label,
  value,
  onChange,
  sources,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  sources: AudioSource[]
  placeholder: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-10 w-full min-w-0 gap-2 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const sourceModes: {
  id: AudioSourceMode
  label: string
  description: string
  Icon: typeof Mic
}[] = [
  { id: 'mic', label: 'Microphone', description: 'Mic only', Icon: Mic },
  { id: 'system', label: 'System Audio', description: 'Audio only', Icon: Volume2 },
  { id: 'mixed', label: 'Mix', description: 'Mic + Audio', Icon: Blend },
]

export function RecordingSourceControls() {
  const {
    mode,
    setMode,
    systemSources,
    micSources,
    systemSourceId,
    setSystemSourceId,
    micSourceId,
    setMicSourceId,
    errorMessage,
    isBusy,
    isCapturing,
    refreshSources,
  } = useRecordingContext()

  const sourcesLocked = isCapturing || isBusy

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <span className="mb-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Source type
        </span>
        <div className="space-y-3">
          {sourceModes.map(({ id, label, description, Icon }) => {
            const selected = mode === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                disabled={sourcesLocked}
                className={cn(
                  'flex w-full items-center gap-4 rounded-lg border-2 p-3 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
                  selected
                    ? 'border-primary bg-primary/5 dark:bg-accent dark:border-foreground/30'
                    : 'border-border bg-background hover:border-primary/50 dark:bg-transparent',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                {selected ? <div className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        {(mode === 'system' || mode === 'mixed') && (
          <DeviceSelect
            label="System audio device"
            value={systemSourceId}
            onChange={setSystemSourceId}
            sources={systemSources}
            placeholder="Select system source"
            disabled={sourcesLocked}
          />
        )}
        {(mode === 'mic' || mode === 'mixed') && (
          <DeviceSelect
            label="Microphone device"
            value={micSourceId}
            onChange={setMicSourceId}
            sources={micSources}
            placeholder="Select microphone"
            disabled={sourcesLocked}
          />
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => void refreshSources()}
          disabled={sourcesLocked}
          title="Refresh audio sources"
        >
          <span
            className="material-symbols-outlined text-base leading-none"
            style={{
              fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
            }}
          >
            refresh
          </span>
          Refresh devices
        </Button>
      </div>

      {errorMessage ? (
        <Alert variant="destructive" className="py-2">
          <span
            className="material-symbols-outlined text-sm leading-none"
            style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          >
            error
          </span>
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
