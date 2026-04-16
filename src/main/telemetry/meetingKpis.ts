import type { MeetingInputSource, TranscriptSegment } from '../../shared/types'

export interface MeetingInputAcceptedEvent {
  source: MeetingInputSource
  acceptedAtIso: string
}

export interface MeetingInputKpiState {
  source: MeetingInputSource
  acceptedAtMs: number
}

export interface MeetingOutputCompleteness {
  transcriptAvailable: boolean
  speakerLabelsAvailable: boolean
  summaryVisible: boolean
  actionsVisible: boolean
  complete: boolean
}

const SPEAKER_LABEL_REGEX = /\b(?:speaker|spk)\s*[\w-]*\s*:/i

export function toMeetingInputKpiState(
  event: MeetingInputAcceptedEvent,
  nowMs: number = Date.now(),
): MeetingInputKpiState {
  const parsedMs = Date.parse(event.acceptedAtIso)
  return {
    source: event.source,
    acceptedAtMs: Number.isNaN(parsedMs) ? nowMs : parsedMs,
  }
}

export function hasSpeakerLabels(segments: TranscriptSegment[]): boolean {
  return segments.some((segment) => SPEAKER_LABEL_REGEX.test(segment.text))
}

export function buildMeetingOutputCompleteness(
  segments: TranscriptSegment[],
  options: {
    summaryVisible: boolean
    actionsVisible: boolean
  },
): MeetingOutputCompleteness {
  const transcriptAvailable = segments.some((segment) => segment.text.trim().length > 0)
  const speakerLabelsAvailable = hasSpeakerLabels(segments)
  const summaryVisible = options.summaryVisible
  const actionsVisible = options.actionsVisible

  return {
    transcriptAvailable,
    speakerLabelsAvailable,
    summaryVisible,
    actionsVisible,
    complete: transcriptAvailable && speakerLabelsAvailable && summaryVisible && actionsVisible,
  }
}
