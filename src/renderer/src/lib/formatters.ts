import type { TranscriptionModel } from '../types'

export type CaptureProfile = 'meeting' | 'live'

export type CaptureProfileAppearance = {
  label: string
  icon: string
  accentDotClass: string
  iconWrapClass: string
  cardClass: string
  cardSelectedClass: string
}

export function formatClock(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

export function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function getLiveCaptionHint(model: TranscriptionModel | null): string {
  if (!model) return 'Live captions typically appear every 3-6 seconds.'
  if (model.speed >= 4) return 'Live captions typically appear every 2-4 seconds.'
  if (model.speed === 3) return 'Live captions typically appear every 3-5 seconds.'
  return 'Live captions typically appear every 4-7 seconds.'
}

export function getCaptureProfileAppearance(profile: CaptureProfile): CaptureProfileAppearance {
  if (profile === 'live') {
    return {
      label: 'Live Transcription',
      icon: 'instant_mix',
      accentDotClass: 'bg-sky-300',
      iconWrapClass: 'border-sky-500/15 bg-sky-500/10 text-sky-200',
      cardClass:
        'border-border/70 bg-card/95 hover:border-sky-500/20 hover:bg-card',
      cardSelectedClass:
        'border-sky-500/25 bg-sky-500/10 shadow-lg shadow-black/20',
    }
  }

  return {
    label: 'Meeting Recording',
    icon: 'groups',
    accentDotClass: 'bg-primary',
    iconWrapClass: 'border-primary/15 bg-primary/10 text-primary/90',
    cardClass:
      'border-border/70 bg-card/95 hover:border-primary/20 hover:bg-card',
    cardSelectedClass:
      'border-primary/25 bg-primary/10 shadow-lg shadow-black/20',
  }
}

export function formatSessionDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (date >= todayStart) return `Today, ${time}`
  if (date >= yesterdayStart) return `Yesterday, ${time}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1_000)
  const h = Math.floor(totalSec / 3_600)
  const m = Math.floor((totalSec % 3_600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
