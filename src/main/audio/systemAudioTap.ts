import { release } from 'node:os'
import { dirname, join } from 'node:path'

import { toUnpackedPath } from './ffmpegPath'

/** Virtual source id for macOS system audio captured via Core Audio taps (no BlackHole needed). */
export const MAC_SYSTEM_AUDIO_ID = 'macos-system-audio'

/** Core Audio taps need macOS 14.2+, which is Darwin 23.2+. */
export function isSystemAudioTapSupported(darwinRelease = release()): boolean {
  const [major = 0, minor = 0] = darwinRelease.split('.').map(Number)
  return major > 23 || (major === 23 && minor >= 2)
}

/** audiotee writes 16 kHz mono s16le PCM to stdout when given a sample rate. */
export function getAudioTeeCommand(): { path: string; args: string[] } {
  const entry = require.resolve('audiotee')
  return {
    path: toUnpackedPath(join(dirname(entry), '..', 'bin', 'audiotee')),
    args: ['--sample-rate', '16000'],
  }
}
