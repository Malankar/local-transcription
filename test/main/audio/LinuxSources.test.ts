import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
  default: { execFileSync: execFileSyncMock },
}))

import { execFileSync } from 'child_process'
import { getLinuxSources } from '../../../src/main/audio/sources/LinuxSources'

describe('getLinuxSources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses pactl output into monitor and microphone sources', () => {
    vi.mocked(execFileSync).mockReturnValue(
      [
        '52\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tmodule\tstate',
        '61\talsa_input.usb-Logitech_Yeti-00.analog-stereo\tmodule\tstate',
      ].join('\n'),
    )

    expect(getLinuxSources()).toEqual([
      { id: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', label: 'Analog Stereo', isMonitor: true },
      { id: 'alsa_input.usb-Logitech_Yeti-00.analog-stereo', label: 'Logitech Yeti Analog Stereo', isMonitor: false },
    ])
  })

  it('drops malformed rows without an id', () => {
    vi.mocked(execFileSync).mockReturnValue('0\t\tmodule\tstate\n')

    expect(getLinuxSources()).toEqual([])
  })
})
