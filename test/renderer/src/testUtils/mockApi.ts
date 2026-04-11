import type {
  AppSettings,
  ExportResult,
  HistorySession,
  HistorySessionMeta,
  LocalTranscribeApi,
  ModelDownloadProgress,
  TranscriptionModel,
} from '../../../../src/shared/types'
import { vi } from 'vitest'

export function createMockApi(overrides: Partial<LocalTranscribeApi> = {}): LocalTranscribeApi {
  const defaultSettings: AppSettings = {
    startHidden: false,
    launchOnStartup: false,
    showTrayIcon: true,
    unloadModelAfterMinutes: 5,
    voiceToTextShortcut: 'Control+Shift+T',
    muteWhileRecording: false,
    historyLimit: 10,
    autoDeleteRecordings: 'never',
    keepStarredUntilDeleted: true,
  }

  const exportResult: ExportResult = { canceled: false, path: '/tmp/transcript.txt' }
  const defaultHistory: HistorySessionMeta[] = []
  const defaultModels: TranscriptionModel[] = []

  return {
    getSources: vi.fn().mockResolvedValue([]),
    startCapture: vi.fn().mockResolvedValue(undefined),
    stopCapture: vi.fn().mockResolvedValue(undefined),
    exportTxt: vi.fn().mockResolvedValue(exportResult),
    exportSrt: vi.fn().mockResolvedValue(exportResult),
    onTranscriptSegment: vi.fn().mockReturnValue(() => undefined),
    onStatus: vi.fn().mockReturnValue(() => undefined),
    onError: vi.fn().mockReturnValue(() => undefined),
    getModels: vi.fn().mockResolvedValue(defaultModels),
    getSelectedModel: vi.fn().mockResolvedValue(null),
    selectModel: vi.fn().mockResolvedValue(undefined),
    downloadModel: vi.fn().mockResolvedValue(undefined),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
    onModelDownloadProgress: vi.fn().mockReturnValue(() => undefined),
    listHistory: vi.fn().mockResolvedValue(defaultHistory),
    getHistorySession: vi.fn().mockResolvedValue(null as HistorySession | null),
    deleteHistorySession: vi.fn().mockResolvedValue(undefined),
    starHistorySession: vi.fn().mockResolvedValue(undefined),
    exportHistoryTxt: vi.fn().mockResolvedValue(exportResult),
    exportHistorySrt: vi.fn().mockResolvedValue(exportResult),
    onHistorySaved: vi.fn().mockReturnValue(() => undefined),
    getSettings: vi.fn().mockResolvedValue(defaultSettings),
    setSettings: vi.fn().mockImplementation(async (partial: Partial<AppSettings>) => ({
      ...defaultSettings,
      ...partial,
    })),
    platform: 'linux',
    ...overrides,
  }
}

export function installMockApi(overrides: Partial<LocalTranscribeApi> = {}): LocalTranscribeApi {
  const api = createMockApi(overrides)
  Object.defineProperty(window, 'api', {
    value: api,
    configurable: true,
    writable: true,
  })
  return api
}

export function makeDownloadProgress(overrides: Partial<ModelDownloadProgress> = {}): ModelDownloadProgress {
  return {
    modelId: 'base.en',
    downloadedBytes: 50,
    totalBytes: 100,
    percent: 50,
    ...overrides,
  }
}
