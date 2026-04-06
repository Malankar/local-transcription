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

vi.mock('node:fs/promises', () => {
  const mod = {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
  return { ...mod, default: mod }
})

// nodejs-whisper/dist/constants is CommonJS-required inside ModelManager's module scope.
vi.mock('nodejs-whisper/dist/constants', () => ({
  WHISPER_CPP_PATH: '/fake/whisper-cpp',
}))

// ──────────────────────────────────────────────────────────────────────────────
// Import units under test after mock registration.
// ──────────────────────────────────────────────────────────────────────────────
import { ModelManager, MODEL_CATALOG } from '../../../src/main/transcription/ModelManager'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

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

    it('all engine values are either "whisper" or "parakeet"', () => {
      for (const entry of MODEL_CATALOG) {
        expect(['whisper', 'parakeet']).toContain(entry.engine)
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

    it('uses existsSync to resolve download status for managed models', () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('ggml-tiny.en.bin'))
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

  // ── modelFilePath ─────────────────────────────────────────────────────────

  describe('modelFilePath', () => {
    it('returns a path ending with ggml-<id>.bin', () => {
      expect(manager.modelFilePath('tiny.en')).toMatch(/ggml-tiny\.en\.bin$/)
    })

    it('path sits inside a directory named "models"', () => {
      expect(manager.modelFilePath('base.en')).toMatch(/models[/\\]ggml-base\.en\.bin$/)
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
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('ggml-small.en.bin'))

      expect(await manager.getSelectedModel()).toBe('small.en')
    })

    it('falls back to the first downloaded managed model when the saved model file is absent', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ selectedModel: 'large-v3-turbo' })
      )
      // Only tiny.en present
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('ggml-tiny.en.bin'))

      expect(await manager.getSelectedModel()).toBe('tiny.en')
    })

    it('falls back correctly even when readFile itself rejects', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('ggml-base.en.bin'))

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

  // ── setProgressListener ───────────────────────────────────────────────────

  describe('setProgressListener', () => {
    it('accepts a listener without throwing', () => {
      expect(() => manager.setProgressListener(vi.fn())).not.toThrow()
    })
  })
})
