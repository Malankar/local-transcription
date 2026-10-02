import { existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { get as httpGet } from 'node:http'
import { URL as NodeURL } from 'node:url'
import { dirname, join } from 'node:path'
import type { IncomingMessage } from 'node:http'

import type { TranscriptionModel, ModelDownloadProgress, SherpaModelKind } from '../../shared/types'

interface CatalogEntry {
  id: string
  name: string
  description: string
  sizeMb: number
  languages: string
  accuracy: number // 1–5
  speed: number    // 1–5 (5 = fastest)
  recommended: boolean
  engine: 'sherpa'
  runtime: string
  runtimeModelName: string
  downloadManaged: boolean
  supportsGpuAcceleration: boolean
  gpuAccelerationLabel?: string
  setupHint?: string
  sherpa: SherpaSpec
}

/**
 * sherpa-onnx model hosted as individual files on HuggingFace. The worker maps `kind` to the
 * expected file names (see buildSherpaModelConfig in whisperWorker.ts).
 * Sizes come from the HF repo listing and drive the overall progress total.
 */
interface SherpaSpec {
  kind: SherpaModelKind
  repo: string
  /** `as` renames the file locally so each kind has a fixed on-disk layout. */
  files: { name: string; sizeBytes: number; as?: string }[]
}

/** Whisper int8 ONNX exports; HF files are prefixed with the model name, so rename on download. */
function whisperSherpa(prefix: string, sizes: [encoder: number, decoder: number, tokens: number]): SherpaSpec {
  const [encoder, decoder, tokens] = sizes
  return {
    kind: 'whisper',
    repo: `csukuangfj/sherpa-onnx-whisper-${prefix}`,
    files: [
      { name: `${prefix}-encoder.int8.onnx`, sizeBytes: encoder, as: 'encoder.int8.onnx' },
      { name: `${prefix}-decoder.int8.onnx`, sizeBytes: decoder, as: 'decoder.int8.onnx' },
      { name: `${prefix}-tokens.txt`, sizeBytes: tokens, as: 'tokens.txt' },
    ],
  }
}

export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'tiny.en',
    name: 'Tiny · English-only',
    description: 'Ultra-fast, minimal RAM. Good for quick tests or very low-end hardware.',
    sizeMb: 99,
    languages: 'English only',
    accuracy: 2,
    speed: 5,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-whisper-tiny.en',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: whisperSherpa('tiny.en', [12_937_772, 89_853_865, 835_554]),
  },
  {
    id: 'base.en',
    name: 'Base · English-only',
    description: 'Fast with reasonable accuracy for English speech.',
    sizeMb: 154,
    languages: 'English only',
    accuracy: 3,
    speed: 4,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-whisper-base.en',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: whisperSherpa('base.en', [29_120_534, 130_669_978, 835_554]),
  },
  {
    id: 'small.en',
    name: 'Small · English-only',
    description: 'Best balance of speed and accuracy for English. Great for most users.',
    sizeMb: 358,
    languages: 'English only',
    accuracy: 4,
    speed: 3,
    recommended: true,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-whisper-small.en',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: whisperSherpa('small.en', [112_442_483, 262_223_042, 835_554]),
  },
  {
    id: 'medium.en',
    name: 'Medium · English-only',
    description: 'High accuracy for English. Noticeably slower; requires more RAM.',
    sizeMb: 902,
    languages: 'English only',
    accuracy: 5,
    speed: 2,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-whisper-medium.en',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: whisperSherpa('medium.en', [374_196_283, 571_055_161, 835_554]),
  },
  {
    id: 'large-v3-turbo',
    name: 'Large v3 Turbo · Multilingual',
    description: 'Near-large accuracy with 99-language support. Slowest option on CPU.',
    sizeMb: 988,
    languages: '99 languages',
    accuracy: 5,
    speed: 2,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-whisper-turbo',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: whisperSherpa('turbo', [674_716_297, 361_080_764, 816_730]),
  },
  {
    id: 'parakeetv3',
    name: 'Parakeet v3 · Multilingual',
    description: 'NVIDIA Parakeet TDT 0.6B v3. Fast and accurate across 25 European languages.',
    sizeMb: 639,
    languages: '25 European languages',
    accuracy: 5,
    speed: 4,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: {
      kind: 'nemo-transducer',
      repo: 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
      files: [
        { name: 'encoder.int8.onnx', sizeBytes: 652_184_281 },
        { name: 'decoder.int8.onnx', sizeBytes: 11_845_275 },
        { name: 'joiner.int8.onnx', sizeBytes: 6_355_277 },
        { name: 'tokens.txt', sizeBytes: 93_939 },
      ],
    },
  },
  {
    id: 'parakeetv2',
    name: 'Parakeet v2 · English-only',
    description: 'NVIDIA Parakeet TDT 0.6B v2. Top-tier English accuracy at high speed.',
    sizeMb: 631,
    languages: 'English only',
    accuracy: 5,
    speed: 4,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: {
      kind: 'nemo-transducer',
      repo: 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
      files: [
        { name: 'encoder.int8.onnx', sizeBytes: 652_184_296 },
        { name: 'decoder.int8.onnx', sizeBytes: 7_257_753 },
        { name: 'joiner.int8.onnx', sizeBytes: 1_739_080 },
        { name: 'tokens.txt', sizeBytes: 9_384 },
      ],
    },
  },
  {
    id: 'moonshine-base-en',
    name: 'Moonshine Base · English-only',
    description: 'Tiny and very fast. Good for low-end hardware and quick dictation.',
    sizeMb: 135,
    languages: 'English only',
    accuracy: 3,
    speed: 5,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-moonshine-base-en-quantized-2026-02-27',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: {
      kind: 'moonshine',
      repo: 'csukuangfj2/sherpa-onnx-moonshine-base-en-quantized-2026-02-27',
      files: [
        { name: 'encoder_model.ort', sizeBytes: 31_326_816 },
        { name: 'decoder_model_merged.ort', sizeBytes: 109_424_400 },
        { name: 'tokens.txt', sizeBytes: 549_350 },
      ],
    },
  },
  {
    id: 'sense-voice',
    name: 'SenseVoice · Asian languages',
    description: 'Very fast. Chinese, English, Japanese, Korean and Cantonese with auto language detection.',
    sizeMb: 226,
    languages: 'Chinese, English, Japanese, Korean, Cantonese',
    accuracy: 4,
    speed: 5,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: {
      kind: 'sense-voice',
      repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
      files: [
        { name: 'model.int8.onnx', sizeBytes: 237_115_547 },
        { name: 'tokens.txt', sizeBytes: 315_894 },
      ],
    },
  },
  {
    id: 'canary-180m-flash',
    name: 'Canary 180M Flash · English',
    description: 'NVIDIA Canary 180M Flash. Very fast with punctuation and capitalization.',
    sizeMb: 198,
    languages: 'English only',
    accuracy: 4,
    speed: 5,
    recommended: false,
    engine: 'sherpa',
    runtime: 'sherpa-onnx',
    runtimeModelName: 'sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8',
    downloadManaged: true,
    supportsGpuAcceleration: false,
    sherpa: {
      kind: 'canary',
      repo: 'csukuangfj/sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8',
      files: [
        { name: 'encoder.int8.onnx', sizeBytes: 132_678_643 },
        { name: 'decoder.int8.onnx', sizeBytes: 74_437_848 },
        { name: 'tokens.txt', sizeBytes: 53_555 },
      ],
    },
  },
]

interface DownloadFile {
  url: string
  destPath: string
  sizeBytes?: number
}

interface ActiveDownload {
  abort: () => void
}

export class ModelManager {
  private readonly sherpaModelsDir: string
  private readonly settingsPath: string
  private readonly activeDownloads = new Map<string, ActiveDownload>()
  private progressListener: ((p: ModelDownloadProgress) => void) | null = null

  constructor(userDataPath: string) {
    this.sherpaModelsDir = join(userDataPath, 'models')
    this.settingsPath = join(userDataPath, 'settings.json')
  }

  setProgressListener(listener: (p: ModelDownloadProgress) => void): void {
    this.progressListener = listener
  }

  getModels(): TranscriptionModel[] {
    return MODEL_CATALOG.map((entry) => this.toModel(entry))
  }

  getModel(modelId: string): TranscriptionModel | null {
    const entry = MODEL_CATALOG.find((model) => model.id === modelId)
    return entry ? this.toModel(entry) : null
  }

  private toModel({ sherpa, ...entry }: CatalogEntry): TranscriptionModel {
    return {
      ...entry,
      // sherpa-onnx loads from a directory, so the worker gets the absolute model dir.
      runtimeModelName: this.sherpaModelDir(entry),
      sherpaKind: sherpa.kind,
      isDownloaded: entry.downloadManaged ? this.isDownloaded(entry.id) : true,
    }
  }

  isDownloaded(modelId: string): boolean {
    const files = this.filesForModel(modelId)
    return files.length > 0 && files.every((file) => existsSync(file.destPath))
  }

  private sherpaModelDir(entry: Pick<CatalogEntry, 'runtimeModelName'>): string {
    return join(this.sherpaModelsDir, entry.runtimeModelName)
  }

  private filesForModel(modelId: string): DownloadFile[] {
    const entry = MODEL_CATALOG.find((m) => m.id === modelId)
    if (!entry) return []

    const { repo, files } = entry.sherpa
    const dir = this.sherpaModelDir(entry)
    return files.map((file) => ({
      url: `https://huggingface.co/${repo}/resolve/main/${file.name}`,
      destPath: join(dir, file.as ?? file.name),
      sizeBytes: file.sizeBytes,
    }))
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
    const fallback = MODEL_CATALOG.find((m) => (m.downloadManaged ? this.isDownloaded(m.id) : true))
    return fallback?.id ?? null
  }

  async selectModel(modelId: string): Promise<void> {
    if (!this.getModel(modelId)) {
      throw new Error(`Unknown model: ${modelId}`)
    }

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

    for (const { destPath } of this.filesForModel(modelId)) {
      if (existsSync(destPath)) unlinkSync(destPath)

      try {
        const tmpPath = `${destPath}.part`
        if (existsSync(tmpPath)) unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
    }

    await this.reconcileSettingsAfterRemove(modelId)
  }

  private async reconcileSettingsAfterRemove(removedId: string): Promise<void> {
    let settings: Record<string, unknown> = {}
    try {
      const text = await readFile(this.settingsPath, 'utf-8')
      settings = JSON.parse(text) as Record<string, unknown>
    } catch {
      return
    }

    if (settings.selectedModel !== removedId) return

    const nextId = MODEL_CATALOG.find((m) =>
      m.downloadManaged ? this.isDownloaded(m.id) : true
    )?.id

    if (nextId) {
      settings.selectedModel = nextId
    } else {
      delete settings.selectedModel
    }

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

    const files = this.filesForModel(modelId).filter((file) => !existsSync(file.destPath))
    const knownTotal = files.every((file) => file.sizeBytes)
      ? files.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)
      : 0

    let aborted = false
    let abortCurrent: (() => void) | null = null
    this.activeDownloads.set(modelId, {
      abort: () => {
        aborted = true
        abortCurrent?.()
      },
    })

    return (async () => {
      let completedBytes = 0
      try {
        for (const file of files) {
          if (aborted) throw new Error('Download canceled')
          mkdirSync(dirname(file.destPath), { recursive: true })
          completedBytes += await this.downloadFile(
            file,
            (abort) => {
              abortCurrent = abort
            },
            (downloadedBytes, fileTotalBytes) => {
              const totalBytes = knownTotal || fileTotalBytes
              const overall = completedBytes + downloadedBytes
              this.progressListener?.({
                modelId,
                downloadedBytes: overall,
                totalBytes,
                percent: totalBytes > 0 ? Math.round((overall / totalBytes) * 100) : 0,
              })
            }
          )
        }
      } finally {
        this.activeDownloads.delete(modelId)
      }
    })()
  }

  /** Downloads one file via a `.part` temp file; resolves with the byte count written. */
  private downloadFile(
    file: DownloadFile,
    registerAbort: (abort: () => void) => void,
    onProgress: (downloadedBytes: number, totalBytes: number) => void
  ): Promise<number> {
    const { url, destPath } = file
    const tmpPath = `${destPath}.part`

    return new Promise<number>((resolve, reject) => {
      let cleanupCalled = false
      let aborted = false

      const cleanup = (err?: Error): void => {
        if (cleanupCalled) return
        cleanupCalled = true
        try {
          if (existsSync(tmpPath)) unlinkSync(tmpPath)
        } catch { /* ignore */ }
        if (err) reject(err)
      }

      registerAbort(() => {
        aborted = true
        cleanup(new Error('Download canceled'))
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
          onProgress(downloadedBytes, totalBytes)
        })

        response.pipe(fileStream)

        fileStream.on('finish', () => {
          if (aborted) return
          try {
            renameSync(tmpPath, destPath)
            cleanupCalled = true
            resolve(downloadedBytes)
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
        // HF redirects non-LFS files (e.g. tokens.txt) with a relative Location header.
        const next = new NodeURL(response.headers.location, url).toString()
        this.fetchFollowingRedirects(next, maxRedirects - 1, callback)
        return
      }
      callback(null, response)
    })
    req.on('error', (err) => callback(err))
  }
}
