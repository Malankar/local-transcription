import { contextBridge, ipcRenderer } from 'electron'

import type {
  AppStatus,
  CaptureStartOptions,
  ExportResult,
  LocalTranscribeApi,
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
