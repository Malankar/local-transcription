import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderMock = vi.fn()
const createRootMock = vi.fn(() => ({ render: renderMock, unmount: vi.fn() }))

vi.mock('react-dom/client', () => ({
  default: { createRoot: createRootMock },
  createRoot: createRootMock,
}))

vi.mock('../../../src/renderer/src/App', () => ({
  App: () => <div>Mock App</div>,
}))

describe('renderer entry point', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = '<div id="root"></div>'
    createRootMock.mockClear()
    renderMock.mockClear()
  })

  it('mounts the app into the root element inside StrictMode', async () => {
    await import('../../../src/renderer/src/main')

    expect(createRootMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'))
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(renderMock.mock.calls[0][0].type).toBe(React.StrictMode)
  })
})
