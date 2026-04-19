import { describe, expect, it } from 'vitest'

import { TITLE_SYSTEM_PROMPT } from '../../../src/main/assistant/titlePrompt'

describe('TITLE_SYSTEM_PROMPT', () => {
  it('requires concrete subject and bans vague-only patterns', () => {
    expect(TITLE_SYSTEM_PROMPT).toMatch(/concrete subject/i)
    expect(TITLE_SYSTEM_PROMPT).toMatch(/Discussion/)
    expect(TITLE_SYSTEM_PROMPT).toMatch(/Meeting/)
    expect(TITLE_SYSTEM_PROMPT).toMatch(/4–10 words|4-10 words/)
  })
})
