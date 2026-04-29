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

interface ModelLibrarySectionProps {
  /** When true, shows the standalone page heading (for tests / legacy full-page view). */
  showLibraryHeading?: boolean
  /** `settings` = compact list for Settings sheet; `gallery` = card grid (default). */
  layout?: ModelLibraryLayout
}

function ModelMeterRow({
  label,
  value,
  highlight,
  variant = 'gallery',
}: {
  label: string
  value: number
  highlight?: boolean
  variant?: 'gallery' | 'picker'
}) {
  const barFillClass =
    variant === 'picker'
      ? 'h-full rounded-full bg-[var(--model-pick-orange)]'
      : 'h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500'

  const stars =
    variant === 'picker' ? (
      <span className="flex shrink-0 gap-px" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'text-[12px] leading-none tracking-tighter',
              i < value ? 'text-foreground/82' : 'text-muted-foreground/28',
            )}
          >
            ★
          </span>
        ))}
      </span>
    ) : (
      <span
        className={cn(
          'shrink-0 text-[11px] tabular-nums',
          highlight ? 'text-amber-700' : 'text-muted-foreground',
        )}
        aria-hidden
      >
        {'★'.repeat(value)}
        <span className="text-muted-foreground/35">{'☆'.repeat(5 - value)}</span>
      </span>
    )

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="w-[4.5rem] shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/90">
        <div className={barFillClass} style={{ width: `${(value / 5) * 100}%` }} />
      </div>
      <span className="sr-only">
        {label} rating {value} of 5
      </span>
      {stars}
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
    layout === 'settings'
      ? 'model-pick-root flex flex-col gap-3'
      : 'grid grid-cols-1 gap-4 md:grid-cols-2'

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
                data-testid={`model-card-${model.id}`}
                className={cn(
                  'model-pick-card relative overflow-hidden border text-left outline-none transition-all duration-200',
                  'focus-visible:ring-2 focus-visible:ring-[var(--model-pick-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isSelected
                    ? 'border-orange-400/35 bg-gradient-to-br from-orange-500/[0.06] to-transparent shadow-sm ring-1 ring-orange-400/20 dark:border-amber-500/30 dark:from-amber-500/[0.07]'
                    : 'border-border/80 bg-card hover:-translate-y-px hover:border-muted-foreground/30 hover:bg-muted/15 hover:shadow-sm',
                  listDisabled ? 'cursor-default opacity-80' : 'cursor-pointer',
                )}
              >
                {isSelected ? (
                  <span className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-[var(--model-pick-orange)]" aria-hidden />
                ) : null}

                <div className="flex gap-3.5 px-4 py-4 sm:gap-4 sm:px-5 sm:py-[1.125rem]">
                  <span
                    className={cn(
                      'mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                      isSelected
                        ? 'border-[var(--model-pick-orange)] bg-[var(--model-pick-orange)]/10'
                        : 'border-muted-foreground/35 bg-background',
                    )}
                    aria-hidden
                  >
                    {isSelected ? (
                      <span className="h-[7px] w-[7px] rounded-full bg-[var(--model-pick-orange)] shadow-[0_0_5px_var(--model-pick-orange)]" />
                    ) : null}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <h3 className="model-pick-title min-w-0 flex-1 text-[1rem] font-semibold leading-snug tracking-tight text-foreground sm:text-[1.04rem]">
                          {model.name}
                          {isSelected ? <span className="sr-only"> — active model</span> : null}
                        </h3>
                        <div className="flex shrink-0 items-center gap-2">
                          {model.recommended ? (
                            <Badge
                              variant="secondary"
                              className="rounded-full border-orange-400/40 bg-orange-100/90 px-2.5 py-0 text-[9.5px] font-semibold uppercase tracking-wider text-orange-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-100"
                            >
                              Recommended
                            </Badge>
                          ) : null}
                          <span className="rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                            {formatSize(model.sizeMb)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-0.5 font-mono text-[10.5px] leading-none text-muted-foreground/60">{model.id}</p>
                      <p className="mt-2 line-clamp-2 text-[0.8rem] leading-relaxed text-muted-foreground">
                        {model.description}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <ModelMeterRow label="Accuracy" value={model.accuracy} highlight={isSelected} variant="picker" />
                      <ModelMeterRow label="Speed" value={model.speed} variant="picker" />
                    </div>

                    <div className="flex min-h-[2rem] flex-wrap items-center justify-end gap-2">
                      {model.isDownloaded ? (
                        <>
                          <span className="mr-auto flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 dark:ring-emerald-400/25" />
                            Ready
                          </span>
                          {model.downloadManaged ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 rounded-lg px-2.5 text-[11px] text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                              onClick={(e) => {
                                e.stopPropagation()
                                void onRemoveModel(model.id)
                              }}
                              disabled={isCapturing}
                              title={isCapturing ? 'Stop capture before removing a model' : 'Delete downloaded weights from disk'}
                            >
                              <Icon name="delete_forever" size={12} />
                              Remove
                            </Button>
                          ) : null}
                        </>
                      ) : isDownloading ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-lg border-border/80 px-3 text-[11px] shadow-none"
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
                          className="h-7 gap-1.5 rounded-lg border-border/80 px-3 text-[11px] font-medium shadow-none hover:border-orange-400/50 hover:bg-orange-50/60 hover:text-orange-700 dark:hover:bg-orange-950/20 dark:hover:text-orange-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDownload(model.id)
                          }}
                          disabled={!!downloadingId || isCapturing}
                        >
                          <Icon name="download" size={13} />
                          Download
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">Auto</span>
                      )}
                    </div>

                    {isDownloading ? (
                      <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/25 px-3 py-2">
                        <Progress value={downloadProgress?.percent ?? 0} className="h-1" />
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {downloadProgress
                            ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                            : 'Starting download…'}
                        </span>
                      </div>
                    ) : null}

                    {model.setupHint ? (
                      <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-2.5 py-2 text-[11px] italic leading-snug text-muted-foreground">
                        {model.setupHint}
                      </p>
                    ) : null}
                  </div>
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
