import type { MatchPlayerProfile } from './MatchPlayerProfile'
import type { ShotZone } from './ShotResolution'

export function calculateStealCreditProbability(defender: MatchPlayerProfile): number {
  const pressure = defender.defense.pointOfAttack * .7 + defender.defense.mobility * .3
  return clamp(.45 + (pressure - 50) * .005, .15, .75)
}

export function calculateBlockCreditProbability(defender: MatchPlayerProfile, shotZone: ShotZone): number {
  const signal = shotZone === 'rim'
    ? defender.defense.interior * .8 + defender.defense.mobility * .2
    : shotZone === 'midRange'
      ? defender.defense.pointOfAttack * .55 + defender.defense.mobility * .45
      : defender.defense.pointOfAttack * .6 + defender.defense.mobility * .4
  const base = shotZone === 'rim' ? .12 : shotZone === 'midRange' ? .035 : .02
  const [minimum, maximum] = shotZone === 'rim' ? [.03, .30] : shotZone === 'midRange' ? [.01, .15] : [.005, .08]
  return clamp(base + (signal - 50) * .002, minimum, maximum)
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)) }
