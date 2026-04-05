import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TranscriptSegment } from '../types'
import { mergeTranscriptSegments } from '../lib/transcriptMerge'
import { useRecordingContext } from './RecordingContext'

interface TranscriptContextValue {
  meetingSegments: TranscriptSegment[]
  liveSegments: TranscriptSegment[]

  // Derived
  mergedMeetingSegments: TranscriptSegment[]
  liveTranscriptText: string

  // Actions
  clearMeeting: () => void
  clearLive: () => void
  exportTxt: () => Promise<void>
  exportSrt: () => Promise<void>
}

const TranscriptContext = createContext<TranscriptContextValue | null>(null)

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const { captureProfileRef } = useRecordingContext()

  const [meetingSegments, setMeetingSegments] = useState<TranscriptSegment[]>([])
  const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>([])

  const mergedMeetingSegments = useMemo(
    () => mergeTranscriptSegments(meetingSegments),
    [meetingSegments],
  )

  const liveTranscriptText = useMemo(() => {
    const mergedLive = mergeTranscriptSegments(liveSegments)
    return mergedLive
      .map((s) => s.text)
      .join(' ')
      .trim()
  }, [liveSegments])

  useEffect(() => {
    const unsub = window.api.onTranscriptSegment((segment) => {
      if (captureProfileRef.current === 'live') {
        setLiveSegments((prev) => [...prev, segment])
        return
      }
      setMeetingSegments((prev) => [...prev, segment])
    })
    return unsub
  }, [captureProfileRef])

  function clearMeeting(): void {
    setMeetingSegments([])
  }

  function clearLive(): void {
    setLiveSegments([])
  }

  async function exportTxt(): Promise<void> {
    await window.api.exportTxt()
  }

  async function exportSrt(): Promise<void> {
    await window.api.exportSrt()
  }

  const value: TranscriptContextValue = {
    meetingSegments,
    liveSegments,
    mergedMeetingSegments,
    liveTranscriptText,
    clearMeeting,
    clearLive,
    exportTxt,
    exportSrt,
  }

  return <TranscriptContext.Provider value={value}>{children}</TranscriptContext.Provider>
}

export function useTranscriptContext(): TranscriptContextValue {
  const ctx = useContext(TranscriptContext)
  if (!ctx) throw new Error('useTranscriptContext must be used inside TranscriptProvider')
  return ctx
}
