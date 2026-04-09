import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/main/audio/sources/LinuxSources', () => ({
  getLinuxSources: vi.fn(() => [{ id: 'linux', label: 'Linux Monitor', isMonitor: true }]),
}))

vi.mock('../../../src/main/audio/sources/MacSources', () => ({
  getMacSources: vi.fn(() => [{ id: 'mac', label: 'Mac Mic', isMonitor: false }]),
}))

vi.mock('../../../src/main/audio/sources/WindowsSources', () => ({
  getWindowsSources: vi.fn(() => [{ id: 'win', label: 'Windows Mix', isMonitor: true }]),
}))

import { SourceDiscovery } from '../../../src/main/audio/SourceDiscovery'
import { getLinuxSources } from '../../../src/main/audio/sources/LinuxSources'
import { getMacSources } from '../../../src/main/audio/sources/MacSources'
import { getWindowsSources } from '../../../src/main/audio/sources/WindowsSources'

describe('SourceDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses linux discovery on linux', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

    const sources = new SourceDiscovery().getSources()

    expect(getLinuxSources).toHaveBeenCalledOnce()
    expect(sources).toEqual([{ id: 'linux', label: 'Linux Monitor', isMonitor: true }])
  })

  it('uses mac discovery on darwin', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    const sources = new SourceDiscovery().getSources()

    expect(getMacSources).toHaveBeenCalledOnce()
    expect(sources[0].id).toBe('mac')
  })

  it('uses windows discovery on win32', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    const sources = new SourceDiscovery().getSources()

    expect(getWindowsSources).toHaveBeenCalledOnce()
    expect(sources[0].id).toBe('win')
  })

  it('returns an empty list on unsupported platforms', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('freebsd')

    expect(new SourceDiscovery().getSources()).toEqual([])
  })
})
