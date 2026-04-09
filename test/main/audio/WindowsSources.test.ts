import { describe, expect, it } from 'vitest'

import { getWindowsSources } from '../../../src/main/audio/sources/WindowsSources'

describe('getWindowsSources', () => {
  it('returns an empty list until windows discovery is implemented', () => {
    expect(getWindowsSources()).toEqual([])
  })
})
