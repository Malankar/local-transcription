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

type AppStatusStage =
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


export interface ModelDownloadProgress {
  modelId: string
  downloadedBytes: number
  totalBytes: number
  percent: number
}

type AssistantFieldStatus = 'pending' | 'ready' | 'error'

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
  /** Local LLM title: pending shows loader until label is filled */
  aiTitleStatus?: AssistantFieldStatus
  aiSummary?: string
  aiSummaryStatus?: AssistantFieldStatus
}

export interface OllamaStatusResult {
  ok: boolean
  error?: string
  models: string[]
}

/** Streamed from main while `ollamaPull` runs (same `model` as pull request). */
export interface OllamaPullProgress {
  model: string
  status: string
  /** 0–100 from layer bytes when Ollama sends completed/total; null if unknown */
  percent: number | null
}

interface AssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantChatRequest {
  sessionTitle: string
  transcript: string
  messages: AssistantChatMessage[]
  /** Brief reasoning section + answer (default false for older clients) */
  thinkingMode?: boolean
}

/** Strict booleans for IPC; undefined / false stay off (backward compatible). */
export function coerceAssistantChatFlags(req: AssistantChatRequest): {
  thinkingMode: boolean
} {
  return {
    thinkingMode: req.thinkingMode === true,
  }
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

export type ThemeMode = 'system' | 'light' | 'dark'

type AssistantProviderId =
  | 'local'
  | 'openai-gpt4'
  | 'openai-gpt4mini'
  | 'anthropic-sonnet'
  | 'anthropic-opus'
  | 'gemini-pro'
  | 'gemini-flash'

/** UI-only flags (ref settings modal); assistant IPC not wired yet. */
export interface UiFeatureFlags {
  enableExternalAssistant: boolean
  assistantProvider: AssistantProviderId
}

export interface AppSettings {
  // General
  startHidden: boolean
  launchOnStartup: boolean
  showTrayIcon: boolean
  unloadModelAfterMinutes: number  // 0 = never, default 5
  voiceToTextShortcut: string      // Electron accelerator string
  muteWhileRecording: boolean
  themeMode: ThemeMode
  // History
  historyLimit: number             // max sessions to keep, 0 = unlimited, default 5
  autoDeleteRecordings: HistoryAutoDelete
  keepStarredUntilDeleted: boolean
  uiFeatures: UiFeatureFlags
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
  onShortcutVoiceToText: (listener: () => void) => () => void
  getModels: () => Promise<TranscriptionModel[]>
  getSelectedModel: () => Promise<string | null>
  selectModel: (modelId: string) => Promise<void>
  downloadModel: (modelId: string) => Promise<void>
  cancelDownload: (modelId: string) => Promise<void>
  removeModel: (modelId: string) => Promise<void>
  onModelDownloadProgress: (listener: (progress: ModelDownloadProgress) => void) => () => void
  listHistory: () => Promise<HistorySessionMeta[]>
  getHistorySession: (id: string) => Promise<HistorySession | null>
  deleteHistorySession: (id: string) => Promise<void>
  starHistorySession: (id: string, starred: boolean) => Promise<void>
  exportHistoryTxt: (id: string) => Promise<ExportResult>
  exportHistorySrt: (id: string) => Promise<ExportResult>
  regenerateHistoryTitle: (sessionId: string) => Promise<void>
  regenerateHistorySummary: (sessionId: string) => Promise<void>
  /** Untyped IPC escape hatch; kept in sync with preload for channels not yet wrapped. */
  ipcInvoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  onHistorySaved: (listener: (meta: HistorySessionMeta) => void) => () => void
  onHistorySessionUpdated: (listener: (meta: HistorySessionMeta) => void) => () => void
  assistantChat: (req: AssistantChatRequest) => Promise<{ text: string }>
  ollamaStatus: () => Promise<OllamaStatusResult>
  ollamaPull: (model: string) => Promise<void>
  /** Abort in-flight `ollamaPull` (closes network stream; Ollama may still finish partial state). */
  ollamaPullCancel: () => Promise<void>
  ollamaPullState: () => Promise<OllamaPullProgress | null>
  onOllamaPullProgress: (listener: (progress: OllamaPullProgress) => void) => () => void
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  platform: string
  /**
   * E2E/dev only (requires `E2E_QUIT_ON_LAST_WINDOW` from the Playwright launcher).
   * Persists a one-segment meeting session and emits `history:saved`.
   */
  e2eSeedHistoryMeeting: (text: string) => Promise<HistorySessionMeta>
}
