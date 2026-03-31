import type { AudioSource } from '../../shared/types'
import { getLinuxSources } from './sources/LinuxSources'
import { getMacSources } from './sources/MacSources'
import { getWindowsSources } from './sources/WindowsSources'

export class SourceDiscovery {
  getSources(): AudioSource[] {
    switch (process.platform) {
      case 'linux':
        return getLinuxSources()
      case 'darwin':
        return getMacSources()
      case 'win32':
        return getWindowsSources()
      default:
        return []
    }
  }
}
