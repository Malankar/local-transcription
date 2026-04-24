import { describe, expect, it } from 'vitest'

import { coerceAssistantChatFlags, type AssistantChatRequest } from '../../src/shared/types'

function baseReq(over: Partial<AssistantChatRequest> = {}): AssistantChatRequest {
  return {
    sessionTitle: 'S',
    transcript: 't',
    messages: [{ role: 'user', content: 'hi' }],
    ...over,
  }
}

describe('coerceAssistantChatFlags', () => {
  it('defaults undefined / false to off', () => {
    expect(coerceAssistantChatFlags(baseReq())).toEqual({ thinkingMode: false })
    expect(coerceAssistantChatFlags(baseReq({ thinkingMode: false }))).toEqual({
      thinkingMode: false,
    })
  })

  it('enables only on strict true', () => {
    expect(coerceAssistantChatFlags(baseReq({ thinkingMode: true }))).toEqual({
      thinkingMode: true,
    })
  })
})
