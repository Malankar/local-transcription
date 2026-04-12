import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelsProvider, useModelsContext } from '../../../../src/renderer/src/contexts/ModelsContext'
import { installMockApi, makeDownloadProgress } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'

function Probe() {
  const {
    selectedModelId,
    downloadedModels,
    downloadError,
    downloadProgress,
    selectModel,
    downloadModel,
    cancelDownload,
  } = useModelsContext()

  return (
    <div>
      <span data-testid="selected">{selectedModelId ?? 'none'}</span>
      <span data-testid="downloaded">{String(downloadedModels.length)}</span>
      <span data-testid="error">{downloadError || 'none'}</span>
      <span data-testid="progress">{downloadProgress?.percent ?? 0}</span>
      <button onClick={() => void selectModel('tiny.en')}>select</button>
      <button onClick={() => void downloadModel('base.en')}>download</button>
      <button onClick={() => void cancelDownload()}>cancel</button>
    </div>
  )
}

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe('ModelsContext', () => {
  it('loads models, tracks selection, and refreshes after download progress completes', async () => {
    let progressListener: ((progress: ReturnType<typeof makeDownloadProgress>) => void) | undefined
    const api = installMockApi({
      getModels: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'tiny.en', name: 'Tiny', description: '', sizeMb: 75, languages: 'en', accuracy: 2, speed: 5, recommended: true, engine: 'whisper', runtime: 'node', runtimeModelName: 'tiny', downloadManaged: true, supportsGpuAcceleration: false, isDownloaded: true },
          { id: 'base.en', name: 'Base', description: '', sizeMb: 150, languages: 'en', accuracy: 3, speed: 4, recommended: false, engine: 'whisper', runtime: 'node', runtimeModelName: 'base', downloadManaged: true, supportsGpuAcceleration: false, isDownloaded: false },
        ])
        .mockResolvedValue([
          { id: 'tiny.en', name: 'Tiny', description: '', sizeMb: 75, languages: 'en', accuracy: 2, speed: 5, recommended: true, engine: 'whisper', runtime: 'node', runtimeModelName: 'tiny', downloadManaged: true, supportsGpuAcceleration: false, isDownloaded: true },
          { id: 'base.en', name: 'Base', description: '', sizeMb: 150, languages: 'en', accuracy: 3, speed: 4, recommended: false, engine: 'whisper', runtime: 'node', runtimeModelName: 'base', downloadManaged: true, supportsGpuAcceleration: false, isDownloaded: true },
        ]),
      getSelectedModel: vi.fn().mockResolvedValue('tiny.en'),
      onModelDownloadProgress: vi.fn().mockImplementation((listener) => {
        progressListener = listener
        return () => undefined
      }),
    })

    mounted = await renderIntoDocument(
      <ModelsProvider>
        <Probe />
      </ModelsProvider>,
    )

    await flushMicrotasks()
    expect(mounted.container.querySelector('[data-testid="selected"]')?.textContent).toBe('tiny.en')
    expect(mounted.container.querySelector('[data-testid="downloaded"]')?.textContent).toBe('1')

    mounted.container.querySelectorAll('button')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()
    expect(api.selectModel).toHaveBeenCalledWith('tiny.en')

    mounted.container.querySelectorAll('button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()
    expect(api.downloadModel).toHaveBeenCalledWith('base.en')

    progressListener?.(makeDownloadProgress({ modelId: 'base.en', percent: 100 }))
    await flushMicrotasks()
    expect(Number(mounted.container.querySelector('[data-testid="progress"]')?.textContent)).toBe(100)
    expect(api.getModels).toHaveBeenCalledTimes(3)
  })
})
