import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsManager } from './SettingsManager'
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

      // Verify cache was updated
      const current = await settingsManager.getSettings()
      expect(current.historyLimit).toBe(20)
    })
  })
})
