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

export interface LocalTranscribeApi {
  getSources: () => Promise<AudioSource[]>
  startCapture: (options: CaptureStartOptions) => Promise<void>
  stopCapture: () => Promise<void>
  exportTxt: () => Promise<ExportResult>
  exportSrt: () => Promise<ExportResult>
  onTranscriptSegment: (listener: (segment: TranscriptSegment) => void) => () => void
  onStatus: (listener: (status: AppStatus) => void) => () => void
  onError: (listener: (message: string) => void) => () => void
}
