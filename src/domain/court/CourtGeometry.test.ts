import { describe, expect, it } from 'vitest'

import { courtRulesetForEcosystem, createCourtGeometry, distanceBetween, isBeyondThreePointLine, isInsideCourt } from './index'

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

  it('uses the selected court arc and straight corner boundary on both sides', () => {
    const fiba = createCourtGeometry('FIBA')
    const nba = createCourtGeometry('NBA')
    expect(isBeyondThreePointLine({ x: 19.5, y: 7.5 }, fiba.baskets.right, fiba)).toBe(true)
    expect(isBeyondThreePointLine({ x: 20.5, y: 7.5 }, fiba.baskets.right, fiba)).toBe(false)
    expect(isBeyondThreePointLine({ x: 8.5, y: 7.5 }, fiba.baskets.left, fiba)).toBe(true)
    expect(isBeyondThreePointLine({ x: 27.9, y: 14.5 }, fiba.baskets.right, fiba)).toBe(true)
    // A corner shot from 1.1 m off the baseline and 0.5 m off the sideline is a three (the straight section runs 2.99 m from the baseline).
    expect(isBeyondThreePointLine({ x: 27.3, y: 14.5 }, fiba.baskets.right, fiba)).toBe(true)
    expect(isBeyondThreePointLine({ x: fiba.baskets.right.x, y: 14.5 }, fiba.baskets.right, fiba)).toBe(true)
    // Past the intersection with the arc the corner strip follows the arc, and inside the corner line it is a two.
    expect(isBeyondThreePointLine({ x: fiba.baskets.right.x - 3, y: 14.5 }, fiba.baskets.right, fiba)).toBe(true)
    expect(isBeyondThreePointLine({ x: fiba.baskets.right.x, y: 13.5 }, fiba.baskets.right, fiba)).toBe(false)
    expect(isBeyondThreePointLine({ x: fiba.baskets.right.x - 1.2, y: 6.5 }, fiba.baskets.right, fiba)).toBe(false)
    expect(nba.threePointLine.arcRadiusMeters).toBeGreaterThan(fiba.threePointLine.arcRadiusMeters)
    expect(isBeyondThreePointLine({ x: fiba.baskets.right.x - 7, y: fiba.widthMeters / 2 }, fiba.baskets.right, fiba)).toBe(true)
    expect(isBeyondThreePointLine({ x: nba.baskets.right.x - 7, y: nba.widthMeters / 2 }, nba.baskets.right, nba)).toBe(false)
  })

})
