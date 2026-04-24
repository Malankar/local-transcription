import { describe, expect, it } from 'vitest'

import { TranscriptViewer } from '../../../../src/renderer/src/components/TranscriptViewer'
import { renderIntoDocument } from '../testUtils/render'

const baseProps = {
  title: 'Weekly planning',
  date: 'Apr 25, 2026',
  duration: '05:00',
  transcript: 'Dana approved the launch plan. Ravi will update QA notes by Friday.',
}

describe('TranscriptViewer', () => {
  it('renders structured summary headings and bullets', async () => {
    const summary = [
      'Overview: Team agreed on the launch plan and follow-up QA work.',
      'Key Points:',
      '- Dana approved the launch plan.',
      'Action Items:',
      '- Ravi: update QA notes. Deadline: Friday.',
    ].join('\n')

    const { container, unmount } = await renderIntoDocument(<TranscriptViewer {...baseProps} summary={summary} />)

    expect(container.querySelectorAll('h4')).toHaveLength(3)
    expect(container.textContent).toContain('Overview')
    expect(container.textContent).toContain('Key Points')
    expect(container.textContent).toContain('Action Items')
    expect(container.textContent).toContain('Ravi: update QA notes. Deadline: Friday.')

    await unmount()
  })

  it('keeps rendering legacy inline bullet summaries', async () => {
    const { container, unmount } = await renderIntoDocument(
      <TranscriptViewer {...baseProps} summary="• First key point • Second key point" />,
    )

    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.textContent).toContain('First key point')
    expect(container.textContent).toContain('Second key point')

    await unmount()
  })
})
