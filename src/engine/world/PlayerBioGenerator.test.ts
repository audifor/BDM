import { describe, expect, it } from 'vitest'

import { parseGameDate } from '@/domain/date'
import { calculateAge } from '@/domain/player'

import { generatePlayerBio } from './PlayerBioGenerator'

describe('PlayerBioGenerator', () => {
  it('generates deterministic, position-bounded bios at the reference date', () => {
    const referenceDate = parseGameDate('2032-10-01')
    const bio = generatePlayerBio('generated-player-0001', 'PG', referenceDate)
    expect(generatePlayerBio('generated-player-0001', 'PG', referenceDate)).toEqual(bio)
    expect(calculateAge(bio.dateOfBirth, referenceDate)).toBeGreaterThanOrEqual(18)
    expect(calculateAge(bio.dateOfBirth, referenceDate)).toBeLessThanOrEqual(35)
    expect(bio.heightCm).toBeGreaterThanOrEqual(178)
    expect(bio.heightCm).toBeLessThanOrEqual(198)
    expect(bio.weightKg).toBeGreaterThanOrEqual(74)
    expect(bio.weightKg).toBeLessThanOrEqual(95)
  })

  it.each([
    ['PG', 178, 198, 74, 95], ['SG', 183, 203, 78, 100], ['SF', 188, 208, 82, 108], ['PF', 193, 213, 88, 118], ['C', 198, 220, 95, 130],
  ] as const)('uses the bootstrap ranges for %s', (position, minHeight, maxHeight, minWeight, maxWeight) => {
    const bio = generatePlayerBio(`bio-${position}`, position, parseGameDate('2032-10-01'))
    expect(bio.heightCm).toBeGreaterThanOrEqual(minHeight)
    expect(bio.heightCm).toBeLessThanOrEqual(maxHeight)
    expect(bio.weightKg).toBeGreaterThanOrEqual(minWeight)
    expect(bio.weightKg).toBeLessThanOrEqual(maxWeight)
  })
})
