import { describe, expect, it, vi } from 'vitest'

import RecordingHubView from '../../../../src/renderer/src/components/RecordingHubView'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

describe('RecordingHubView', () => {
  it('scrolls the transcript viewport when new meeting segments arrive', async () => {
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
      getModels: vi.fn().mockResolvedValue([
        {
          id: 'base',
          name: 'Base',
          description: 'Downloaded model',
          sizeMb: 120,
          languages: 'en',
          accuracy: 4,
          speed: 4,
          recommended: true,
          engine: 'whisper' as const,
          runtime: 'node',
          runtimeModelName: 'base',
          downloadManaged: true,
          supportsGpuAcceleration: false,
          isDownloaded: true,
        },
      ]),
      getSelectedModel: vi.fn().mockResolvedValue('base'),
    })

    const { container } = await renderRendererApp(<RecordingHubView />)
    await flushMicrotasks()

    statusListener?.({ stage: 'capturing', detail: 'Recording' })
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

    transcriptListener?.({
      id: 'seg-1',
      startMs: 0,
      endMs: 1000,
      text: 'hello transcript',
      timestamp: '2026-04-10T10:00:00Z',
    })
    await flushMicrotasks()

    expect(scrollTopSpy).toHaveBeenCalledWith(1234)
  })

  it('starts live capture from the live workspace', async () => {
    const startCapture = vi.fn().mockResolvedValue(undefined)

    installMockApi({
      startCapture,
      getSources: vi.fn().mockResolvedValue([
        { id: 'system-1', label: 'System Audio', isMonitor: true },
        { id: 'mic-1', label: 'Microphone', isMonitor: false },
      ]),
      getModels: vi.fn().mockResolvedValue([
        {
          id: 'base',
          name: 'Base',
          description: 'Downloaded model',
          sizeMb: 120,
          languages: 'en',
          accuracy: 4,
          speed: 4,
          recommended: true,
          engine: 'whisper' as const,
          runtime: 'node',
          runtimeModelName: 'base',
          downloadManaged: true,
          supportsGpuAcceleration: false,
          isDownloaded: true,
        },
      ]),
      getSelectedModel: vi.fn().mockResolvedValue('base'),
    })

    const { container } = await renderRendererApp(<RecordingHubView />)
    await flushMicrotasks()

    Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Live Transcription'))?.click()
    await flushMicrotasks()
    Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('title') === 'Start live transcription')?.click()
    await flushMicrotasks()

    expect(startCapture).toHaveBeenCalledWith({
      mode: 'mic',
      systemSourceId: 'system-1',
      micSourceId: 'mic-1',
      profile: 'live',
    })
  })
})
