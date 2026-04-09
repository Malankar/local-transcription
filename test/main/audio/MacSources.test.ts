import { describe, expect, it } from 'vitest'

import { getMacSources } from '../../../src/main/audio/sources/MacSources'

describe('getMacSources', () => {
  it('returns an empty list until mac discovery is implemented', () => {
    expect(getMacSources()).toEqual([])
  })
})
