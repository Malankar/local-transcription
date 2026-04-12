import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ModelDownloadProgress, TranscriptionModel } from '../types'
import { toMessage } from '../lib/formatters'

interface ModelsContextValue {
  models: TranscriptionModel[]
  selectedModelId: string | null
  downloadingId: string | null
  downloadProgress: ModelDownloadProgress | null
  downloadError: string
  selectedModel: TranscriptionModel | null
  downloadedModels: TranscriptionModel[]
  selectModel: (id: string) => Promise<void>
  downloadModel: (id: string) => Promise<void>
  cancelDownload: () => Promise<void>
  removeModel: (id: string) => Promise<void>
  refreshModels: () => Promise<void>
}

const ModelsContext = createContext<ModelsContextValue | undefined>(undefined)

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<TranscriptionModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string>('')

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId]
  )

  const downloadedModels = useMemo(() => models.filter((m) => m.isDownloaded), [models])

  async function refreshModels(): Promise<void> {
    const list = await window.api.getModels()
    const current = await window.api.getSelectedModel()
    setModels(list)
    setSelectedModelId(current ?? list.find((m) => m.recommended)?.id ?? list[0]?.id ?? null)
  }

  async function selectModel(id: string): Promise<void> {
    setSelectedModelId(id)
    await window.api.selectModel(id)
  }

  async function downloadModel(id: string): Promise<void> {
    setDownloadError('')
    setDownloadingId(id)
    setSelectedModelId(id)
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

  // Initialize on mount
  useEffect(() => {
    void refreshModels()
  }, [])

  // Subscribe to download progress events
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
    selectedModelId,
    downloadingId,
    downloadProgress,
    downloadError,
    selectedModel,
    downloadedModels,
    selectModel,
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
