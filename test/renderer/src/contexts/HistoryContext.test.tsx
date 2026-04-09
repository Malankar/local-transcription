import { afterEach, describe, expect, it, vi } from 'vitest'

import { HistoryProvider, useHistoryContext } from '../../../../src/renderer/src/contexts/HistoryContext'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'

function Probe() {
  const {
    historySessions,
    selectedHistoryId,
    selectedSession,
    historyExportStatus,
    selectSession,
    deleteSession,
    exportSessionTxt,
  } = useHistoryContext()

  return (
    <div>
      <span data-testid="count">{historySessions.length}</span>
      <span data-testid="selected">{selectedHistoryId ?? 'none'}</span>
      <span data-testid="label">{selectedSession?.label ?? 'none'}</span>
      <span data-testid="export">{historyExportStatus?.detail ?? 'none'}</span>
      <button onClick={() => selectSession('session-1')}>select</button>
      <button onClick={() => void deleteSession('session-1')}>delete</button>
      <button onClick={() => void exportSessionTxt()}>export</button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe('HistoryContext', () => {
  it('loads history, reacts to saved events, and exports the selected session', async () => {
    let savedListener: ((meta: any) => void) | undefined
    const api = installMockApi({
      listHistory: vi.fn().mockResolvedValue([
        {
          id: 'session-1',
          label: 'Morning standup',
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-01T00:05:00.000Z',
          durationMs: 300000,
          wordCount: 42,
          segmentCount: 1,
          preview: 'hello',
          profile: 'meeting',
        },
      ]),
      getHistorySession: vi.fn().mockResolvedValue({
        id: 'session-1',
        label: 'Morning standup',
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:05:00.000Z',
        durationMs: 300000,
        wordCount: 42,
        segmentCount: 1,
        preview: 'hello',
        profile: 'meeting',
        segments: [{ id: '1', startMs: 0, endMs: 5000, text: 'hello', timestamp: 'T1' }],
      }),
      exportHistoryTxt: vi.fn().mockResolvedValue({ canceled: false, path: '/tmp/history.txt' }),
      onHistorySaved: vi.fn().mockImplementation((listener) => {
        savedListener = listener
        return () => undefined
      }),
    })
    const onSessionSaved = vi.fn()

    mounted = await renderIntoDocument(
      <HistoryProvider onSessionSaved={onSessionSaved}>
        <Probe />
      </HistoryProvider>,
    )

    await flushMicrotasks()
    expect(mounted.container.querySelector('[data-testid="count"]')?.textContent).toBe('1')

    mounted.container.querySelectorAll('button')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()
    expect(api.getHistorySession).toHaveBeenCalledWith('session-1')
    expect(mounted.container.querySelector('[data-testid="label"]')?.textContent).toBe('Morning standup')

    mounted.container.querySelectorAll('button')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()
    expect(api.exportHistoryTxt).toHaveBeenCalledWith('session-1')
    expect(mounted.container.querySelector('[data-testid="export"]')?.textContent).toBe('/tmp/history.txt')

    savedListener?.({
      id: 'session-2',
      label: 'Live captions',
      startTime: '2024-01-02T00:00:00.000Z',
      endTime: '2024-01-02T00:05:00.000Z',
      durationMs: 300000,
      wordCount: 30,
      segmentCount: 1,
      preview: 'world',
      profile: 'meeting',
    })
    await flushMicrotasks()
    expect(onSessionSaved).toHaveBeenCalledOnce()
    expect(mounted.container.querySelector('[data-testid="selected"]')?.textContent).toBe('session-2')
  })
})
