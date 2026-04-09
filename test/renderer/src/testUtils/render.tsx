import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface RenderResult {
  container: HTMLDivElement
  root: Root
  rerender: (node: React.ReactNode) => Promise<void>
  unmount: () => Promise<void>
}

export async function renderIntoDocument(node: React.ReactNode): Promise<RenderResult> {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)

  await act(async () => {
    root.render(node)
  })

  return {
    container,
    root,
    rerender: async (nextNode) => {
      await act(async () => {
        root.render(nextNode)
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

export async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}
