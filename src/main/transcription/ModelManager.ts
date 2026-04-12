import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { get as httpGet } from 'node:http'
import { URL as NodeURL } from 'node:url'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'

import type { TranscriptionModel, ModelDownloadProgress } from '../../shared/types'

interface CatalogEntry {
  id: string
  name: string
  description: string
  sizeMb: number
  languages: string
  accuracy: number // 1–5
  speed: number    // 1–5 (5 = fastest)
  recommended: boolean
  engine: 'whisper' | 'parakeet'
  runtime: string
  runtimeModelName: string
  downloadManaged: boolean
  supportsGpuAcceleration: boolean
  gpuAccelerationLabel?: string
  setupHint?: string
}

// IDs must match nodejs-whisper's MODELS_LIST
export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'tiny.en',
    name: 'Tiny · English-only',
    description: 'Ultra-fast, minimal RAM. Good for quick tests or very low-end hardware.',
    sizeMb: 75,
    languages: 'English only',
    accuracy: 2,
    speed: 5,
    recommended: false,
    engine: 'whisper',
    runtime: 'whisper.cpp',
    runtimeModelName: 'tiny.en',
    downloadManaged: true,
    supportsGpuAcceleration: true,
    gpuAccelerationLabel: 'NVIDIA CUDA (whisper.cpp)',
  },
  {
    id: 'base.en',
    name: 'Base · English-only',
    description: 'Fast with reasonable accuracy for English speech.',
    sizeMb: 142,
    languages: 'English only',
    accuracy: 3,
    speed: 4,
    recommended: false,
    engine: 'whisper',
    runtime: 'whisper.cpp',
    runtimeModelName: 'base.en',
    downloadManaged: true,
    supportsGpuAcceleration: true,
    gpuAccelerationLabel: 'NVIDIA CUDA (whisper.cpp)',
  },
  {
    id: 'small.en',
    name: 'Small · English-only',
    description: 'Best balance of speed and accuracy for English. Great for most users.',
    sizeMb: 466,
    languages: 'English only',
    accuracy: 4,
    speed: 3,
    recommended: true,
    engine: 'whisper',
    runtime: 'whisper.cpp',
    runtimeModelName: 'small.en',
    downloadManaged: true,
    supportsGpuAcceleration: true,
    gpuAccelerationLabel: 'NVIDIA CUDA (whisper.cpp)',
  },
  {
    id: 'medium.en',
    name: 'Medium · English-only',
    description: 'High accuracy for English. Noticeably slower; requires more RAM.',
    sizeMb: 1533,
    languages: 'English only',
    accuracy: 5,
    speed: 2,
    recommended: false,
    engine: 'whisper',
    runtime: 'whisper.cpp',
    runtimeModelName: 'medium.en',
    downloadManaged: true,
    supportsGpuAcceleration: true,
    gpuAccelerationLabel: 'NVIDIA CUDA (whisper.cpp)',
  },
  {
    id: 'large-v3-turbo',
    name: 'Large v3 Turbo · Multilingual',
    description: 'Near-large accuracy with 99-language support at roughly half the size.',
    sizeMb: 874,
    languages: '99 languages',
    accuracy: 5,
    speed: 2,
    recommended: false,
    engine: 'whisper',
    runtime: 'whisper.cpp',
    runtimeModelName: 'large-v3-turbo',
    downloadManaged: true,
    supportsGpuAcceleration: true,
    gpuAccelerationLabel: 'NVIDIA CUDA (whisper.cpp)',
  },
  {
    id: 'parakeetv3',
    name: 'Parakeet v3 · Multilingual',
    description: 'NVIDIA Parakeet v3 via NeMo. Loads through Python, caches on first run, and prefers CUDA on NVIDIA GPUs when available.',
    sizeMb: 2560,
    languages: 'Multilingual',
    accuracy: 5,
    speed: 3,
    recommended: false,
    engine: 'parakeet',
    runtime: 'Python + NVIDIA NeMo',
    runtimeModelName: 'nvidia/parakeet-tdt-0.6b-v3',
    downloadManaged: false,
    supportsGpuAcceleration: true,
    gpuAccelerationLabel: 'CUDA / NVIDIA GPU',
    setupHint: 'Requires Python 3 plus NeMo ASR dependencies. The model is cached by the Python runtime on first use.',
  },
]

const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

interface ActiveDownload {
  abort: () => void
}

function resolveNodejsWhisperModelsDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const constants = require('nodejs-whisper/dist/constants') as { WHISPER_CPP_PATH: string }
  return join(constants.WHISPER_CPP_PATH, 'models')
}

export class ModelManager {
  private readonly modelsDir: string
  private readonly settingsPath: string
  private readonly activeDownloads = new Map<string, ActiveDownload>()
  private progressListener: ((p: ModelDownloadProgress) => void) | null = null

  constructor(userDataPath: string) {
    this.modelsDir = resolveNodejsWhisperModelsDir()
    this.settingsPath = join(userDataPath, 'settings.json')
    mkdirSync(this.modelsDir, { recursive: true })
  }

  setProgressListener(listener: (p: ModelDownloadProgress) => void): void {
    this.progressListener = listener
  }

  getModels(): TranscriptionModel[] {
    return MODEL_CATALOG.map((entry) => ({
      ...entry,
      isDownloaded: entry.downloadManaged ? this.isDownloaded(entry.id) : true,
    }))
  }

  getModel(modelId: string): TranscriptionModel | null {
    const entry = MODEL_CATALOG.find((model) => model.id === modelId)
    if (!entry) return null

    return {
      ...entry,
      isDownloaded: entry.downloadManaged ? this.isDownloaded(entry.id) : true,
    }
  }

  isDownloaded(modelId: string): boolean {
    return existsSync(this.modelFilePath(modelId))
  }

  modelFilePath(modelId: string): string {
    return join(this.modelsDir, `ggml-${modelId}.bin`)
  }

  private async readModelSettingsFile(): Promise<Record<string, unknown>> {
    try {
      const text = await readFile(this.settingsPath, 'utf-8')
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private isModelUsable(modelId: string): boolean {
    const entry = MODEL_CATALOG.find((m) => m.id === modelId)
    if (!entry) return false
    if (!entry.downloadManaged) return true
    return this.isDownloaded(modelId)
  }

  private firstCatalogFallback(): string | null {
    const fallback = MODEL_CATALOG.find((m) => (m.downloadManaged ? this.isDownloaded(m.id) : true))
    return fallback?.id ?? null
  }

  private resolvePreferredModelId(preferred: string | undefined): string | null {
    if (preferred && this.isModelUsable(preferred)) {
      return preferred
    }
    return this.firstCatalogFallback()
  }

  /** Legacy: same as meeting profile selection. */
  async getSelectedModel(): Promise<string | null> {
    return this.getSelectedModelForProfile('meeting')
  }

  async getModelSelection(): Promise<{ meeting: string | null; live: string | null }> {
    const [meeting, live] = await Promise.all([
      this.getSelectedModelForProfile('meeting'),
      this.getSelectedModelForProfile('live'),
    ])
    return { meeting, live }
  }

  async getSelectedModelForProfile(profile: 'meeting' | 'live'): Promise<string | null> {
    const settings = await this.readModelSettingsFile()
    const legacy = typeof settings.selectedModel === 'string' ? settings.selectedModel : undefined
    const meetingPreferred =
      typeof settings.meetingModelId === 'string' ? settings.meetingModelId : legacy
    const livePreferred = typeof settings.liveModelId === 'string' ? settings.liveModelId : legacy

    const raw = profile === 'meeting' ? meetingPreferred : livePreferred
    return this.resolvePreferredModelId(raw)
  }

  async selectModel(modelId: string): Promise<void> {
    if (!this.getModel(modelId)) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    const settings = await this.readModelSettingsFile()
    settings.selectedModel = modelId
    settings.meetingModelId = modelId
    settings.liveModelId = modelId
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  async selectModelForProfile(profile: 'meeting' | 'live', modelId: string): Promise<void> {
    if (!this.getModel(modelId)) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    const settings = await this.readModelSettingsFile()
    if (profile === 'meeting') {
      settings.meetingModelId = modelId
      settings.selectedModel = modelId
    } else {
      settings.liveModelId = modelId
    }
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  cancelDownload(modelId: string): void {
    this.activeDownloads.get(modelId)?.abort()
    this.activeDownloads.delete(modelId)
  }

  /**
   * Deletes a managed model's weights file from disk and clears persisted selection if needed.
   */
  async removeDownloadedModel(modelId: string): Promise<void> {
    const entry = MODEL_CATALOG.find((m) => m.id === modelId)
    if (!entry) {
      throw new Error(`Unknown model: ${modelId}`)
    }
    if (!entry.downloadManaged) {
      throw new Error(
        `${entry.name} is prepared by ${entry.runtime} on first use and is not removed from this screen.`
      )
    }

    this.cancelDownload(modelId)

    if (!this.isDownloaded(modelId)) {
      throw new Error(`Model ${modelId} is not installed.`)
    }

    const destPath = this.modelFilePath(modelId)
    const tmpPath = `${destPath}.part`

    try {
      unlinkSync(destPath)
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }

    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }

    await this.reconcileSettingsAfterRemove(modelId)
  }

  private async reconcileSettingsAfterRemove(removedId: string): Promise<void> {
    const settings = await this.readModelSettingsFile()
    if (!settings || Object.keys(settings).length === 0) {
      return
    }

    const nextId = MODEL_CATALOG.find(
      (m) => m.id !== removedId && (m.downloadManaged ? this.isDownloaded(m.id) : true),
    )?.id

    const keys = ['selectedModel', 'meetingModelId', 'liveModelId'] as const
    let changed = false
    for (const key of keys) {
      if (settings[key] === removedId) {
        changed = true
        if (nextId) {
          settings[key] = nextId
        } else {
          delete settings[key]
        }
      }
    }

    if (!changed) return

    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  downloadModel(modelId: string): Promise<void> {
    const model = this.getModel(modelId)
    if (!model) {
      return Promise.reject(new Error(`Unknown model: ${modelId}`))
    }
    if (!model.downloadManaged) {
      return Promise.reject(
        new Error(
          `${model.name} is prepared by ${model.runtime} on first use and is not downloaded by the app.`
        )
      )
    }

    if (this.isDownloaded(modelId)) return Promise.resolve()
    if (this.activeDownloads.has(modelId)) {
      return Promise.reject(new Error(`Model ${modelId} is already downloading`))
    }

    const destPath = this.modelFilePath(modelId)
    const tmpPath = `${destPath}.part`
    const url = `${HF_BASE}/ggml-${modelId}.bin`

    return new Promise<void>((resolve, reject) => {
      let cleanupCalled = false
      let aborted = false

      const cleanup = (err?: Error): void => {
        if (cleanupCalled) return
        cleanupCalled = true
        this.activeDownloads.delete(modelId)
        try {
          if (existsSync(tmpPath)) unlinkSync(tmpPath)
        } catch { /* ignore */ }
        if (err) reject(err)
        else resolve()
      }

      this.activeDownloads.set(modelId, {
        abort: () => {
          aborted = true
          cleanup(new Error('Download canceled'))
        },
      })

      this.fetchFollowingRedirects(url, 5, (err, response) => {
        if (err || !response) {
          cleanup(err ?? new Error('No response from server'))
          return
        }
        if (aborted) {
          response.destroy()
          return
        }
        if (response.statusCode !== 200) {
          cleanup(new Error(`HTTP ${response.statusCode ?? 'unknown'} downloading model`))
          return
        }

        const totalBytes = Number.parseInt(response.headers['content-length'] ?? '0', 10)
        let downloadedBytes = 0

        const fileStream = createWriteStream(tmpPath)

        response.on('data', (chunk: Buffer) => {
          if (aborted) {
            response.destroy()
            return
          }
          downloadedBytes += chunk.length
          this.progressListener?.({
            modelId,
            downloadedBytes,
            totalBytes,
            percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
          })
        })

        response.pipe(fileStream)

        fileStream.on('finish', () => {
          if (aborted) return
          try {
            renameSync(tmpPath, destPath)
            this.activeDownloads.delete(modelId)
            cleanupCalled = true
            resolve()
          } catch (renameErr) {
            cleanup(renameErr instanceof Error ? renameErr : new Error(String(renameErr)))
          }
        })

        fileStream.on('error', (e) => cleanup(e))
        response.on('error', (e) => cleanup(e))
      })
    })
  }

  private fetchFollowingRedirects(
    url: string,
    maxRedirects: number,
    callback: (err: Error | null, response?: IncomingMessage) => void
  ): void {
    let parsed: NodeURL
    try {
      parsed = new NodeURL(url)
    } catch (e) {
      callback(e instanceof Error ? e : new Error(String(e)))
      return
    }

    const getter = parsed.protocol === 'https:' ? httpsGet : httpGet
    const req = getter(url, (response) => {
      const status = response.statusCode ?? 0
      if (
        (status === 301 || status === 302 || status === 307 || status === 308) &&
        response.headers.location
      ) {
        if (maxRedirects <= 0) {
          callback(new Error('Too many redirects'))
          return
        }
        response.resume()
        this.fetchFollowingRedirects(response.headers.location, maxRedirects - 1, callback)
        return
      }
      callback(null, response)
    })
    req.on('error', (err) => callback(err))
  }
}
