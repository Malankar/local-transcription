import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TranscriptSegment } from '../types'
import { mergeTranscriptSegments } from '../lib/transcriptMerge'

interface TranscriptContextValue {
  meetingSegments: TranscriptSegment[]

  // Derived
  mergedMeetingSegments: TranscriptSegment[]

  // Actions
  clearMeeting: () => void
  exportTxt: () => Promise<void>
  exportSrt: () => Promise<void>
}

const TranscriptContext = createContext<TranscriptContextValue | null>(null)

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const [meetingSegments, setMeetingSegments] = useState<TranscriptSegment[]>([])

  const mergedMeetingSegments = useMemo(
    () => mergeTranscriptSegments(meetingSegments),
    [meetingSegments],
  )

  useEffect(() => {
    const unsub = window.api.onTranscriptSegment((segment) => {
      setMeetingSegments((prev) => [...prev, segment])
    })
    return unsub
  }, [])

  function clearMeeting(): void {
    setMeetingSegments([])
  }

  async function exportTxt(): Promise<void> {
    await window.api.exportTxt()
  }

  async function exportSrt(): Promise<void> {
    await window.api.exportSrt()
  }

  const value: TranscriptContextValue = {
    meetingSegments,
    mergedMeetingSegments,
    clearMeeting,
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
