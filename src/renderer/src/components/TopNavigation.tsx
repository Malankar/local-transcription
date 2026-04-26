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
    <header className="shrink-0 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <nav
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-3 py-3 sm:gap-x-3 sm:px-4"
        aria-label="Primary"
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Mic className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">Transcribe</h1>
            <p className="truncate text-xs text-muted-foreground">Local-first Whisper</p>
          </div>
        </div>

        <div className="flex min-w-0 justify-center justify-self-center">
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-1 shadow-inner">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go('record')}
              aria-label="Record"
              className={cn(
                'gap-2 rounded-full px-3 sm:px-4',
                mainTab === 'record'
                  ? 'bg-primary/90 text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted/60 dark:hover:text-foreground',
              )}
            >
              <Mic className="h-4 w-4 shrink-0" aria-hidden />
              <span className="max-sm:sr-only">Record</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go('library')}
              aria-label="Library"
              className={cn(
                'gap-2 rounded-full px-3 sm:px-4',
                mainTab === 'library'
                  ? 'bg-primary/90 text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted/60 dark:hover:text-foreground',
              )}
            >
              <Library className="h-4 w-4 shrink-0" aria-hidden />
              <span className="max-sm:sr-only">Library</span>
            </Button>
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 justify-self-end border-border shadow-none"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" aria-hidden />
        </Button>
      </nav>
    </header>
  )
}
