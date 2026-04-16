import { afterEach, describe, expect, it } from 'vitest'

import { HistorySessionAssistant } from '../../../../src/renderer/src/components/HistorySessionAssistant'
import { renderIntoDocument } from '../testUtils/render'

let mounted: Awaited<ReturnType<typeof renderIntoDocument>> | null = null

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
})

describe('HistorySessionAssistant', () => {
  it('shows summary and action-item quick prompts for meeting output follow-up', async () => {
    mounted = await renderIntoDocument(
      <HistorySessionAssistant
        sessionId="session-1"
        sessionLabel="Weekly product sync"
        transcriptPlainText="Speaker 1: Review launch timeline."
        wordCount={6}
        segmentCount={1}
      />,
    )

    const text = mounted.container.textContent ?? ''
    expect(text).toContain('Summarize the key points from this session.')
    expect(text).toContain('List concrete action items with owners if ment')
  })
})
