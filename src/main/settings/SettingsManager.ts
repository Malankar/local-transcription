import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AppSettings } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  startHidden: false,
  launchOnStartup: false,
  showTrayIcon: true,
  unloadModelAfterMinutes: 5,
  voiceToTextShortcut: process.platform === 'darwin' ? 'Command+Control+V' : 'Meta+V',
  muteWhileRecording: false,
  historyLimit: 5,
  autoDeleteRecordings: 'never',
  keepStarredUntilDeleted: true,
}

export class SettingsManager {
  private readonly settingsPath: string
  private cache: AppSettings | null = null

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'app-settings.json')
  }

  async getSettings(): Promise<AppSettings> {
    if (this.cache) return { ...this.cache }

    try {
      const text = await readFile(this.settingsPath, 'utf-8')
      const stored = JSON.parse(text) as Partial<AppSettings>
      this.cache = { ...DEFAULT_SETTINGS, ...stored }
    } catch {
      this.cache = { ...DEFAULT_SETTINGS }
    }

    return { ...this.cache }
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings()
    const updated = { ...current, ...partial }
    this.cache = updated
    await writeFile(this.settingsPath, JSON.stringify(updated, null, 2), 'utf-8')
    return { ...updated }
  }
}
