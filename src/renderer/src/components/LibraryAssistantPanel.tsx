import { AlertCircle } from 'lucide-react'

import { useSettingsContext } from '../contexts/SettingsContext'

/** Summarization / Q&A IPC not implemented — panel explains availability from settings flags. */
const ASSISTANT_BACKEND_READY = false

export function LibraryAssistantPanel() {
  const { settings } = useSettingsContext()
  const enabled = settings?.uiFeatures.enableExternalAssistant ?? false

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background lg:w-96">
      <div className="shrink-0 border-b border-border p-4">
        <h3 className="text-sm font-semibold">Assistant</h3>
        <p className="mt-1 text-xs text-muted-foreground">Ask about this transcript</p>
      </div>
      <div className="flex flex-1 flex-col justify-center p-4">
        <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-2">
            {!enabled && (
              <p>
                External assistant is off. Turn it on under Settings → Assistant &amp; integrations
                to opt in when this feature ships.
              </p>
            )}
            {enabled && !ASSISTANT_BACKEND_READY && (
              <p>Assistant backend is not available in this build. Transcription stays fully local.</p>
            )}
            {enabled && ASSISTANT_BACKEND_READY && <p>Loading…</p>}
          </div>
        </div>
      </div>
    </aside>
  )
}
