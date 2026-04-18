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
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (args?.[0] === 'get-default-sink') {
        return 'alsa_output.pci-0000_00_1f.3.analog-stereo\n'
      }
      return [
        '52\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tmodule\tstate',
        '61\talsa_input.usb-Logitech_Yeti-00.analog-stereo\tmodule\tstate',
      ].join('\n')
    })

    expect(getLinuxSources()).toEqual([
      { id: 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor', label: 'Analog Stereo', isMonitor: true },
      { id: 'alsa_input.usb-Logitech_Yeti-00.analog-stereo', label: 'Logitech Yeti Analog Stereo', isMonitor: false },
    ])
  })

  it('orders the default output monitor before other monitors', () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (args?.[0] === 'get-default-sink') {
        return 'alsa_output.pci-0000_00_1f.3.analog-stereo\n'
      }
      return [
        '56\talsa_output.pci-0000_01_00.1.hdmi-stereo.monitor\tPipeWire\tstate',
        '57\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tPipeWire\tstate',
        '58\talsa_input.pci-0000_00_1f.3.analog-stereo\tPipeWire\tstate',
      ].join('\n')
    })

    expect(getLinuxSources().map((s) => s.id)).toEqual([
      'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
      'alsa_output.pci-0000_01_00.1.hdmi-stereo.monitor',
      'alsa_input.pci-0000_00_1f.3.analog-stereo',
    ])
  })

  it('drops malformed rows without an id', () => {
    vi.mocked(execFileSync).mockImplementation((_file, args) => {
      if (args?.[0] === 'get-default-sink') {
        return 'some-sink\n'
      }
      return '0\t\tmodule\tstate\n'
    })

    expect(getLinuxSources()).toEqual([])
  })
})
