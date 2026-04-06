import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsManager } from '../../../src/main/settings/SettingsManager'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('node:fs/promises', () => {
  const readFile = vi.fn()
  const writeFile = vi.fn()
  return {
    readFile,
    writeFile,
    default: { readFile, writeFile },
  }
})

describe('SettingsManager', () => {
  const userDataPath = '/tmp/settings'
  const settingsPath = join(userDataPath, 'app-settings.json')
  let settingsManager: SettingsManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(writeFile).mockResolvedValue(undefined)
    settingsManager = new SettingsManager(userDataPath)
  })

  describe('getSettings', () => {
    it('returns default settings when file does not exist', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))
      
      const settings = await settingsManager.getSettings()
      expect(settings.historyLimit).toBe(5)
      expect(settings.startHidden).toBe(false)
    })

    it('loads settings from file', async () => {
      const stored = { historyLimit: 10 }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(stored))

      const settings = await settingsManager.getSettings()
      expect(settings.historyLimit).toBe(10)
      expect(settings.startHidden).toBe(false) // from defaults
    })

    it('caches settings after first load', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ historyLimit: 10 }))
      
      await settingsManager.getSettings()
      await settingsManager.getSettings()
      
      expect(readFile).toHaveBeenCalledTimes(1)
    })

    it('returns a copy — mutating the result does not affect the cache', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const s1 = await settingsManager.getSettings()
      s1.historyLimit = 999

      const s2 = await settingsManager.getSettings()
      expect(s2.historyLimit).toBe(5) // default unchanged
    })

    it('merges stored values with defaults (stored partial settings)', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ historyLimit: 50, launchOnStartup: true })
      )

      const settings = await settingsManager.getSettings()
      expect(settings.historyLimit).toBe(50)
      expect(settings.launchOnStartup).toBe(true)
      // Keys absent from stored file should fall back to defaults
      expect(settings.showTrayIcon).toBe(true)
      expect(settings.muteWhileRecording).toBe(false)
    })
  })

  describe('updateSettings', () => {
    it('updates cache and writes to file', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'))
      
      const updated = await settingsManager.updateSettings({ historyLimit: 20 })
      
      expect(updated.historyLimit).toBe(20)
      expect(writeFile).toHaveBeenCalledWith(
        settingsPath,
        expect.stringContaining('"historyLimit": 20'),
        'utf-8'
      )

      // Verify cache was updated (no extra readFile)
      const current = await settingsManager.getSettings()
      expect(current.historyLimit).toBe(20)
    })

    it('preserves unmentioned settings when performing a partial update', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      // First establish baseline defaults, then update only one field
      await settingsManager.updateSettings({ historyLimit: 7 })
      const updated = await settingsManager.updateSettings({ startHidden: true })

      expect(updated.historyLimit).toBe(7)  // preserved from previous update
      expect(updated.startHidden).toBe(true) // newly updated
    })

    it('multiple sequential updates accumulate correctly', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      await settingsManager.updateSettings({ historyLimit: 10 })
      await settingsManager.updateSettings({ launchOnStartup: true })
      const final = await settingsManager.updateSettings({ muteWhileRecording: true })

      expect(final.historyLimit).toBe(10)
      expect(final.launchOnStartup).toBe(true)
      expect(final.muteWhileRecording).toBe(true)
    })

    it('writes valid JSON to the settings file', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      await settingsManager.updateSettings({ historyLimit: 15 })

      const written = vi.mocked(writeFile).mock.calls[0][1] as string
      expect(() => JSON.parse(written)).not.toThrow()
      const parsed = JSON.parse(written)
      expect(parsed.historyLimit).toBe(15)
    })

    it('writes to the correct file path', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      await settingsManager.updateSettings({ historyLimit: 1 })

      expect(writeFile).toHaveBeenCalledWith(settingsPath, expect.any(String), 'utf-8')
    })

    it('returns a copy — mutating the result does not corrupt the cache', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))

      const result = await settingsManager.updateSettings({ historyLimit: 8 })
      result.historyLimit = 999

      const current = await settingsManager.getSettings()
      expect(current.historyLimit).toBe(8)
    })
  })
})

