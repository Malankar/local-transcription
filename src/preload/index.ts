import { contextBridge, ipcRenderer } from 'electron'

import type {
  AppSettings,
  AppStatus,
  AssistantChatRequest,
  CaptureStartOptions,
  ExportResult,
  HistorySessionMeta,
  LocalTranscribeApi,
  ModelDownloadProgress,
  TranscriptSegment,
} from '../shared/types'

const api: LocalTranscribeApi = {
  getSources: () => ipcRenderer.invoke('sources:get'),
  startCapture: (options: CaptureStartOptions) => ipcRenderer.invoke('capture:start', options),
  stopCapture: () => ipcRenderer.invoke('capture:stop'),
  exportTxt: (): Promise<ExportResult> => ipcRenderer.invoke('export:txt'),
  exportSrt: (): Promise<ExportResult> => ipcRenderer.invoke('export:srt'),
  onTranscriptSegment: (listener: (segment: TranscriptSegment) => void) =>
    subscribe('transcript:segment', listener),
  onStatus: (listener: (status: AppStatus) => void) => subscribe('status', listener),
  onError: (listener: (message: string) => void) => subscribe('capture:error', listener),
  getModels: () => ipcRenderer.invoke('models:list'),
  getSelectedModel: () => ipcRenderer.invoke('models:getSelected'),
  selectModel: (modelId: string) => ipcRenderer.invoke('models:select', modelId),
  downloadModel: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
  cancelDownload: (modelId: string) => ipcRenderer.invoke('models:cancelDownload', modelId),
  removeModel: (modelId: string) => ipcRenderer.invoke('models:remove', modelId),
  onModelDownloadProgress: (listener: (progress: ModelDownloadProgress) => void) =>
    subscribe('models:downloadProgress', listener),
  listHistory: () => ipcRenderer.invoke('history:list'),
  getHistorySession: (id: string) => ipcRenderer.invoke('history:get', id),
  deleteHistorySession: (id: string) => ipcRenderer.invoke('history:delete', id),
  starHistorySession: (id: string, starred: boolean) => ipcRenderer.invoke('history:star', id, starred),
  exportHistoryTxt: (id: string) => ipcRenderer.invoke('history:export:txt', id),
  exportHistorySrt: (id: string) => ipcRenderer.invoke('history:export:srt', id),
  regenerateHistoryTitle: (sessionId: string) =>
    ipcRenderer.invoke('history:regenerateTitle', sessionId),
  regenerateHistorySummary: (sessionId: string) =>
    ipcRenderer.invoke('history:regenerateSummary', sessionId),
  ipcInvoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  onHistorySaved: (listener: (meta: HistorySessionMeta) => void) =>
    subscribe('history:saved', listener),
  onHistorySessionUpdated: (listener: (meta: HistorySessionMeta) => void) =>
    subscribe('history:sessionUpdated', listener),
  assistantChat: (req: AssistantChatRequest) => ipcRenderer.invoke('assistant:chat', req),
  ollamaStatus: () => ipcRenderer.invoke('assistant:ollamaStatus'),
  ollamaPull: (model: string) => ipcRenderer.invoke('assistant:ollamaPull', model),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', settings),
  platform: process.platform,
  e2eSeedHistoryMeeting: (text: string) => ipcRenderer.invoke('e2e:seedHistoryMeeting', { text }),
}

contextBridge.exposeInMainWorld('api', api)

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => {
    listener(payload)
  }

  ipcRenderer.on(channel, wrapped)

  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}
