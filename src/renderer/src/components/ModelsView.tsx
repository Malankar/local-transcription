import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { formatSize } from '../lib/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useModelsContext } from '../contexts/ModelsContext'
import { useRecordingContext } from '../contexts/RecordingContext'

type ModelLibraryLayout = 'gallery' | 'settings'

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
  /** `settings` = compact list for Settings sheet; `gallery` = card grid (default). */
  layout?: ModelLibraryLayout
}

function ModelMeterRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500"
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
      <span
        className={cn(
          'shrink-0 text-[11px] tabular-nums',
          highlight ? 'text-amber-700' : 'text-muted-foreground',
        )}
      >
        {'★'.repeat(value)}
        <span className="text-muted-foreground/35">{'☆'.repeat(5 - value)}</span>
      </span>
    </div>
  )
}

export function ModelLibrarySection({
  showLibraryHeading = false,
  layout = 'gallery',
}: ModelLibrarySectionProps) {
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
  const listDisabled = isCapturing || !!downloadingId
  const gridClass =
    layout === 'settings' ? 'flex flex-col gap-2.5' : 'grid grid-cols-1 gap-4 md:grid-cols-2'

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

      <div
        className={gridClass}
        role={layout === 'settings' ? 'radiogroup' : undefined}
        aria-label={layout === 'settings' ? 'Transcription model' : undefined}
      >
        {models.map((model) => {
          const isSelected = model.id === selectedModelId
          const isDownloading = model.id === downloadingId

          function activate(): void {
            if (!listDisabled) void onSelectModel(model.id)
          }

          function onRowKeyDown(e: KeyboardEvent): void {
            if (listDisabled) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              void onSelectModel(model.id)
            }
          }

          if (layout === 'settings') {
            return (
              <div
                key={model.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={listDisabled ? -1 : 0}
                onClick={activate}
                onKeyDown={onRowKeyDown}
                className={cn(
                  'rounded-xl border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isSelected
                    ? 'border-ring bg-muted/45 shadow-sm ring-1 ring-ring/40'
                    : 'border-border bg-card hover:border-muted-foreground/25 hover:bg-muted/20',
                  listDisabled ? 'cursor-default opacity-90' : 'cursor-pointer',
                )}
              >
                <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected ? 'border-primary bg-primary/15' : 'border-muted-foreground/35 bg-background',
                      )}
                      aria-hidden
                    >
                      {isSelected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-heading text-base font-semibold leading-tight text-foreground">
                            {model.name}
                            {isSelected ? <span className="sr-only"> — active model</span> : null}
                          </h3>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{model.id}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {model.recommended ? (
                            <Badge
                              variant="secondary"
                              className="border-amber-500/30 bg-amber-500/10 text-[10px] normal-case tracking-wide text-amber-900 dark:text-amber-100"
                            >
                              Recommended
                            </Badge>
                          ) : null}
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatSize(model.sizeMb)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted-foreground">{model.description}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pl-7 sm:pl-8">
                    <ModelMeterRow label="Accuracy" value={model.accuracy} highlight={isSelected} />
                    <ModelMeterRow label="Speed" value={model.speed} />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/80 pt-2.5">
                    {model.isDownloaded ? (
                      <>
                        <span className="mr-auto flex items-center gap-1.5 text-xs text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Ready
                        </span>
                        {model.downloadManaged ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2.5 text-[11px] text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-200"
                            onClick={(e) => {
                              e.stopPropagation()
                              void onRemoveModel(model.id)
                            }}
                            disabled={isCapturing}
                            title={
                              isCapturing ? 'Stop capture before removing a model' : 'Delete downloaded weights from disk'
                            }
                          >
                            <Icon name="delete_forever" size={11} />
                            Remove
                          </Button>
                        ) : null}
                      </>
                    ) : isDownloading ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCancelDownload()
                        }}
                      >
                        Cancel
                      </Button>
                    ) : model.downloadManaged ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 gap-1 px-2.5 text-[11px]"
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

                  {isDownloading ? (
                    <div className="flex flex-col gap-1.5 border-t border-border/80 pt-2">
                      <Progress value={downloadProgress?.percent ?? 0} className="h-1" />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {downloadProgress
                          ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                          : 'Starting download…'}
                      </span>
                    </div>
                  ) : null}

                  {model.setupHint ? (
                    <p className="border-t border-border/80 pt-2 text-[11px] italic text-muted-foreground">
                      {model.setupHint}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          }

          return (
            <div
              key={model.id}
              onClick={activate}
              onKeyDown={onRowKeyDown}
              role="button"
              tabIndex={listDisabled ? -1 : 0}
              className={cn(
                'group relative flex flex-col gap-2.5 rounded-2xl border p-6 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isSelected
                  ? 'border-ring bg-muted/45 shadow-sm ring-1 ring-ring/50'
                  : 'border-border bg-card hover:-translate-y-0.5 hover:border-muted-foreground/20 hover:shadow-sm',
                listDisabled ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{model.id}</span>
                  <h3 className="font-heading mt-1 text-lg font-semibold text-foreground">{model.name}</h3>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {model.recommended && (
                    <Badge
                      variant="secondary"
                      className="border-amber-500/30 bg-amber-500/10 text-[10px] normal-case tracking-wide text-amber-900 dark:text-amber-100"
                    >
                      Recommended
                    </Badge>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{formatSize(model.sizeMb)}</span>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">{model.description}</p>

              <div className="space-y-3">
                <ModelMeterRow label="Accuracy" value={model.accuracy} highlight={isSelected} />
                <ModelMeterRow label="Speed" value={model.speed} />
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
                        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-200"
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
