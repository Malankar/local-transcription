import { describe, expect, it, vi } from 'vitest'

import RecordingHubView from '../../../../src/renderer/src/components/RecordingHubView'
import { installMockApi, baseDownloadedModelList } from '../testUtils/mockApi'
import { makeListenerCapture } from '../testUtils/listenerCapture'
import { flushMicrotasks } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

describe('RecordingHubView', () => {
  it('scrolls the transcript viewport when new meeting segments arrive', async () => {
    const lc = makeListenerCapture()

    installMockApi({
      onStatus: lc.mockOnStatus,
      onTranscriptSegment: lc.mockOnTranscript,
      getModels: vi.fn().mockResolvedValue(baseDownloadedModelList()),
      getSelectedModel: vi.fn().mockResolvedValue('base'),
    })

    const { container } = await renderRendererApp(<RecordingHubView />)
    await flushMicrotasks()

    lc.fireStatus({ stage: 'capturing', detail: 'Recording' })
    await flushMicrotasks()

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
    expect(viewport).not.toBeNull()

    const scrollTopSpy = vi.fn()
    Object.defineProperty(viewport!, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: scrollTopSpy,
    })
    Object.defineProperty(viewport!, 'scrollHeight', {
      configurable: true,
      value: 1234,
    })

    lc.fireSegment({
      id: 'seg-1',
      startMs: 0,
      endMs: 1000,
      text: 'hello transcript',
      timestamp: '2026-04-10T10:00:00Z',
    })
    await flushMicrotasks()

    expect(scrollTopSpy).toHaveBeenCalledWith(1234)
  })

  it('starts meeting capture from the record workspace', async () => {
    const startCapture = vi.fn().mockResolvedValue(undefined)

    installMockApi({
      startCapture,
      getSources: vi.fn().mockResolvedValue([
        { id: 'system-1', label: 'System Audio', isMonitor: true },
        { id: 'mic-1', label: 'Microphone', isMonitor: false },
      ]),
      getModels: vi.fn().mockResolvedValue(baseDownloadedModelList()),
      getSelectedModel: vi.fn().mockResolvedValue('base'),
    })

    const { container } = await renderRendererApp(<RecordingHubView />)
    await flushMicrotasks()

    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Start Recording'))
      ?.click()
    await flushMicrotasks()

    expect(startCapture).toHaveBeenCalledWith({
      mode: 'mixed',
      systemSourceId: 'system-1',
      micSourceId: 'mic-1',
      profile: 'meeting',
    })
  })
})
