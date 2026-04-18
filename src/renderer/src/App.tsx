import { NavigationProvider, useNavigationContext } from './contexts/NavigationContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ModelsProvider } from './contexts/ModelsContext'
import { RecordingProvider } from './contexts/RecordingContext'
import { TranscriptProvider } from './contexts/TranscriptContext'
import { HistoryProvider } from './contexts/HistoryContext'
import AppShell from './components/AppShell'
import { useTranscriptContext } from './contexts/TranscriptContext'

function HistoryBridge() {
  const { clearMeeting } = useTranscriptContext()
  const { navigateTo } = useNavigationContext()
  return (
    <HistoryProvider
      onSessionSaved={(meta) => {
        clearMeeting()
        if (meta.profile === 'meeting') navigateTo('history')
      }}
    >
      <AppShell />
    </HistoryProvider>
  )
}

export function App() {
  return (
    <NavigationProvider>
      <SettingsProvider>
        <ModelsProvider>
          <RecordingProvider>
            <TranscriptProvider>
              <HistoryBridge />
            </TranscriptProvider>
          </RecordingProvider>
        </ModelsProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}
