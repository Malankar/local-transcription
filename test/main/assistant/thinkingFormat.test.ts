import { describe, expect, it } from 'vitest'

import { THINKING_MODE_OUTPUT_SPEC } from '../../../src/main/assistant/toolOrchestrator'

describe('THINKING_MODE_OUTPUT_SPEC', () => {
  it('defines brief reasoning plus answer headings', () => {
    expect(THINKING_MODE_OUTPUT_SPEC).toContain('### Reasoning (brief)')
    expect(THINKING_MODE_OUTPUT_SPEC).toContain('### Answer')
    expect(THINKING_MODE_OUTPUT_SPEC).toMatch(/2–4 bullets|2-4 bullets/)
  })
})
