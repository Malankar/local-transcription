import { cn } from '@/lib/utils'
import { formatSize } from '../lib/formatters'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useModelsContext } from '../contexts/ModelsContext'
import { useRecordingContext } from '../contexts/RecordingContext'

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

export function ModelsView() {
  const {
    models,
    selectedModelId,
    downloadingId,
    downloadProgress,
    downloadError,
    selectModel: onSelectModel,
    downloadModel: onDownload,
    cancelDownload: onCancelDownload,
  } = useModelsContext()
  const { isCapturing } = useRecordingContext()

  return (
    <div className="px-8 py-6 max-w-5xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-3xl font-normal tracking-tight text-foreground mb-1.5">
          Model Library
        </h2>
        <p className="text-sm text-muted-foreground">Select and manage local transcription engines.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {models.map((model) => {
          const isSelected = model.id === selectedModelId
          const isDownloading = model.id === downloadingId

          return (
            <div
              key={model.id}
              onClick={() => !isCapturing && !downloadingId && onSelectModel(model.id)}
              role="button"
              className={cn(
                'relative rounded-xl border p-4 flex flex-col gap-2.5 transition-all duration-150',
                isSelected
                  ? 'border-primary/40 bg-primary/10 shadow-sm shadow-primary/5'
                  : 'border-border bg-card hover:border-border/80',
                (isCapturing || !!downloadingId) ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-muted-foreground/60">{model.id}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {model.recommended && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/15 border border-primary/25 rounded-full px-2 py-0.5">
                      Recommended
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatSize(model.sizeMb)}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">{model.name}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{model.description}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground/60">Accuracy</span>
                  <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                    {'★'.repeat(model.accuracy)}{'☆'.repeat(5 - model.accuracy)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', isSelected ? 'bg-primary' : 'bg-muted-foreground/20')}
                    style={{ width: `${(model.accuracy / 5) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                <span className="text-[11px] text-muted-foreground/60">
                  Speed {'★'.repeat(model.speed)}{'☆'.repeat(5 - model.speed)}
                </span>
                {model.isDownloaded ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <Icon name="check_circle" filled size={11} />
                    Ready
                  </span>
                ) : isDownloading ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={(e) => { e.stopPropagation(); onCancelDownload() }}
                  >
                    Cancel
                  </Button>
                ) : model.downloadManaged ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={(e) => { e.stopPropagation(); onDownload(model.id) }}
                    disabled={!!downloadingId || isCapturing}
                  >
                    <Icon name="download" size={11} />
                    Download
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">Auto</span>
                )}
              </div>

              {isDownloading && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50">
                  <Progress value={downloadProgress?.percent ?? 0} className="h-1" />
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {downloadProgress
                      ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                      : 'Starting download…'}
                  </span>
                </div>
              )}

              {model.setupHint && (
                <p className="text-[11px] text-muted-foreground/60 italic border-t border-border/50 pt-2">
                  {model.setupHint}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {downloadError && (
        <Alert variant="destructive">
          <Icon name="error" filled size={15} />
          <AlertDescription>{downloadError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
