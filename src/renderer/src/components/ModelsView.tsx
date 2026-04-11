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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-8">
      <div>
        <div className="mb-2 flex items-center gap-2 font-mono text-xs text-[#64748B]">
          <span>LocalTranscribe</span>
          <span className="text-white/20" aria-hidden>
            |
          </span>
          <span>Model Library</span>
        </div>
        <h1 className="font-heading mb-2 text-4xl font-bold text-white">
          Model <span className="text-gradient">Library</span>
        </h1>
        <p className="text-sm text-[#94A3B8]">Select and manage local transcription engines.</p>
      </div>

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
                'group relative flex flex-col gap-2.5 rounded-2xl border p-6 transition-all duration-300',
                isSelected
                  ? 'border-[#F7931A]/50 bg-[#0F1115] shadow-[0_0_40px_-10px_rgba(247,147,26,0.15)]'
                  : 'border-white/10 bg-[#0F1115] hover:-translate-y-0.5 hover:border-[#F7931A]/30 hover:shadow-[0_0_30px_-10px_rgba(247,147,26,0.1)]',
                (isCapturing || !!downloadingId) ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-[#94A3B8]">{model.id}</span>
                  <h3 className="font-heading mt-1 text-lg font-semibold text-white">{model.name}</h3>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {model.recommended && (
                    <span className="flex items-center gap-1 rounded-full border border-[#F7931A]/30 bg-[#F7931A]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#F7931A]">
                      Recommended
                    </span>
                  )}
                  <span className="font-mono text-xs text-[#94A3B8]">{formatSize(model.sizeMb)}</span>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-[#94A3B8]">{model.description}</p>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-16 text-xs text-[#94A3B8]">Accuracy</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#EA580C] to-[#F7931A]"
                      style={{ width: `${(model.accuracy / 5) * 100}%` }}
                    />
                  </div>
                  <span className={cn('text-xs tabular-nums', isSelected ? 'text-[#FFD600]' : 'text-[#94A3B8]')}>
                    {'★'.repeat(model.accuracy)}
                    <span className="text-white/15">{'☆'.repeat(5 - model.accuracy)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-xs text-[#94A3B8]">Speed</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#EA580C] to-[#F7931A]"
                      style={{ width: `${(model.speed / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-[#94A3B8]">
                    {'★'.repeat(model.speed)}
                    <span className="text-white/15">{'☆'.repeat(5 - model.speed)}</span>
                  </span>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-end border-t border-white/5 pt-3">
                {model.isDownloaded ? (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
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
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                  <Progress value={downloadProgress?.percent ?? 0} className="h-1" />
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {downloadProgress
                      ? `${downloadProgress.percent}% — ${formatSize(Math.round(downloadProgress.downloadedBytes / 1_048_576))} / ${formatSize(Math.round(downloadProgress.totalBytes / 1_048_576))}`
                      : 'Starting download…'}
                  </span>
                </div>
              )}

              {model.setupHint && (
                <p className="border-t border-white/5 pt-2 text-[11px] italic text-[#94A3B8]/80">
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
