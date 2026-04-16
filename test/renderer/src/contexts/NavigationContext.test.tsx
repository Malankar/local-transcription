import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { useNavigationContext, NavigationProvider } from '../../../../src/renderer/src/contexts/NavigationContext'
import { renderIntoDocument } from '../testUtils/render'

function Probe() {
  const { activeView, navigateTo } = useNavigationContext()

  return (
    <div>
      <span data-testid="view">{activeView}</span>
      <button type="button" onClick={() => navigateTo('history')}>
        history
      </button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe('NavigationContext', () => {
  it('starts on the recording view and updates through actions', async () => {
    mounted = await renderIntoDocument(
      <NavigationProvider>
        <Probe />
      </NavigationProvider>,
    )

    expect(mounted.container.querySelector('[data-testid="view"]')?.textContent).toBe('recording')

    await act(async () => {
      mounted?.container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mounted.container.querySelector('[data-testid="view"]')?.textContent).toBe('history')
  })
})
