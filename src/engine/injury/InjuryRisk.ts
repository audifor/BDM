import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import type { InjuryKind } from '@/domain/injury'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

export type InjuryFamily = 'LOWER_LEG' | 'HAMSTRING' | 'KNEE' | 'BACK' | 'HAND' | 'SHOULDER'

export function injuryFamily(kind: InjuryKind): InjuryFamily {
  return ({ ankleSprain: 'LOWER_LEG', hamstringStrain: 'HAMSTRING', kneeSprain: 'KNEE', backStrain: 'BACK', handInjury: 'HAND', shoulderStrain: 'SHOULDER' } as const)[kind]
}

/** Related history adds 10% each, or 16% within the last year, capped at 40%. */
export function recurrenceRiskMultiplier(world: GameWorld, playerId: PlayerId, kind: InjuryKind, onDate: GameDate): number {
  const family = injuryFamily(kind)
  const related = Object.values(world.injuriesById).filter((injury) => injury.playerId === playerId
    && injuryFamily(injury.kind) === family && compareGameDates(injury.injuredOn, onDate) < 0)
  const recentCutoff = addDays(onDate, -365)
  const modifier = related.reduce((total, injury) => total + (compareGameDates(injury.injuredOn, recentCutoff) >= 0 ? .16 : .1), 0)
  return 1 + Math.min(.4, modifier)
}

/** Conservative world-load multiplier shared by post-match and Training consequence checks. */
export function careerLoadRiskMultiplier(fatigue: number): number {
  return .85 + Math.max(0, Math.min(100, fatigue)) / 400
}

export function boundedInjuryProbability(base: number, multipliers: readonly number[]): number {
  return Math.max(0, Math.min(.05, base * multipliers.reduce((product, value) => product * Math.max(.5, Math.min(1.5, value)), 1)))
}
