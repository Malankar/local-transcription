import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NavigationProvider } from '../../../../src/renderer/src/contexts/NavigationContext'
import { RecordingProvider, useRecordingContext } from '../../../../src/renderer/src/contexts/RecordingContext'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'

function Probe() {
  const { isBusy, transcribeMeetingFile } = useRecordingContext()

  return (
    <div>
      <span data-testid="busy">{String(isBusy)}</span>
      <button
        type="button"
        onClick={() => {
          transcribeMeetingFile().catch(() => {})
        }}
      >
        upload
      </button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe('RecordingContext', () => {
  it('clears busy when upload receives immediate terminal status', async () => {
    let statusListener: ((status: { stage: string; detail: string }) => void) | undefined

    installMockApi({
      transcribeMeetingFile: vi.fn().mockImplementation(
        () =>
          new Promise<void>(() => {
            // Keep pending; busy must clear from status event path.
          }),
      ),
      onStatus: vi.fn().mockImplementation((listener) => {
        statusListener = listener
        return () => undefined
      }),
    })

    mounted = await renderIntoDocument(
      <NavigationProvider>
        <RecordingProvider>
          <Probe />
        </RecordingProvider>
      </NavigationProvider>,
    )
    await flushMicrotasks()

    await act(async () => {
      mounted?.container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushMicrotasks()

    expect(mounted.container.querySelector('[data-testid="busy"]')?.textContent).toBe('true')

    await act(async () => {
      statusListener?.({ stage: 'ready', detail: 'Upload complete' })
    })
    await flushMicrotasks()

    expect(mounted.container.querySelector('[data-testid="busy"]')?.textContent).toBe('false')
  })
})
