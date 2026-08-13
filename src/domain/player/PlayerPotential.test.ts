import { describe, expect, it } from 'vitest'
import { calculateBootstrapAbilityProxy, getPlayerPotentialBand } from './PlayerPotential'

const ratings = { finishing: 50, shooting: 60, playmaking: 70, perimeterDefense: 80, interiorDefense: 90, rebounding: 40, athleticism: 30 }

describe('PlayerPotential', () => {
  it('calculates the bootstrap ability proxy as the arithmetic mean', () => {
    expect(calculateBootstrapAbilityProxy(ratings)).toBe(60)
  })

  it.each([[59, 'limited'], [60, 'average'], [69, 'average'], [70, 'good'], [79, 'good'], [80, 'high'], [89, 'high'], [90, 'elite'], [100, 'elite']] as const)('maps %i to %s', (ceiling, band) => {
    expect(getPlayerPotentialBand({ ceiling })).toBe(band)
  })
})
