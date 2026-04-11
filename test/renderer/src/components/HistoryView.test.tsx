import { describe, expect, it, vi } from 'vitest'

import { HistorySidebarArchive } from '../../../../src/renderer/src/components/HistorySidebarArchive'
import { HistoryView } from '../../../../src/renderer/src/components/HistoryView'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

function HistoryLayout() {
  return (
    <div className="flex h-[720px] flex-row">
      <div className="flex w-[288px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-sidebar/95">
        <HistorySidebarArchive />
      </div>
      <div className="min-h-0 min-w-0 flex-1 bg-background">
        <HistoryView />
      </div>
    </div>
  )
}

describe('HistoryView', () => {
  it('loads sessions, opens a transcript, and exports the current selection', async () => {
    const historySession = {
      id: 'session-1',
      label: 'Weekly standup',
      startTime: '2026-04-09T08:00:00Z',
      endTime: '2026-04-09T08:10:00Z',
      durationMs: 600_000,
      wordCount: 48,
      segmentCount: 2,
      preview: 'hello world',
      profile: 'meeting' as const,
      segments: [
        {
          id: 'seg-1',
          startMs: 0,
          endMs: 1000,
          text: 'Hello',
          timestamp: '2026-04-09T08:00:00Z',
        },
        {
          id: 'seg-2',
          startMs: 1000,
          endMs: 2000,
          text: 'world',
          timestamp: '2026-04-09T08:00:01Z',
        },
      ],
    }

    const exportHistoryTxt = vi.fn().mockResolvedValue({ canceled: false, path: '/tmp/history.txt' })

    installMockApi({
      listHistory: vi.fn().mockResolvedValue([historySession]),
      getHistorySession: vi.fn().mockResolvedValue(historySession),
      exportHistoryTxt,
      exportHistorySrt: vi.fn().mockResolvedValue({ canceled: false, path: '/tmp/history.srt' }),
    })

    const { container } = await renderRendererApp(<HistoryLayout />)
    await flushMicrotasks()

    expect(container.textContent).toContain('Weekly standup')

    Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Weekly standup'))?.click()
    await flushMicrotasks()

    expect(container.textContent).toContain('Saved locally and ready to export')
    expect(container.textContent).toContain('Hello')
    expect(container.textContent).toContain('world')

    Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('TXT'))?.click()
    await flushMicrotasks()

    expect(exportHistoryTxt).toHaveBeenCalledWith('session-1')
    expect(container.textContent).toContain('/tmp/history.txt')
  })

  it('uses neutral-first surfaces with restrained history accents', async () => {
    installMockApi({
      listHistory: vi.fn().mockResolvedValue([]),
      getHistorySession: vi.fn().mockResolvedValue(null),
    })

    const { container } = await renderRendererApp(<HistoryLayout />)
    await flushMicrotasks()

    const mainPane = container.querySelector('.flex-1.bg-background')
    expect(mainPane?.className).toContain('bg-background')
    expect(mainPane?.className).not.toContain('radial-gradient')

    expect(container.innerHTML).toContain('border-primary')
    expect(container.innerHTML).toContain('bg-primary/')
  })
})
