import type {
  AppSettings,
  AssistantChatRequest,
  ExportResult,
  HistorySession,
  HistorySessionMeta,
  LocalTranscribeApi,
  ModelDownloadProgress,
  TranscriptionModel,
  UiFeatureFlags,
} from '../../../../src/shared/types'
import { vi } from 'vitest'

function createMockApi(overrides: Partial<LocalTranscribeApi> = {}): LocalTranscribeApi {
  const defaultUiFeatures: UiFeatureFlags = {
    enableExternalAssistant: false,
    assistantProvider: 'local',
  }
  const defaultSettings: AppSettings = {
    startHidden: false,
    launchOnStartup: false,
    showTrayIcon: true,
    unloadModelAfterMinutes: 5,
    voiceToTextShortcut: 'Control+Shift+T',
    muteWhileRecording: false,
    themeMode: 'system',
    historyLimit: 10,
    autoDeleteRecordings: 'never',
    keepStarredUntilDeleted: true,
    uiFeatures: defaultUiFeatures,
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
    regenerateHistorySummary: vi.fn().mockResolvedValue(undefined),
    ipcInvoke: vi.fn().mockImplementation(async (channel: string) => {
      if (channel === 'history:regenerateSummary') return undefined
      throw new Error(`ipcInvoke: unmocked channel ${channel}`)
    }),
    onShortcutVoiceToText: vi.fn().mockReturnValue(() => undefined),
    onHistorySaved: vi.fn().mockReturnValue(() => undefined),
    onHistorySessionUpdated: vi.fn().mockReturnValue(() => undefined),
    assistantChat: vi.fn().mockImplementation(async (_req: AssistantChatRequest) => ({ text: 'mock reply' })),
    ollamaStatus: vi.fn().mockResolvedValue({ ok: false, models: [] as string[] }),
    ollamaPull: vi.fn().mockResolvedValue(undefined),
    ollamaPullCancel: vi.fn().mockResolvedValue(undefined),
    ollamaPullState: vi.fn().mockResolvedValue(null),
    onOllamaPullProgress: vi.fn().mockReturnValue(() => undefined),
    getSettings: vi.fn().mockResolvedValue(defaultSettings),
    setSettings: vi.fn().mockImplementation(async (partial: Partial<AppSettings>) => {
      const next: AppSettings = {
        ...defaultSettings,
        ...partial,
        uiFeatures: partial.uiFeatures
          ? { ...defaultSettings.uiFeatures, ...partial.uiFeatures }
          : defaultSettings.uiFeatures,
      }
      return next
    }),
    platform: 'linux',
    e2eSeedHistoryMeeting: vi.fn().mockRejectedValue(new Error('e2eSeedHistoryMeeting not available in this test')),
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

export function baseDownloadedModelList(): TranscriptionModel[] {
  return [
    {
      id: 'base',
      name: 'Base',
      description: 'Downloaded model',
      sizeMb: 120,
      languages: 'en',
      accuracy: 4,
      speed: 4,
      recommended: true,
      engine: 'whisper' as const,
      runtime: 'node',
      runtimeModelName: 'base',
      downloadManaged: true,
      supportsGpuAcceleration: false,
      isDownloaded: true,
    },
  ]
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
