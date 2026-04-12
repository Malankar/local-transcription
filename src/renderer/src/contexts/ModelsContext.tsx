import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ModelDownloadProgress, TranscriptionModel } from '../types'
import { toMessage } from '../lib/formatters'

interface ModelsContextValue {
  models: TranscriptionModel[]
  meetingModelId: string | null
  liveModelId: string | null
  meetingModel: TranscriptionModel | null
  liveModel: TranscriptionModel | null
  /** @deprecated Use meetingModelId / liveModelId; kept for narrow compatibility. */
  selectedModelId: string | null
  downloadingId: string | null
  downloadProgress: ModelDownloadProgress | null
  downloadError: string
  downloadedModels: TranscriptionModel[]
  selectMeetingModel: (id: string) => Promise<void>
  selectLiveModel: (id: string) => Promise<void>
  downloadModel: (id: string) => Promise<void>
  cancelDownload: () => Promise<void>
  removeModel: (id: string) => Promise<void>
  refreshModels: () => Promise<void>
}

const ModelsContext = createContext<ModelsContextValue | undefined>(undefined)

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<TranscriptionModel[]>([])
  const [meetingModelId, setMeetingModelId] = useState<string | null>(null)
  const [liveModelId, setLiveModelId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string>('')

  const meetingModel = useMemo(
    () => models.find((m) => m.id === meetingModelId) ?? null,
    [models, meetingModelId],
  )
  const liveModel = useMemo(
    () => models.find((m) => m.id === liveModelId) ?? null,
    [models, liveModelId],
  )

  const downloadedModels = useMemo(() => models.filter((m) => m.isDownloaded), [models])

  async function refreshModels(): Promise<void> {
    const list = await window.api.getModels()
    const selection = await window.api.getModelSelection()
    setModels(list)
    const fallback =
      selection.meeting ??
      selection.live ??
      list.find((m) => m.recommended)?.id ??
      list[0]?.id ??
      null
    setMeetingModelId(selection.meeting ?? fallback)
    setLiveModelId(selection.live ?? fallback)
  }

  async function selectMeetingModel(id: string): Promise<void> {
    setMeetingModelId(id)
    await window.api.selectModelForProfile('meeting', id)
  }

  async function selectLiveModel(id: string): Promise<void> {
    setLiveModelId(id)
    await window.api.selectModelForProfile('live', id)
  }

  async function downloadModel(id: string): Promise<void> {
    setDownloadError('')
    setDownloadingId(id)
    setDownloadProgress(null)
    try {
      await window.api.selectModel(id)
      await window.api.downloadModel(id)
      const list = await window.api.getModels()
      setModels(list)
    } catch (error) {
      setDownloadError(toMessage(error))
    } finally {
      setDownloadingId(null)
      setDownloadProgress(null)
    }
  }

  async function cancelDownload(): Promise<void> {
    if (!downloadingId) return
    await window.api.cancelDownload(downloadingId)
    setDownloadingId(null)
    setDownloadProgress(null)
  }

  async function removeModel(id: string): Promise<void> {
    setDownloadError('')
    try {
      await window.api.removeModel(id)
      await refreshModels()
    } catch (error) {
      setDownloadError(toMessage(error))
    }
  }

  useEffect(() => {
    void refreshModels()
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onModelDownloadProgress((progress) => {
      setDownloadProgress(progress)
      if (progress.percent === 100) {
        void refreshModels()
      }
    })
    return unsubscribe
  }, [])

  const value: ModelsContextValue = {
    models,
    meetingModelId,
    liveModelId,
    meetingModel,
    liveModel,
    selectedModelId: meetingModelId,
    downloadingId,
    downloadProgress,
    downloadError,
    downloadedModels,
    selectMeetingModel,
    selectLiveModel,
    downloadModel,
    cancelDownload,
    removeModel,
    refreshModels,
  }

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
}

export function useModelsContext(): ModelsContextValue {
  const context = useContext(ModelsContext)
  if (!context) {
    throw new Error('useModelsContext must be used within ModelsProvider')
  }
  return context
}
