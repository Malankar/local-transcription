import { vi } from 'vitest'

type StatusPayload = { stage: string; detail: string }
type SegmentPayload = { id: string; startMs: number; endMs: number; text: string; timestamp: string }

export interface ListenerCapture {
  mockOnStatus: ReturnType<typeof vi.fn>
  mockOnTranscript: ReturnType<typeof vi.fn>
  fireStatus: (payload: StatusPayload) => void
  fireSegment: (payload: SegmentPayload) => void
}

/**
 * Creates vi.fn() mocks for `onStatus` and `onTranscriptSegment` that capture
 * the registered callbacks, plus helpers to fire those callbacks in tests.
 */
export function makeListenerCapture(): ListenerCapture {
  let statusCb: ((s: StatusPayload) => void) | undefined
  let transcriptCb: ((s: SegmentPayload) => void) | undefined

  return {
    mockOnStatus: vi.fn().mockImplementation((listener: (s: StatusPayload) => void) => {
      statusCb = listener
      return () => undefined
    }),
    mockOnTranscript: vi.fn().mockImplementation((listener: (s: SegmentPayload) => void) => {
      transcriptCb = listener
      return () => undefined
    }),
    fireStatus(payload: StatusPayload) {
      statusCb?.(payload)
    },
    fireSegment(payload: SegmentPayload) {
      transcriptCb?.(payload)
    },
  }
}
