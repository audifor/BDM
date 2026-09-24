import { describe, expect, it } from 'vitest'

import { courtRulesetForEcosystem, createCourtGeometry, distanceBetween, isInsideCourt } from './index'

describe('canonical court geometry', () => {
  it('keeps the FIBA court dimensions and basket centers inside the court', () => {
    const court = createCourtGeometry('FIBA')

    expect(court.lengthMeters).toBe(28)
    expect(court.widthMeters).toBe(15)
    expect(isInsideCourt(court.baskets.left, court)).toBe(true)
    expect(isInsideCourt(court.baskets.right, court)).toBe(true)
    expect(distanceBetween(court.baskets.left, court.baskets.right)).toBeGreaterThan(0)
  })

  it('selects the ecosystem court footprint deterministically', () => {
    expect(courtRulesetForEcosystem('nbaLike', 'women')).toBe('WNBA')
    expect(courtRulesetForEcosystem('ncaaLike', 'men')).toBe('NCAA_M')
    expect(courtRulesetForEcosystem('fibaLike', 'women')).toBe('FIBA')
  })

})
