import { describe, expect, it, vi } from 'vitest'

import { ModelsView } from '../../../../src/renderer/src/components/ModelsView'
import { installMockApi } from '../testUtils/mockApi'
import { flushMicrotasks, renderIntoDocument } from '../testUtils/render'
import { renderRendererApp } from '../testUtils/renderRenderer'

describe('ModelsView', () => {
  it('selects models and shows the download state', async () => {
    let models = [
      {
        id: 'base',
        name: 'Base',
        description: 'Recommended model',
        sizeMb: 120,
        languages: 'en',
        accuracy: 4,
        speed: 4,
        recommended: true,
        engine: 'sherpa' as const,
        runtime: 'node',
        runtimeModelName: 'base',
        downloadManaged: true,
        supportsGpuAcceleration: false,
        streaming: false,
        isDownloaded: true,
      },
      {
        id: 'small',
        name: 'Small',
        description: 'Managed model',
        sizeMb: 250,
        languages: 'en',
        accuracy: 3,
        speed: 5,
        recommended: false,
        engine: 'sherpa' as const,
        runtime: 'node',
        runtimeModelName: 'small',
        downloadManaged: true,
        supportsGpuAcceleration: false,
        streaming: false,
        isDownloaded: false,
      },
    ]

    const selectModel = vi.fn().mockResolvedValue(undefined)
    const downloadModel = vi.fn().mockImplementation(async (id: string) => {
      models = models.map((model) => (model.id === id ? { ...model, isDownloaded: true } : model))
    })

    installMockApi({
      getModels: vi.fn().mockImplementation(async () => models),
      getSelectedModel: vi.fn().mockResolvedValue(null),
      selectModel,
      downloadModel,
    })

    const { container } = await renderRendererApp(<ModelsView />)
    await flushMicrotasks()

    expect(container.textContent).toContain('Base')
    expect(container.textContent).toContain('Recommended')

    const cards = container.querySelectorAll('[role="button"]')
    cards[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushMicrotasks()

    expect(selectModel).toHaveBeenCalledWith('small')
    expect(container.textContent).toContain('small')
  })

  it('filters models by language', async () => {
    const base = {
      description: '',
      sizeMb: 100,
      accuracy: 3,
      speed: 3,
      recommended: false,
      engine: 'sherpa' as const,
      runtime: 'node',
      downloadManaged: true,
      supportsGpuAcceleration: false,
      streaming: false,
      isDownloaded: true,
    }
    installMockApi({
      getModels: vi.fn().mockResolvedValue([
        { ...base, id: 'en', name: 'EnglishModel', languages: 'English only', runtimeModelName: 'en' },
        { ...base, id: 'multi', name: 'MultiModel', languages: '99 languages', runtimeModelName: 'multi' },
      ]),
      getSelectedModel: vi.fn().mockResolvedValue(null),
    })

    const { container } = await renderRendererApp(<ModelsView />)
    await flushMicrotasks()

    const clickFilter = async (label: string): Promise<void> => {
      const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label)
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushMicrotasks()
    }

    await clickFilter('English')
    expect(container.textContent).toContain('EnglishModel')
    expect(container.textContent).not.toContain('MultiModel')

    await clickFilter('Multilingual')
    expect(container.textContent).not.toContain('EnglishModel')
    expect(container.textContent).toContain('MultiModel')
  })
})
