import { describe, expect, it } from 'vitest'

import { App } from '../../../src/renderer/src/App'
import { installMockApi } from './testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from './testUtils/render'

describe('App', () => {
  it('renders the renderer shell with the default recording workspace', async () => {
    installMockApi()

    const { container } = await renderIntoDocument(<App />)
    await flushMicrotasks()

    expect(container.textContent).toContain('Transcribe')
    expect(container.textContent).toContain('Start Recording')
    expect(container.textContent).toContain('transcript streams here')
  })
})
