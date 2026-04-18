import { useEffect } from 'react'

import { AppSettingsModal } from './AppSettingsModal'
import { LibrarySurface } from './LibrarySurface'
import RecordSurface from './RecordSurface'
import { TopNavigation } from './TopNavigation'
import { useNavigationContext } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'

export default function AppShell() {
  const { mainTab, navigateTo, settingsOpen, setSettingsOpen } = useNavigationContext()
  const { isCapturing } = useRecordingContext()

  useEffect(() => {
    if (isCapturing) {
      navigateTo('recording')
    }
  }, [isCapturing, navigateTo])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopNavigation />
      <main className="min-h-0 flex-1 overflow-hidden">
        {mainTab === 'record' && <RecordSurface />}
        {mainTab === 'library' && <LibrarySurface />}
      </main>
      {settingsOpen && <AppSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
