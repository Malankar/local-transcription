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
    expect(coerceAssistantChatFlags(baseReq())).toEqual({ thinkingMode: false, webSearchEnabled: false })
    expect(coerceAssistantChatFlags(baseReq({ thinkingMode: false }))).toEqual({
      thinkingMode: false,
      webSearchEnabled: false,
    })
    expect(coerceAssistantChatFlags(baseReq({ webSearchEnabled: false }))).toEqual({
      thinkingMode: false,
      webSearchEnabled: false,
    })
  })

  it('enables only on strict true', () => {
    expect(coerceAssistantChatFlags(baseReq({ thinkingMode: true }))).toEqual({
      thinkingMode: true,
      webSearchEnabled: false,
    })
    expect(coerceAssistantChatFlags(baseReq({ webSearchEnabled: true }))).toEqual({
      thinkingMode: false,
      webSearchEnabled: true,
    })
    expect(coerceAssistantChatFlags(baseReq({ thinkingMode: true, webSearchEnabled: true }))).toEqual({
      thinkingMode: true,
      webSearchEnabled: true,
    })
  })
})
