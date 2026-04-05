export type AudioSourceMode = 'system' | 'mic' | 'mixed'

export interface AudioSource {
  id: string
  label: string
  isMonitor: boolean
}

export interface TranscriptSegment {
  id: string
  startMs: number
  endMs: number
  text: string
  timestamp: string
}

export interface AudioChunk {
  audio: Float32Array
  startMs: number
  endMs: number
}

export interface CaptureStartOptions {
  mode: AudioSourceMode
  systemSourceId?: string
  micSourceId?: string
  profile?: 'meeting' | 'live'
}

export type AppStatusStage =
  | 'idle'
  | 'discovering'
  | 'ready'
  | 'initializing-model'
  | 'model-ready'
  | 'capturing'
  | 'processing'
  | 'stopped'
  | 'exported'
  | 'error'

export interface AppStatus {
  stage: AppStatusStage
  detail: string
}

export interface ExportResult {
  canceled: boolean
  path?: string
}

export type TranscriptionEngine = 'whisper' | 'parakeet'

export interface TranscriptionModel {
  id: string
  name: string
  description: string
  sizeMb: number
  languages: string
  accuracy: number  // 1–5
  speed: number     // 1–5 (5 = fastest)
  recommended: boolean
  engine: TranscriptionEngine
  runtime: string
  runtimeModelName: string
  downloadManaged: boolean
  supportsGpuAcceleration: boolean
  gpuAccelerationLabel?: string
  setupHint?: string
  isDownloaded: boolean
}

export type WhisperModel = TranscriptionModel

export interface ModelDownloadProgress {
  modelId: string
  downloadedBytes: number
  totalBytes: number
  percent: number
}

export interface HistorySessionMeta {
  id: string
  label: string
  startTime: string   // ISO timestamp
  endTime: string     // ISO timestamp
  durationMs: number
  wordCount: number
  segmentCount: number
  preview: string     // first ~160 chars of transcript
  profile: 'meeting' | 'live'
  starred?: boolean
}

export type HistoryAutoDelete =
  | 'never'
  | 'keep-latest-5'
  | 'keep-latest-10'
  | 'keep-latest-20'
  | 'keep-latest-50'
  | 'older-than-7d'
  | 'older-than-30d'
  | 'older-than-90d'

export interface AppSettings {
  // General
  startHidden: boolean
  launchOnStartup: boolean
  showTrayIcon: boolean
  unloadModelAfterMinutes: number  // 0 = never, default 5
  voiceToTextShortcut: string      // Electron accelerator string
  muteWhileRecording: boolean
  // History
  historyLimit: number             // max sessions to keep, 0 = unlimited, default 5
  autoDeleteRecordings: HistoryAutoDelete
  keepStarredUntilDeleted: boolean
}

export interface HistorySession extends HistorySessionMeta {
  segments: TranscriptSegment[]
}

export interface LocalTranscribeApi {
  getSources: () => Promise<AudioSource[]>
  startCapture: (options: CaptureStartOptions) => Promise<void>
  stopCapture: () => Promise<void>
  exportTxt: () => Promise<ExportResult>
  exportSrt: () => Promise<ExportResult>
  onTranscriptSegment: (listener: (segment: TranscriptSegment) => void) => () => void
  onStatus: (listener: (status: AppStatus) => void) => () => void
  onError: (listener: (message: string) => void) => () => void
  getModels: () => Promise<TranscriptionModel[]>
  getSelectedModel: () => Promise<string | null>
  selectModel: (modelId: string) => Promise<void>
  downloadModel: (modelId: string) => Promise<void>
  cancelDownload: (modelId: string) => Promise<void>
  onModelDownloadProgress: (listener: (progress: ModelDownloadProgress) => void) => () => void
  listHistory: () => Promise<HistorySessionMeta[]>
  getHistorySession: (id: string) => Promise<HistorySession | null>
  deleteHistorySession: (id: string) => Promise<void>
  starHistorySession: (id: string, starred: boolean) => Promise<void>
  exportHistoryTxt: (id: string) => Promise<ExportResult>
  exportHistorySrt: (id: string) => Promise<ExportResult>
  onHistorySaved: (listener: (meta: HistorySessionMeta) => void) => () => void
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  platform: string
}
