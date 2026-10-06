import { describe, expect, it } from 'vitest'

import { resolveModelLanguage } from '../../src/shared/modelLanguage'

const multilingual = {
  languageOptions: [
    { code: 'en', label: 'English' },
    { code: 'auto', label: 'Auto-detect' },
    { code: 'fr', label: 'French' },
  ],
}

describe('resolveModelLanguage', () => {
  it('uses the preferred language when the model offers it, including auto-detect', () => {
    expect(resolveModelLanguage(multilingual, 'fr')).toBe('fr')
    expect(resolveModelLanguage(multilingual, 'auto')).toBe('auto')
  })

  it('falls back to English, then to the first option', () => {
    expect(resolveModelLanguage(multilingual, 'ja')).toBe('en')
    expect(resolveModelLanguage({ languageOptions: [{ code: 'zh', label: 'Chinese' }] }, 'ja')).toBe('zh')
  })

  it('returns undefined for fixed-language models', () => {
    expect(resolveModelLanguage({}, 'fr')).toBeUndefined()
  })
})
