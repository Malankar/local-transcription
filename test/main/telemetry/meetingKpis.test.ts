import { describe, expect, it } from 'vitest'

import {
  buildMeetingOutputCompleteness,
  toMeetingInputKpiState,
} from '../../../src/main/telemetry/meetingKpis'

describe('meetingKpis', () => {
  it('parses accepted timestamp for time_to_output baseline', () => {
    const state = toMeetingInputKpiState(
      {
        source: 'upload',
        acceptedAtIso: '2026-04-16T00:00:00.000Z',
      },
      1_000,
    )

    expect(state).toEqual({
      source: 'upload',
      acceptedAtMs: Date.parse('2026-04-16T00:00:00.000Z'),
    })
  })

  it('falls back to now when accepted timestamp is invalid', () => {
    const state = toMeetingInputKpiState(
      {
        source: 'record',
        acceptedAtIso: 'not-a-date',
      },
      7_500,
    )

    expect(state.acceptedAtMs).toBe(7_500)
  })

  it('requires transcript, speaker labels, summary visibility, and actions visibility for completeness', () => {
    const complete = buildMeetingOutputCompleteness(
      [
        {
          id: 'seg-1',
          startMs: 0,
          endMs: 400,
          text: 'Speaker A: finalize launch checklist',
          timestamp: '2026-04-16T00:00:00.000Z',
        },
      ],
      { summaryVisible: true, actionsVisible: true },
    )

    expect(complete.complete).toBe(true)
    expect(complete.speakerLabelsAvailable).toBe(true)

    const incomplete = buildMeetingOutputCompleteness(
      [
        {
          id: 'seg-2',
          startMs: 0,
          endMs: 400,
          text: 'Need final checklist updates',
          timestamp: '2026-04-16T00:00:01.000Z',
        },
      ],
      { summaryVisible: true, actionsVisible: true },
    )

    expect(incomplete.complete).toBe(false)
    expect(incomplete.speakerLabelsAvailable).toBe(false)
  })
})
