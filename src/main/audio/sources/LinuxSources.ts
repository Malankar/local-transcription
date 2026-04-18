import { execFileSync } from 'child_process'

import type { AudioSource } from '../../../shared/types'

export function getLinuxSources(): AudioSource[] {
  const output = execFileSync('pactl', ['list', 'sources', 'short'], {
    encoding: 'utf8',
  })

  const sources = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t')
      const id = parts[1] ?? ''
      const rawLabel = parts[1] ?? parts[0] ?? 'Unknown source'
      const isMonitor = id.endsWith('.monitor')

      return {
        id,
        label: formatLinuxLabel(rawLabel, isMonitor),
        isMonitor,
      } satisfies AudioSource
    })
    .filter((source) => source.id.length > 0)

  const preferredMonitorId = resolvePreferredMonitorId()
  const monitors = sources.filter((s) => s.isMonitor)
  const mics = sources.filter((s) => !s.isMonitor)

  if (preferredMonitorId) {
    monitors.sort((a, b) => {
      const aPref = a.id === preferredMonitorId ? 0 : 1
      const bPref = b.id === preferredMonitorId ? 0 : 1
      if (aPref !== bPref) return aPref - bPref
      return a.id.localeCompare(b.id)
    })
  } else {
    monitors.sort((a, b) => a.id.localeCompare(b.id))
  }

  mics.sort((a, b) => a.id.localeCompare(b.id))

  return [...monitors, ...mics]
}

/** Monitor for the default output sink — avoids picking e.g. HDMI when audio plays on analog. */
function resolvePreferredMonitorId(): string | null {
  try {
    const defaultSink = execFileSync('pactl', ['get-default-sink'], { encoding: 'utf8' }).trim()
    if (!defaultSink) return null
    return `${defaultSink}.monitor`
  } catch {
    return null
  }
}

function formatLinuxLabel(sourceName: string, isMonitor: boolean): string {
  let cleaned = sourceName
    .replace(/\.monitor$/u, '')
    .replace(/^alsa_output\./u, '')
    .replace(/^alsa_input\./u, '')
    // Strip PCI hardware address: pci-0000_00_1f.3.
    .replace(/^pci-[\da-f_]+\.\d+\./iu, '')
    // Strip USB prefix and serial: usb-Manufacturer_Model_Serial-XX.
    .replace(/^usb-/iu, '')
    .replace(/-[\da-f]{2}\.(?=\S)/iu, ' ')
    .replace(/[._-]+/gu, ' ')
    .trim()

  // Title-case each word
  cleaned = cleaned.replaceAll(/\b\w/gu, (c) => c.toUpperCase())

  return cleaned
}
