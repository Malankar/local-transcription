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
      <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden p-0 shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4">
          <h2 id="settings-modal-title" className="text-xl font-semibold">
            Settings
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 shrink-0 p-0" title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SettingsView variant="modal" />
        </div>
        <div className="flex shrink-0 gap-3 border-t border-border p-6 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onClose} className="flex-1 font-medium">
            Save Settings
          </Button>
        </div>
      </Card>
    </div>
  )
}
