import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { useNavigationContext, NavigationProvider } from '../../../../src/renderer/src/contexts/NavigationContext'
import { renderIntoDocument } from '../testUtils/render'

function Probe() {
  const { activeView, recordingSubView, navigateTo, setRecordingSubView } = useNavigationContext()

  return (
    <div>
      <span data-testid="view">{activeView}</span>
      <span data-testid="subview">{recordingSubView}</span>
      <button onClick={() => navigateTo('history')}>history</button>
      <button onClick={() => setRecordingSubView('live')}>live</button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe('NavigationContext', () => {
  it('starts on the recording meetings view and updates through actions', async () => {
    mounted = await renderIntoDocument(
      <NavigationProvider>
        <Probe />
      </NavigationProvider>,
    )

    expect(mounted.container.querySelector('[data-testid="view"]')?.textContent).toBe('recording')
    expect(mounted.container.querySelector('[data-testid="subview"]')?.textContent).toBe('meetings')

    await act(async () => {
      mounted?.container.querySelectorAll('button')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      mounted?.container.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mounted.container.querySelector('[data-testid="view"]')?.textContent).toBe('history')
    expect(mounted.container.querySelector('[data-testid="subview"]')?.textContent).toBe('live')
  })
})
