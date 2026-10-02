import { describe, expect, it } from 'vitest'

import { parseAvfoundationAudioDevices } from '../../../src/main/audio/sources/MacSources'
import { isSystemAudioTapSupported } from '../../../src/main/audio/systemAudioTap'

const OUTPUT = `[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] FaceTime HD Camera
[AVFoundation indev @ 0x1] [1] Capture screen 0
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone
[AVFoundation indev @ 0x1] [1] BlackHole 2ch
[in#0 @ 0x2] Error opening input: Input/output error
Error opening input file .`

describe('parseAvfoundationAudioDevices', () => {
  it('returns audio devices only, loopback drivers first as system sources', () => {
    expect(parseAvfoundationAudioDevices(OUTPUT)).toEqual([
      { id: ':BlackHole 2ch', label: 'BlackHole 2ch', isMonitor: true },
      { id: ':MacBook Pro Microphone', label: 'MacBook Pro Microphone', isMonitor: false },
    ])
  })

  it('returns an empty list when ffmpeg output has no audio section', () => {
    expect(parseAvfoundationAudioDevices('')).toEqual([])
  })
})

describe('isSystemAudioTapSupported', () => {
  it('requires macOS 14.2+ (Darwin 23.2+)', () => {
    expect(isSystemAudioTapSupported('23.1.0')).toBe(false)
    expect(isSystemAudioTapSupported('23.2.0')).toBe(true)
    expect(isSystemAudioTapSupported('25.0.0')).toBe(true)
    expect(isSystemAudioTapSupported('22.6.0')).toBe(false)
  })
})
