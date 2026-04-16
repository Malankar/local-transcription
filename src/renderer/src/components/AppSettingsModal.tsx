import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SettingsView } from './SettingsView'

interface AppSettingsModalProps {
  onClose: () => void
}

export function AppSettingsModal({ onClose }: AppSettingsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 id="settings-modal-title" className="text-lg font-semibold">
            Settings
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0" title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SettingsView variant="modal" />
        </div>
      </Card>
    </div>
  )
}
