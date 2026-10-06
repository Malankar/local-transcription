import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveModelLanguage } from '../../../../shared/modelLanguage'
import { useModelsContext } from '../../contexts/ModelsContext'
import { useSettingsContext } from '../../contexts/SettingsContext'

/** Only rendered for models that let you pick a language; applies from the next recording. */
export function TranscriptionLanguageSelect({ disabled }: { disabled?: boolean }) {
  const { selectedModel } = useModelsContext()
  const { settings, updateSettings } = useSettingsContext()

  if (!selectedModel?.languageOptions?.length || !settings) return null
  const value = resolveModelLanguage(selectedModel, settings.transcriptionLanguage)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">Language</span>
      <Select
        value={value}
        onValueChange={(code) => void updateSettings({ transcriptionLanguage: code })}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-full min-w-0 gap-2 text-sm" aria-label="Transcription language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectedModel.languageOptions.map((option) => (
            <SelectItem key={option.code} value={option.code}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
