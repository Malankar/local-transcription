import { execFileSync } from 'child_process'

import type { AudioSource } from '../../../shared/types'

export function getLinuxSources(): AudioSource[] {
  const output = execFileSync('pactl', ['list', 'sources', 'short'], {
    encoding: 'utf8',
  })

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/)
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
}

function formatLinuxLabel(sourceName: string, isMonitor: boolean): string {
  const cleaned = sourceName
    .replace(/\.monitor$/u, '')
    .replace(/^alsa_output\./u, '')
    .replace(/^alsa_input\./u, '')
    .replace(/[._-]+/gu, ' ')
    .trim()

  return isMonitor ? `${cleaned} (system output)` : `${cleaned} (microphone)`
}
