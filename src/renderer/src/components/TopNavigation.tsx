import { Library, Mic, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNavigationContext, type MainTab } from '../contexts/NavigationContext'

export function TopNavigation() {
  const { mainTab, setMainTab, setSettingsOpen } = useNavigationContext()

  function go(tab: MainTab) {
    setMainTab(tab)
  }

  return (
    <nav className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted">
          <Mic className="h-4 w-4 text-foreground" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Transcribe</h1>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go('record')}
          className={cn(
            'gap-2 rounded-full',
            mainTab === 'record' && 'border border-border bg-background text-foreground shadow-sm hover:bg-background',
          )}
        >
          <Mic className="h-4 w-4" />
          Record
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go('library')}
          className={cn(
            'gap-2 rounded-full',
            mainTab === 'library' && 'border border-border bg-background text-foreground shadow-sm hover:bg-background',
          )}
        >
          <Library className="h-4 w-4" />
          Library
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="gap-2" title="Settings">
        <Settings className="h-4 w-4" />
      </Button>
    </nav>
  )
}
