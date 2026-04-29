import { describe, expect, it, vi } from 'vitest'

import AppShell from '../../../../src/renderer/src/components/AppShell'
import { installMockApi } from '../testUtils/mockApi'
import { makeListenerCapture } from '../testUtils/listenerCapture'
import { flushMicrotasks } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

vi.mock('../../../../src/renderer/src/components/RecordSurface', () => ({
  default: () => <div>Recording Stub</div>,
}))

describe('AppShell', () => {
  it('navigates between views and responds to capture state', async () => {
    const lc = makeListenerCapture()

    installMockApi({
      onStatus: lc.mockOnStatus,
      onTranscriptSegment: lc.mockOnTranscript,
      listHistory: vi.fn().mockResolvedValue([]),
    })

    const { container } = await renderRendererApp(<AppShell />)
    await flushMicrotasks()

    expect(container.textContent).toContain('Recording Stub')
    expect(container.textContent).toContain('Transcribe')

    Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Library'))?.click()
    await flushMicrotasks()
    expect(container.textContent).toContain('Transcriptions')

    lc.fireStatus({ stage: 'capturing', detail: 'Running' })
    await flushMicrotasks()
    expect(container.textContent).toContain('Recording Stub')

    lc.fireSegment({
      id: 'seg-1',
      startMs: 0,
      endMs: 1000,
      text: 'hello',
      timestamp: '2026-04-10T10:00:00Z',
    })
    await flushMicrotasks()

    lc.fireStatus({ stage: 'stopped', detail: 'Done' })
    await flushMicrotasks()

    // Stop no longer auto-switches to Library (navigation happens on history:saved from main).
    expect(container.textContent).toContain('Recording Stub')

    Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Library'))?.click()
    await flushMicrotasks()
    expect(container.textContent).toContain('Transcriptions')
  })
})
