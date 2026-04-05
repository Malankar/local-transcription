import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type MutableRefObject,
} from 'react'
import type { AudioSource, AudioSourceMode, AppStatus } from '../types'
import { type CaptureProfile, toMessage } from '../lib/formatters'
import { useNavigationContext } from './NavigationContext'

export type { CaptureProfile }

interface RecordingContextValue {
  sources: AudioSource[]
  mode: AudioSourceMode
  systemSourceId: string
  micSourceId: string
  status: AppStatus
  errorMessage: string
  isBusy: boolean
  isCapturing: boolean
  captureProfile: CaptureProfile
  captureProfileRef: MutableRefObject<CaptureProfile>

  // Derived
  systemSources: AudioSource[]
  micSources: AudioSource[]

  // Actions
  startCapture: (profile: CaptureProfile) => Promise<void>
  stopCapture: () => Promise<void>
  refreshSources: () => Promise<void>
  setMode: (mode: AudioSourceMode) => void
  setSystemSourceId: (id: string) => void
  setMicSourceId: (id: string) => void
}

const RecordingContext = createContext<RecordingContextValue | null>(null)

export function RecordingProvider({ children }: { children: ReactNode }) {
  const { navigateTo, setRecordingSubView } = useNavigationContext()

  const [sources, setSources] = useState<AudioSource[]>([])
  const [mode, setMode] = useState<AudioSourceMode>('mixed')
  const [systemSourceId, setSystemSourceId] = useState<string>('')
  const [micSourceId, setMicSourceId] = useState<string>('')
  const [status, setStatus] = useState<AppStatus>({ stage: 'idle', detail: 'Load sources to begin' })
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isBusy, setIsBusy] = useState<boolean>(false)
  const [isCapturing, setIsCapturing] = useState<boolean>(false)
  const [captureProfile, setCaptureProfile] = useState<CaptureProfile>('meeting')

  const captureProfileRef = useRef<CaptureProfile>('meeting')

  useEffect(() => {
    captureProfileRef.current = captureProfile
  }, [captureProfile])

  const systemSources = useMemo(() => sources.filter((s) => s.isMonitor), [sources])
  const micSources = useMemo(() => sources.filter((s) => !s.isMonitor), [sources])

  async function startCapture(profile: CaptureProfile = 'meeting'): Promise<void> {
    setErrorMessage('')
    setCaptureProfile(profile)
    setRecordingSubView(profile === 'live' ? 'live' : 'meetings')
    navigateTo('recording')
    setIsBusy(true)
    try {
      const effectiveMode = profile === 'live' ? 'mic' : mode
      await window.api.startCapture({ mode: effectiveMode, systemSourceId, micSourceId, profile })
    } catch (error) {
      setErrorMessage(toMessage(error))
      setIsCapturing(false)
    } finally {
      setIsBusy(false)
    }
  }

  async function stopCapture(): Promise<void> {
    setIsBusy(true)
    try {
      await window.api.stopCapture()
    } catch (error) {
      setErrorMessage(toMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function refreshSources(): Promise<void> {
    setErrorMessage('')
    setIsBusy(true)
    try {
      const discovered = await window.api.getSources()
      setSources(discovered)
      setSystemSourceId((c) => c || discovered.find((s) => s.isMonitor)?.id || '')
      setMicSourceId((c) => c || discovered.find((s) => !s.isMonitor)?.id || '')
    } catch (error) {
      setErrorMessage(toMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  // Init: load sources on mount
  useEffect(() => {
    refreshSources()
  }, [])

  // IPC subscriptions
  useEffect(() => {
    const unsubStatus = window.api.onStatus((nextStatus) => {
      setStatus(nextStatus)
      setIsBusy(
        nextStatus.stage === 'discovering' || nextStatus.stage === 'initializing-model',
      )
      if (nextStatus.stage === 'capturing') setIsCapturing(true)
      if (['stopped', 'ready', 'error'].includes(nextStatus.stage)) setIsCapturing(false)
    })

    const unsubError = window.api.onError((message) => {
      setErrorMessage(message)
      setIsBusy(false)
      setIsCapturing(false)
    })

    return () => {
      unsubStatus()
      unsubError()
    }
  }, [])

  const value: RecordingContextValue = {
    sources,
    mode,
    systemSourceId,
    micSourceId,
    status,
    errorMessage,
    isBusy,
    isCapturing,
    captureProfile,
    captureProfileRef,
    systemSources,
    micSources,
    startCapture,
    stopCapture,
    refreshSources,
    setMode,
    setSystemSourceId,
    setMicSourceId,
  }

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
}

export function useRecordingContext(): RecordingContextValue {
  const ctx = useContext(RecordingContext)
  if (!ctx) throw new Error('useRecordingContext must be used inside RecordingProvider')
  return ctx
}
