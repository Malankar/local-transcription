import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'

// ──────────────────────────────────────────────────────────────────────────────
// Module-level mocks
// All vi.mock() factories are hoisted to the top of the compiled output by
// vitest, so they cannot reference variables declared in the test file.
// Use vi.fn() directly inside the factory, then access them via vi.mocked()
// after the real imports are resolved.
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => {
  const mod = {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
  }
  return { ...mod, default: mod }
})

vi.mock('node:https', () => {
  const mod = { get: vi.fn() }
  return { ...mod, default: mod }
})

vi.mock('node:fs/promises', () => {
  const mod = {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
  return { ...mod, default: mod }
})

// ──────────────────────────────────────────────────────────────────────────────
// Import units under test after mock registration.
// ──────────────────────────────────────────────────────────────────────────────
import { ModelManager, MODEL_CATALOG } from '../../../src/main/transcription/ModelManager'
import { existsSync, unlinkSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'

// ──────────────────────────────────────────────────────────────────────────────

function makeManager(): ModelManager {
  return new ModelManager('/fake/user-data')
}

describe('ModelManager', () => {
  let manager: ModelManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(writeFile).mockResolvedValue(undefined)
    manager = makeManager()
  })

  // ── MODEL_CATALOG ─────────────────────────────────────────────────────────

  describe('MODEL_CATALOG', () => {
    it('is a non-empty array of catalog entries', () => {
      expect(MODEL_CATALOG.length).toBeGreaterThan(0)
    })

    it('every entry has the required fields', () => {
      for (const entry of MODEL_CATALOG) {
        expect(entry).toHaveProperty('id')
        expect(entry).toHaveProperty('name')
        expect(entry).toHaveProperty('engine')
        expect(entry).toHaveProperty('runtimeModelName')
        expect(entry).toHaveProperty('downloadManaged')
        expect(entry).toHaveProperty('supportsGpuAcceleration')
      }
    })

    it('at least one model is marked recommended', () => {
      const recommended = MODEL_CATALOG.filter((m) => m.recommended)
      expect(recommended.length).toBeGreaterThanOrEqual(1)
    })

    it('every model runs on sherpa-onnx', () => {
      for (const entry of MODEL_CATALOG) {
        expect(entry.engine).toBe('sherpa')
      }
    })

    it('saves Whisper files under fixed local names', () => {
      const tiny = MODEL_CATALOG.find((m) => m.id === 'tiny.en')!
      expect(tiny.sherpa.files.map((f) => f.as)).toEqual(['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'])
    })

    it('every sherpa model declares its kind and files, including tokens.txt', () => {
      for (const entry of MODEL_CATALOG.filter((m) => m.engine === 'sherpa')) {
        expect(entry.sherpa.kind).toBeTruthy()
        expect(entry.sherpa.files.map((f) => f.as ?? f.name)).toContain('tokens.txt')
      }
    })
  })

  // ── getModels ─────────────────────────────────────────────────────────────

  describe('getModels', () => {
    it('returns a TranscriptionModel for each catalog entry', () => {
      const models = manager.getModels()
      expect(models).toHaveLength(MODEL_CATALOG.length)
    })

    it('includes an isDownloaded boolean field on every model', () => {
      const models = manager.getModels()
      for (const m of models) {
        expect(typeof m.isDownloaded).toBe('boolean')
      }
    })

    it('always marks non-downloadManaged models as downloaded', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const models = manager.getModels()
      const unmanaged = models.filter((m) => !m.downloadManaged)
      for (const m of unmanaged) {
        expect(m.isDownloaded).toBe(true)
      }
    })

    it('marks a sherpa model downloaded only when all its files exist, and points it at the model dir', () => {
      const dir = join('/fake/user-data', 'models', 'sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8')
      vi.mocked(existsSync).mockImplementation((p) => String(p).startsWith(dir) && !String(p).endsWith('tokens.txt'))
      expect(manager.getModel('canary-180m-flash')?.isDownloaded).toBe(false)

      vi.mocked(existsSync).mockImplementation((p) => String(p).startsWith(dir))
      const model = manager.getModel('canary-180m-flash')
      expect(model?.isDownloaded).toBe(true)
      expect(model?.runtimeModelName).toBe(dir)
      expect(model?.sherpaKind).toBe('canary')
    })

    it('uses existsSync to resolve download status for managed models', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('sherpa-onnx-whisper-tiny.en/'))
      const models = manager.getModels()
      expect(models.find((m) => m.id === 'tiny.en')?.isDownloaded).toBe(true)
      expect(models.find((m) => m.id === 'base.en')?.isDownloaded).toBe(false)
    })
  })

  // ── getModel ──────────────────────────────────────────────────────────────

  describe('getModel', () => {
    it('returns null for an unknown model id', () => {
      expect(manager.getModel('nonexistent-model')).toBeNull()
    })

    it('returns the matching TranscriptionModel for a known catalog id', () => {
      const firstId = MODEL_CATALOG[0].id
      const result = manager.getModel(firstId)
      expect(result).not.toBeNull()
      expect(result?.id).toBe(firstId)
    })

    it('reflects existsSync changes on subsequent calls (no caching)', () => {
      const managedId = MODEL_CATALOG.find((m) => m.downloadManaged)!.id

      vi.mocked(existsSync).mockReturnValue(false)
      expect(manager.getModel(managedId)?.isDownloaded).toBe(false)

      vi.mocked(existsSync).mockReturnValue(true)
      expect(manager.getModel(managedId)?.isDownloaded).toBe(true)
    })
  })

  // ── isDownloaded ──────────────────────────────────────────────────────────

  describe('isDownloaded', () => {
    it('returns false when existsSync returns false', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      expect(manager.isDownloaded('small.en')).toBe(false)
    })

    it('returns true when existsSync returns true', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      expect(manager.isDownloaded('small.en')).toBe(true)
    })
  })

  // ── getSelectedModel ──────────────────────────────────────────────────────

  describe('getSelectedModel', () => {
    it('returns the id of the first always-available model when no managed model is downloaded', async () => {
      // When existsSync → false for every path, downloadManaged models show as not downloaded.
      // The fallback finds the first entry where (downloadManaged ? isDownloaded(id) : true).
      // Non-managed models always qualify, so the result is the first non-managed entry.
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(existsSync).mockReturnValue(false)

      const selected = await manager.getSelectedModel()
      const firstAlwaysAvailable = MODEL_CATALOG.find((m) => !m.downloadManaged)

      if (firstAlwaysAvailable) {
        expect(selected).toBe(firstAlwaysAvailable.id)
      } else {
        // All models are managed and none is downloaded → null
        expect(selected).toBeNull()
      }
    })

    it('returns null when every model is downloadManaged and none is present', async () => {
      // Construct a scenario-specific manager using a stub catalog.
      // We test this via MODEL_CATALOG directly: if every entry is downloadManaged
      // and existsSync always returns false, getSelectedModel must return null.
      const allManaged = MODEL_CATALOG.every((m) => m.downloadManaged)
      if (!allManaged) {
        // There is a non-managed model in the catalog, so skip this test.
        return
      }

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(existsSync).mockReturnValue(false)
      expect(await manager.getSelectedModel()).toBeNull()
    })

    it('returns the saved model id when it is recorded in settings and its file exists', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ selectedModel: 'small.en' })
      )
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('sherpa-onnx-whisper-small.en/'))

      expect(await manager.getSelectedModel()).toBe('small.en')
    })

    it('falls back to the first downloaded managed model when the saved model file is absent', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ selectedModel: 'large-v3-turbo' })
      )
      // Only tiny.en present
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('sherpa-onnx-whisper-tiny.en/'))

      expect(await manager.getSelectedModel()).toBe('tiny.en')
    })

    it('falls back correctly even when readFile itself rejects', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('sherpa-onnx-whisper-base.en/'))

      expect(await manager.getSelectedModel()).toBe('base.en')
    })
  })

  // ── selectModel ───────────────────────────────────────────────────────────

  describe('selectModel', () => {
    it('throws for an unknown model id', async () => {
      await expect(manager.selectModel('unknown-xyz')).rejects.toThrow('Unknown model')
    })

    it('writes the selected model id to the settings file', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      await manager.selectModel('tiny.en')

      expect(writeFile).toHaveBeenCalledOnce()
      const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(written.selectedModel).toBe('tiny.en')
    })

    it('merges into existing settings without clobbering unrelated keys', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ someOtherKey: 'value' })
      )

      await manager.selectModel('base.en')

      const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(written.selectedModel).toBe('base.en')
      expect(written.someOtherKey).toBe('value')
    })

    it('writes to settings.json inside userDataPath', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      await manager.selectModel('tiny.en')

      const expectedPath = join('/fake/user-data', 'settings.json')
      expect(writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8')
    })
  })

  // ── downloadModel guard behaviours ────────────────────────────────────────

  describe('downloadModel', () => {
    it('rejects for an unknown model id', async () => {
      await expect(manager.downloadModel('ghost-model')).rejects.toThrow('Unknown model')
    })

    it('rejects for a model whose download is not app-managed', async () => {
      const unmanagedId = MODEL_CATALOG.find((m) => !m.downloadManaged)?.id
      if (!unmanagedId) return

      await expect(manager.downloadModel(unmanagedId)).rejects.toThrow()
    })

    it('resolves immediately when the model file already exists', async () => {
      const managedId = MODEL_CATALOG.find((m) => m.downloadManaged)!.id
      vi.mocked(existsSync).mockReturnValue(true)

      await expect(manager.downloadModel(managedId)).resolves.toBeUndefined()
    })

    it('rejects when that model is already downloading', async () => {
      const managedId = MODEL_CATALOG.find((m) => m.downloadManaged)!.id
      vi.mocked(existsSync).mockReturnValue(false)
      // Inject active download
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(manager as any).activeDownloads.set(managedId, { abort: vi.fn() })

      await expect(manager.downloadModel(managedId)).rejects.toThrow('already downloading')
    })

    it('follows relative redirects (HuggingFace does this for small non-LFS files)', async () => {
      const responses = [
        { statusCode: 307, headers: { location: '/api/resolve-cache/x/tokens.txt' }, resume: vi.fn() },
        { statusCode: 200, headers: {} },
      ]
      vi.mocked(httpsGet).mockImplementation(((_url: string, cb: (r: unknown) => void) => {
        cb(responses.shift())
        return { on: vi.fn() }
      }) as any)

      const final = await new Promise<unknown>((resolve, reject) => {
        ;(manager as any).fetchFollowingRedirects(
          'https://huggingface.co/repo/resolve/main/tokens.txt',
          5,
          (err: Error | null, res: unknown) => (err ? reject(err) : resolve(res))
        )
      })

      expect(vi.mocked(httpsGet).mock.calls[1][0]).toBe('https://huggingface.co/api/resolve-cache/x/tokens.txt')
      expect(final).toMatchObject({ statusCode: 200 })
    })
  })

  // ── cancelDownload ────────────────────────────────────────────────────────

  describe('cancelDownload', () => {
    it('is a no-op when there is no active download for the model', () => {
      expect(() => manager.cancelDownload('tiny.en')).not.toThrow()
    })

    it('calls abort() and removes the model from the active-download map', () => {
      const abort = vi.fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(manager as any).activeDownloads.set('tiny.en', { abort })

      manager.cancelDownload('tiny.en')

      expect(abort).toHaveBeenCalledOnce()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((manager as any).activeDownloads.has('tiny.en')).toBe(false)
    })
  })

  // ── removeDownloadedModel ───────────────────────────────────────────────

  describe('removeDownloadedModel', () => {
    it('throws for an unknown model id', async () => {
      await expect(manager.removeDownloadedModel('ghost-model')).rejects.toThrow('Unknown model')
    })

    it('throws for a model whose download is not app-managed', async () => {
      const unmanagedId = MODEL_CATALOG.find((m) => !m.downloadManaged)?.id
      if (!unmanagedId) return

      await expect(manager.removeDownloadedModel(unmanagedId)).rejects.toThrow()
    })

    it('throws when the managed model file is not present', async () => {
      const managedId = MODEL_CATALOG.find((m) => m.downloadManaged)!.id
      vi.mocked(existsSync).mockReturnValue(false)

      await expect(manager.removeDownloadedModel(managedId)).rejects.toThrow('not installed')
    })

    it('unlinks the model files and updates settings when removing the selected model', async () => {
      const managedId = MODEL_CATALOG.find((m) => m.downloadManaged)!.id
      let filePresent = true
      vi.mocked(existsSync).mockImplementation((p) => {
        if (String(p).includes(`sherpa-onnx-whisper-${managedId}/`) && !String(p).endsWith('.part')) {
          return filePresent
        }
        return false
      })
      vi.mocked(unlinkSync).mockImplementation(() => {
        filePresent = false
      })

      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ selectedModel: managedId }))

      await manager.removeDownloadedModel(managedId)

      expect(unlinkSync).toHaveBeenCalled()
      const unlinkedPath = vi.mocked(unlinkSync).mock.calls[0][0] as string
      expect(unlinkedPath).toContain(`sherpa-onnx-whisper-${managedId}/`)
      expect(writeFile).toHaveBeenCalled()
      const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(written.selectedModel).not.toBe(managedId)
    })
  })

  // ── setProgressListener ───────────────────────────────────────────────────

  describe('setProgressListener', () => {
    it('accepts a listener without throwing', () => {
      expect(() => manager.setProgressListener(vi.fn())).not.toThrow()
    })
  })
})
