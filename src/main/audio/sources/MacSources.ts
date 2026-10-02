import { spawnSync } from 'child_process'

import type { AudioSource } from '../../../shared/types'
import { FFMPEG_PATH } from '../ffmpegPath'
import { isSystemAudioTapSupported, MAC_SYSTEM_AUDIO_ID } from '../systemAudioTap'

// Virtual loopback drivers are the only way to capture system audio on macOS.
const LOOPBACK_PATTERN = /blackhole|soundflower|loopback|aggregate/iu

export function getMacSources(): AudioSource[] {
  // ffmpeg prints the device list to stderr and always exits non-zero for this command.
  const { stderr } = spawnSync(FFMPEG_PATH, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
    encoding: 'utf8',
  })

  const devices = parseAvfoundationAudioDevices(stderr ?? '')
  if (!isSystemAudioTapSupported()) return devices

  return [{ id: MAC_SYSTEM_AUDIO_ID, label: 'System audio (all apps)', isMonitor: true }, ...devices]
}

export function parseAvfoundationAudioDevices(output: string): AudioSource[] {
  const audioSection = output.split(/AVFoundation audio devices:/u)[1] ?? ''

  const sources = [...audioSection.matchAll(/\]\s*\[\d+\]\s*(.+)$/gmu)].map((match) => {
    const name = match[1].trim()
    return {
      // avfoundation input syntax is "<video>:<audio>"; selecting by name survives index reshuffles.
      id: `:${name}`,
      label: name,
      isMonitor: LOOPBACK_PATTERN.test(name),
    } satisfies AudioSource
  })

  return [...sources.filter((s) => s.isMonitor), ...sources.filter((s) => !s.isMonitor)]
}
