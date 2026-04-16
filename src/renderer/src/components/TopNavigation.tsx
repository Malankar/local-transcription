import { Cpu, Library, Mic, Settings, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useNavigationContext, type MainTab } from '../contexts/NavigationContext'
import { useRecordingContext } from '../contexts/RecordingContext'

export function TopNavigation() {
  const { mainTab, setMainTab, setSettingsOpen } = useNavigationContext()
  const { isCapturing } = useRecordingContext()

  function go(tab: MainTab) {
    setMainTab(tab)
  }

  return (
    <nav className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
          <Mic className="h-4 w-4 text-primary-foreground" />
        </div>
        <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">LocalTranscribe</h1>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant={mainTab === 'record' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => go('record')}
          className="gap-2"
        >
          <Mic className="h-4 w-4" />
          Record
          {isCapturing && mainTab === 'record' && (
            <span className="relative ml-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
        </Button>
        <Button
          variant={mainTab === 'library' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => go('library')}
          className="gap-2"
        >
          <Library className="h-4 w-4" />
          Library
        </Button>
        <Button
          variant={mainTab === 'models' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => go('models')}
          className="gap-2"
        >
          <Cpu className="h-4 w-4" />
          Models
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          title="Close window"
          onClick={() => window.close()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
