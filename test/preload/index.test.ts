import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

describe('preload api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the expected renderer api and wires subscriptions', async () => {
    await import('../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledOnce()

    const [, api] = exposeInMainWorld.mock.calls[0]
    invoke.mockResolvedValueOnce([{ id: 'src-1' }])

    await expect(api.getSources()).resolves.toEqual([{ id: 'src-1' }])
    expect(invoke).toHaveBeenCalledWith('sources:get')

    expect(typeof api.ipcInvoke).toBe('function')
    expect(typeof api.ollamaPullCancel).toBe('function')
    expect(typeof api.onOllamaPullProgress).toBe('function')
    invoke.mockResolvedValueOnce(undefined)
    await expect(api.ipcInvoke('history:regenerateSummary', 'id-1')).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('history:regenerateSummary', 'id-1')

    const listener = vi.fn()
    const unsubscribe = api.onStatus(listener)
    expect(on).toHaveBeenCalledWith('status', expect.any(Function))

    const wrapped = on.mock.calls[0][1]
    wrapped({}, { stage: 'ready', detail: 'Ready' })
    expect(listener).toHaveBeenCalledWith({ stage: 'ready', detail: 'Ready' })

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('status', wrapped)
  })
})
