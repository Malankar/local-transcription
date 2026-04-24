import { describe, expect, it } from 'vitest'

import { SUMMARY_SYSTEM_PROMPT } from '../../../src/main/assistant/summaryPrompt'

describe('SUMMARY_SYSTEM_PROMPT', () => {
  it('requires structured, action-focused summaries grounded in the transcript', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Overview/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Key Points/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Decisions/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Action Items/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Open Questions/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/do not invent facts/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Owner not mentioned/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Deadline not mentioned/i)
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/under 220 words/i)
  })
})
