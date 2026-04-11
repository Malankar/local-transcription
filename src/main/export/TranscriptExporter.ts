import type { TranscriptSegment } from '../../shared/types'
import { dedupeTranscriptSegments } from '../../shared/transcriptSegments'

export class TranscriptExporter {
  static toTxt(segments: TranscriptSegment[]): string {
    return dedupeTranscriptSegments(segments).map((segment) => segment.text).join('\n').trim()
  }

  static toSrt(segments: TranscriptSegment[]): string {
    return dedupeTranscriptSegments(segments)
      .map((segment, index) => {
        return `${index + 1}\n${this.formatSrtTime(segment.startMs)} --> ${this.formatSrtTime(segment.endMs)}\n${segment.text}`
      })
      .join('\n\n')
      .trim()
  }

  static toVtt(segments: TranscriptSegment[]): string {
    return 'WEBVTT\n\n' + dedupeTranscriptSegments(segments)
      .map((segment) => {
        return `${this.formatVttTime(segment.startMs)} --> ${this.formatVttTime(segment.endMs)}\n${segment.text}`
      })
      .join('\n\n')
      .trim()
  }

  static formatVttTime(totalMs: number): string {
    const hours = Math.floor(totalMs / 3_600_000)
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
    const seconds = Math.floor((totalMs % 60_000) / 1_000)
    const milliseconds = totalMs % 1_000

    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':')
      .concat(`.${String(milliseconds).padStart(3, '0')}`)
  }

  static formatSrtTime(totalMs: number): string {
    const hours = Math.floor(totalMs / 3_600_000)
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
    const seconds = Math.floor((totalMs % 60_000) / 1_000)
    const milliseconds = totalMs % 1_000

    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':')
      .concat(`,${String(milliseconds).padStart(3, '0')}`)
  }
}
