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

export interface ModelLibrarySectionProps {
  /** When true, shows the standalone page heading (for tests / legacy full-page view). */
  showLibraryHeading?: boolean
}

export function ModelLibrarySection({ showLibraryHeading = false }: ModelLibrarySectionProps) {
  const {
    models,
    selectedModelId,
    downloadingId,
    downloadProgress,
    downloadError,
    selectModel: onSelectModel,
    downloadModel: onDownload,
    cancelDownload: onCancelDownload,
    removeModel: onRemoveModel,
  } = useModelsContext()
  const { isCapturing } = useRecordingContext()

  return (
    <div className="flex w-full flex-col gap-6">
      {showLibraryHeading ? (
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>LocalTranscribe</span>
            <span className="text-border" aria-hidden>
              |
            </span>
            <span>Model Library</span>
          </div>
          <h1 className="font-heading mb-2 text-3xl font-bold tracking-tight text-foreground">
            Model <span className="text-gradient">Library</span>
          </h1>
          <p className="text-sm text-muted-foreground">Select and manage local transcription engines.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {models.map((model) => {
          const isSelected = model.id === selectedModelId
          const isDownloading = model.id === downloadingId

          return (
            <div
              key={model.id}
              onClick={() => !isCapturing && !downloadingId && onSelectModel(model.id)}
              role="button"
              className={cn(
                'group relative flex flex-col gap-2.5 rounded-2xl border p-6 transition-all duration-200',
                isSelected
                  ? 'border-foreground/25 bg-muted/50 shadow-sm'
                  : 'border-border bg-card hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-sm',
                isCapturing || !!downloadingId ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{model.id}</span>
                  <h3 className="font-heading mt-1 text-lg font-semibold text-foreground">{model.name}</h3>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {model.recommended && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-800">
                      Recommended
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{formatSize(model.sizeMb)}</span>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">{model.description}</p>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-16 text-xs text-muted-foreground">Accuracy</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500"
                      style={{ width: `${(model.accuracy / 5) * 100}%` }}
                    />
                  </div>
                  <span className={cn('text-xs tabular-nums', isSelected ? 'text-amber-700' : 'text-muted-foreground')}>
                    {'★'.repeat(model.accuracy)}
                    <span className="text-muted-foreground/35">{'☆'.repeat(5 - model.accuracy)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-xs text-muted-foreground">Speed</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500"
                      style={{ width: `${(model.speed / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {'★'.repeat(model.speed)}
                    <span className="text-muted-foreground/35">{'☆'.repeat(5 - model.speed)}</span>
                  </span>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-3">
                {model.isDownloaded ? (
                  <>
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      Ready
                    </span>
                    {model.downloadManaged && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          void onRemoveModel(model.id)
                        }}
                        disabled={isCapturing}
                        title={isCapturing ? 'Stop capture before removing a model' : 'Delete downloaded weights from disk'}
                      >
                        <Icon name="delete_forever" size={11} />
                        Remove
                      </Button>
                    )}
                  </>
                ) : isDownloading ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCancelDownload()
                    }}
                  >
                    Cancel
                  </Button>
                ) : model.downloadManaged ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDownload(model.id)
                    }}
                    disabled={!!downloadingId || isCapturing}
                  >
                    <Icon name="download" size={11} />
                    Download
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground/70">Auto</span>
                )}
              </div>

              {isDownloading && (
                <div className="flex flex-col gap-1.5 border-t border-border pt-2">
                  <Progress value={downloadProgress?.percent ?? 0} className="h-1" />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {downloadProgress
                      ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                      : 'Starting download…'}
                  </span>
                </div>
              )}

              {model.setupHint && (
                <p className="border-t border-border pt-2 text-[11px] italic text-muted-foreground">
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

/** Full-page model library (used in tests). */
export function ModelsView() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-8 py-8">
      <ModelLibrarySection showLibraryHeading />
    </div>
  )
}
