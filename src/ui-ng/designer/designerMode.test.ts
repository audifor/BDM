import { describe, expect, it } from 'vitest'

import {
  computeDesignerScale,
  isDesignerMode,
} from './designerMode'

describe('designerMode', () => {
  it('is disabled when import.meta.env.DEV is false even with designer=1', () => {
    expect(isDesignerMode('?ui=ng&designer=1', false)).toBe(false)
  })

  it('requires designer=1 when import.meta.env.DEV is true', () => {
    expect(isDesignerMode('?ui=ng&designer=1', true)).toBe(true)
    expect(isDesignerMode('?ui=ng', true)).toBe(false)
  })

  it('fits the canonical desktop to the available designer rectangle (FIT TO VIEW)', () => {
    expect(computeDesignerScale(1496, 900)).toBeCloseTo(Math.min(1496 / 1920, 900 / 1080))
    expect(computeDesignerScale(1700, 850)).toBeCloseTo(Math.min(1700 / 1920, 850 / 1080))
    expect(computeDesignerScale(1920, 950)).toBeCloseTo(950 / 1080)
    expect(computeDesignerScale(1920, 1080)).toBe(1)
    expect(computeDesignerScale(2560, 1440)).toBeCloseTo(4 / 3)
  })

  it('falls back to 1 for non-positive viewport measurements', () => {
    expect(computeDesignerScale(0, 900)).toBe(1)
    expect(computeDesignerScale(1496, 0)).toBe(1)
  })
})
