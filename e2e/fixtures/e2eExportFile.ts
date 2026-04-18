import { readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Latest `lt-e2e-export-*.<ext>` in OS tmp modified after `sinceMs` (exclusive). */
export function readLatestE2eExportAfter(ext: string, sinceMs: number): string {
  const dir = tmpdir()
  let bestPath: string | null = null
  let bestMtime = 0
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('lt-e2e-export-') || !name.endsWith(`.${ext}`)) continue
    const full = path.join(dir, name)
    let mtime: number
    try {
      mtime = statSync(full).mtimeMs
    } catch {
      continue
    }
    if (mtime <= sinceMs) continue
    if (mtime > bestMtime) {
      bestMtime = mtime
      bestPath = full
    }
  }
  if (!bestPath) {
    throw new Error(`No lt-e2e-export *.${ext} newer than ${sinceMs} in ${dir}`)
  }
  return readFileSync(bestPath, 'utf8')
}
