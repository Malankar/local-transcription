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

function DeviceSelect({
  label,
  value,
  onChange,
  sources,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  sources: AudioSource[]
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 min-w-0 gap-2 text-sm">
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
    refreshSources,
  } = useRecordingContext()

  const sourceModes: { id: AudioSourceMode; icon: string; label: string }[] = [
    { id: 'system', icon: 'computer', label: 'System' },
    { id: 'mic', icon: 'mic', label: 'Mic' },
    { id: 'mixed', icon: 'library_music', label: 'Mixed' },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-nowrap items-end gap-3 overflow-x-auto pb-0.5 sm:gap-4">
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Audio Input
          </span>
          <div className="inline-flex gap-0.5 rounded-md border border-border bg-muted p-1">
            {sourceModes.map(({ id, icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
                  mode === id
                    ? 'border border-border bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon name={icon} size={13} filled={mode === id} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {(mode === 'system' || mode === 'mixed') && (
          <div className="min-w-0 flex-1 basis-0">
            <DeviceSelect
              label="System Source"
              value={systemSourceId}
              onChange={setSystemSourceId}
              sources={systemSources}
              placeholder="Select system source"
            />
          </div>
        )}
        {(mode === 'mic' || mode === 'mixed') && (
          <div className="min-w-0 flex-1 basis-0">
            <DeviceSelect
              label="Microphone"
              value={micSourceId}
              onChange={setMicSourceId}
              sources={micSources}
              placeholder="Select microphone"
            />
          </div>
        )}

        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Devices
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-10 shrink-0 p-0"
            onClick={() => void refreshSources()}
            disabled={isBusy}
            title="Refresh audio sources"
          >
            <Icon name="refresh" size={16} />
          </Button>
        </div>
      </div>

      {errorMessage && (
        <Alert variant="destructive" className="py-2">
          <Icon name="error" filled size={13} />
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
