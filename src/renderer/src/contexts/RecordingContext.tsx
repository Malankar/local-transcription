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
import { toMessage } from '../lib/formatters'
import { useNavigationContext } from './NavigationContext'

export type CaptureProfile = 'meeting'

interface RecordingContextValue {
  sources: AudioSource[]
  mode: AudioSourceMode
  systemSourceId: string
  micSourceId: string
  status: AppStatus
  errorMessage: string
  isBusy: boolean
  isUploadingMeetingFile: boolean
  isCapturing: boolean
  captureProfile: CaptureProfile
  captureProfileRef: MutableRefObject<CaptureProfile>

  // Derived
  systemSources: AudioSource[]
  micSources: AudioSource[]

  // Actions
  startCapture: () => Promise<void>
  stopCapture: () => Promise<void>
  transcribeMeetingFile: () => Promise<void>
  refreshSources: () => Promise<void>
  setMode: (mode: AudioSourceMode) => void
  setSystemSourceId: (id: string) => void
  setMicSourceId: (id: string) => void
}

const RecordingContext = createContext<RecordingContextValue | null>(null)

export function RecordingProvider({ children }: { children: ReactNode }) {
  const { navigateTo } = useNavigationContext()

  const [sources, setSources] = useState<AudioSource[]>([])
  const [mode, setMode] = useState<AudioSourceMode>('mixed')
  const [systemSourceId, setSystemSourceId] = useState<string>('')
  const [micSourceId, setMicSourceId] = useState<string>('')
  const [status, setStatus] = useState<AppStatus>({ stage: 'idle', detail: 'Load sources to begin' })
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isBusy, setIsBusy] = useState<boolean>(false)
  const [isUploadingMeetingFile, setIsUploadingMeetingFile] = useState<boolean>(false)
  const [isCapturing, setIsCapturing] = useState<boolean>(false)
  const [captureProfile, setCaptureProfile] = useState<CaptureProfile>('meeting')

  const captureProfileRef = useRef<CaptureProfile>('meeting')
  const isUploadingMeetingFileRef = useRef(false)

  useEffect(() => {
    captureProfileRef.current = captureProfile
  }, [captureProfile])

  useEffect(() => {
    isUploadingMeetingFileRef.current = isUploadingMeetingFile
  }, [isUploadingMeetingFile])

  const systemSources = useMemo(() => sources.filter((s) => s.isMonitor), [sources])
  const micSources = useMemo(() => sources.filter((s) => !s.isMonitor), [sources])

  async function startCapture(): Promise<void> {
    setErrorMessage('')
    setCaptureProfile('meeting')
    navigateTo('recording')
    setIsBusy(true)
    try {
      await window.api.startCapture({ mode, systemSourceId, micSourceId })
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

  async function transcribeMeetingFile(): Promise<void> {
    setErrorMessage('')
    setCaptureProfile('meeting')
    navigateTo('recording')
    isUploadingMeetingFileRef.current = true
    setIsUploadingMeetingFile(true)
    setIsBusy(true)
    try {
      await window.api.transcribeMeetingFile()
    } catch (error) {
      setErrorMessage(toMessage(error))
      setIsCapturing(false)
      isUploadingMeetingFileRef.current = false
      setIsUploadingMeetingFile(false)
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
      const isDiscoveringOrInitializing =
        nextStatus.stage === 'discovering' || nextStatus.stage === 'initializing-model'
      setIsBusy(isDiscoveringOrInitializing)
      if (nextStatus.stage === 'capturing') setIsCapturing(true)
      if (['stopped', 'ready', 'error'].includes(nextStatus.stage)) setIsCapturing(false)
      const isUploadTerminalStatus = ['ready', 'error'].includes(nextStatus.stage)
      if (isUploadingMeetingFileRef.current && isUploadTerminalStatus) {
        isUploadingMeetingFileRef.current = false
        setIsUploadingMeetingFile(false)
        setIsBusy(false)
      }
      if (!isDiscoveringOrInitializing && !isUploadingMeetingFileRef.current) {
        setIsBusy(false)
      }
    })

    const unsubError = window.api.onError((message) => {
      setErrorMessage(message)
      setIsBusy(false)
      setIsCapturing(false)
      isUploadingMeetingFileRef.current = false
      setIsUploadingMeetingFile(false)
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
    isUploadingMeetingFile,
    isCapturing,
    captureProfile,
    captureProfileRef,
    systemSources,
    micSources,
    startCapture,
    stopCapture,
    transcribeMeetingFile,
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
