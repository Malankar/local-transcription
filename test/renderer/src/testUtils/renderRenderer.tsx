import type { ReactNode } from 'react'

import { HistoryProvider } from '../../../../src/renderer/src/contexts/HistoryContext'
import { ModelsProvider } from '../../../../src/renderer/src/contexts/ModelsContext'
import { NavigationProvider } from '../../../../src/renderer/src/contexts/NavigationContext'
import { RecordingProvider } from '../../../../src/renderer/src/contexts/RecordingContext'
import { SettingsProvider } from '../../../../src/renderer/src/contexts/SettingsContext'
import { TranscriptProvider } from '../../../../src/renderer/src/contexts/TranscriptContext'
import { renderIntoDocument, type RenderResult } from './render'

export async function renderRendererApp(
  node: ReactNode,
  options: { onSessionSaved?: () => void } = {},
): Promise<RenderResult> {
  return renderIntoDocument(
    <NavigationProvider>
      <SettingsProvider>
        <ModelsProvider>
          <RecordingProvider>
            <TranscriptProvider>
              <HistoryProvider onSessionSaved={options.onSessionSaved}>
                {node}
              </HistoryProvider>
            </TranscriptProvider>
          </RecordingProvider>
        </ModelsProvider>
      </SettingsProvider>
    </NavigationProvider>,
  )
}
