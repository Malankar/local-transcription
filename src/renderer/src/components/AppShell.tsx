import { useEffect } from 'react'

import { AppSettingsModal } from './AppSettingsModal'
import { LibrarySurface } from './LibrarySurface'
import { ModelsView } from './ModelsView'
import RecordingHubView from './RecordingHubView'
import { TopNavigation } from './TopNavigation'
import { useNavigationContext } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'
import { useTranscriptContext } from '../contexts/TranscriptContext'

export default function AppShell() {
  const { mainTab, navigateTo, settingsOpen, setSettingsOpen } = useNavigationContext()
  const { isCapturing, status, captureProfile } = useRecordingContext()
  const { meetingSegments } = useTranscriptContext()

  useEffect(() => {
    if (isCapturing) {
      navigateTo('recording')
      return
    }
    if (
      !isCapturing &&
      (status.stage === 'stopped' || status.stage === 'error') &&
      meetingSegments.length > 0 &&
      captureProfile === 'meeting'
    ) {
      navigateTo('history')
    }
  }, [isCapturing, status.stage, meetingSegments.length, captureProfile, navigateTo])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopNavigation />
      <div className="relative min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-0 bg-grid-void opacity-[0.2]" aria-hidden />
        <main className="relative z-[1] flex h-full min-h-0 flex-col">
          {mainTab === 'record' && <RecordingHubView />}
          {mainTab === 'library' && <LibrarySurface />}
          {mainTab === 'models' && <ModelsView />}
        </main>
      </div>
      {settingsOpen && <AppSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
