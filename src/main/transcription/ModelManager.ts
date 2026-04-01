import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { get as httpGet } from 'node:http'
import { URL as NodeURL } from 'node:url'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'

import type { WhisperModel, ModelDownloadProgress } from '../../shared/types'

interface CatalogEntry {
  id: string
  name: string
  description: string
  sizeMb: number
  languages: string
  accuracy: number // 1–5
  speed: number    // 1–5 (5 = fastest)
  recommended: boolean
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

  getModels(): WhisperModel[] {
    return MODEL_CATALOG.map((entry) => ({
      ...entry,
      isDownloaded: this.isDownloaded(entry.id),
    }))
  }

  isDownloaded(modelId: string): boolean {
    return existsSync(this.modelFilePath(modelId))
  }

  modelFilePath(modelId: string): string {
    return join(this.modelsDir, `ggml-${modelId}.bin`)
  }

  async getSelectedModel(): Promise<string | null> {
    try {
      const text = await readFile(this.settingsPath, 'utf-8')
      const settings = JSON.parse(text) as { selectedModel?: string }
      if (settings.selectedModel && this.isDownloaded(settings.selectedModel)) {
        return settings.selectedModel
      }
    } catch {
      // no settings file yet
    }
    // Fall back to first downloaded model in catalog order
    const fallback = MODEL_CATALOG.find((m) => this.isDownloaded(m.id))
    return fallback?.id ?? null
  }

  async selectModel(modelId: string): Promise<void> {
    let settings: Record<string, unknown> = {}
    try {
      const text = await readFile(this.settingsPath, 'utf-8')
      settings = JSON.parse(text) as Record<string, unknown>
    } catch {
      // no file yet
    }
    settings.selectedModel = modelId
    await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  cancelDownload(modelId: string): void {
    this.activeDownloads.get(modelId)?.abort()
    this.activeDownloads.delete(modelId)
  }

  downloadModel(modelId: string): Promise<void> {
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
