import type { TranscriptionModel } from './types'

export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en'

/**
 * Picks the language code to hand a model: the user's preference when the model offers it,
 * else English, else the model's first option. Fixed-language models get `undefined`.
 */
export function resolveModelLanguage(
  model: Pick<TranscriptionModel, 'languageOptions'>,
  preferred: string,
): string | undefined {
  const options = model.languageOptions
  if (!options?.length) return undefined
  const codes = options.map((option) => option.code)
  if (codes.includes(preferred)) return preferred
  if (codes.includes(DEFAULT_TRANSCRIPTION_LANGUAGE)) return DEFAULT_TRANSCRIPTION_LANGUAGE
  return codes[0]
}
