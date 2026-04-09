import { describe, expect, it, vi } from 'vitest'

import AppShell from '../../../../src/renderer/src/components/AppShell'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

vi.mock('../../../../src/renderer/src/components/RecordingHubView', () => ({
  default: () => <div>Recording Stub</div>,
}))
vi.mock('../../../../src/renderer/src/components/ModelsView', () => ({
  ModelsView: () => <div>Models Stub</div>,
}))
vi.mock('../../../../src/renderer/src/components/HistoryView', () => ({
  HistoryView: () => <div>History Stub</div>,
}))
vi.mock('../../../../src/renderer/src/components/SettingsView', () => ({
  SettingsView: () => <div>Settings Stub</div>,
}))

describe('AppShell', () => {
  it('navigates between views and responds to capture state', async () => {
    let statusListener: ((status: { stage: string; detail: string }) => void) | undefined
    let transcriptListener: ((segment: { id: string; startMs: number; endMs: number; text: string; timestamp: string }) => void) | undefined

    installMockApi({
      onStatus: vi.fn().mockImplementation((listener) => {
        statusListener = listener
        return () => undefined
      }),
      onTranscriptSegment: vi.fn().mockImplementation((listener) => {
        transcriptListener = listener
        return () => undefined
      }),
      listHistory: vi.fn().mockResolvedValue([]),
    })

    const { container } = await renderRendererApp(<AppShell />)
    await flushMicrotasks()

    expect(container.textContent).toContain('Recording Stub')
    expect(container.textContent).toContain('Meeting Recording')

    Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('History'))?.click()
    await flushMicrotasks()
    expect(container.textContent).toContain('Session History')
    expect(container.textContent).toContain('History Stub')

    statusListener?.({ stage: 'capturing', detail: 'Running' })
    await flushMicrotasks()
    expect(container.textContent).toContain('Meeting Recording')
    expect(container.textContent).toContain('Recording Stub')

    transcriptListener?.({
      id: 'seg-1',
      startMs: 0,
      endMs: 1000,
      text: 'hello',
      timestamp: '2026-04-10T10:00:00Z',
    })
    await flushMicrotasks()

    statusListener?.({ stage: 'stopped', detail: 'Done' })
    await flushMicrotasks()

    expect(container.textContent).toContain('Session History')
  })
})
