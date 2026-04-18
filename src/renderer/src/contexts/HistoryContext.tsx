import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppStatus, HistorySession, HistorySessionMeta } from '../types'

interface HistoryContextValue {
  historySessions: HistorySessionMeta[]
  selectedHistoryId: string | null
  selectedSession: HistorySession | null
  historyExportStatus: AppStatus | null

  // Actions
  selectSession: (id: string) => void
  deleteSession: (id: string) => Promise<void>
  exportSessionTxt: () => Promise<void>
  exportSessionSrt: () => Promise<void>
}

const HistoryContext = createContext<HistoryContextValue | null>(null)

interface HistoryProviderProps {
  children: ReactNode
  onSessionSaved?: (meta: HistorySessionMeta) => void
}

export function HistoryProvider({ children, onSessionSaved }: HistoryProviderProps): JSX.Element {
  const [historySessions, setHistorySessions] = useState<HistorySessionMeta[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<HistorySession | null>(null)
  const [historyExportStatus, setHistoryExportStatus] = useState<AppStatus | null>(null)

  // On mount: load history list
  useEffect(() => {
    window.api.listHistory().then(setHistorySessions).catch(() => {})
  }, [])

  // When selectedHistoryId changes: load or clear session
  useEffect(() => {
    if (selectedHistoryId === null) {
      setSelectedSession(null)
      return
    }
    window.api
      .getHistorySession(selectedHistoryId)
      .then(setSelectedSession)
      .catch(() => {})
  }, [selectedHistoryId])

  // Subscribe to history saved events
  useEffect(() => {
    const unsubscribe = window.api.onHistorySaved((meta) => {
      setHistorySessions((prev) => [meta, ...prev.filter((s) => s.id !== meta.id)])
      setSelectedHistoryId(meta.id)
      onSessionSaved?.(meta)
    })
    return unsubscribe
  }, [onSessionSaved])

  useEffect(() => {
    const unsubscribe = window.api.onHistorySessionUpdated((meta) => {
      setHistorySessions((prev) => {
        const idx = prev.findIndex((s) => s.id === meta.id)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], ...meta }
        return next
      })
      setSelectedSession((sess) => {
        if (!sess || sess.id !== meta.id) return sess
        return { ...sess, ...meta }
      })
    })
    return unsubscribe
  }, [])

  function selectSession(id: string): void {
    setSelectedHistoryId(id)
  }

  async function deleteSession(id: string): Promise<void> {
    try {
      await window.api.deleteHistorySession(id)
      setHistorySessions((prev) => prev.filter((s) => s.id !== id))
      if (selectedHistoryId === id) {
        setSelectedHistoryId(null)
        setSelectedSession(null)
      }
    } catch {
      // silently ignore
    }
  }

  async function exportSessionTxt(): Promise<void> {
    if (!selectedHistoryId) return
    try {
      const result = await window.api.exportHistoryTxt(selectedHistoryId)
      if (!result.canceled && result.path) {
        setHistoryExportStatus({ stage: 'exported', detail: result.path })
      }
    } catch {
      // silently ignore
    }
  }

  async function exportSessionSrt(): Promise<void> {
    if (!selectedHistoryId) return
    try {
      const result = await window.api.exportHistorySrt(selectedHistoryId)
      if (!result.canceled && result.path) {
        setHistoryExportStatus({ stage: 'exported', detail: result.path })
      }
    } catch {
      // silently ignore
    }
  }

  const value: HistoryContextValue = {
    historySessions,
    selectedHistoryId,
    selectedSession,
    historyExportStatus,
    selectSession,
    deleteSession,
    exportSessionTxt,
    exportSessionSrt,
  }

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
}

export function useHistoryContext(): HistoryContextValue {
  const ctx = useContext(HistoryContext)
  if (!ctx) throw new Error('useHistoryContext must be used inside HistoryProvider')
  return ctx
}
