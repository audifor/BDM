import { createGameDate, type GameDate } from '@/domain/date'
import type { PlayerBio } from '@/domain/player'
import type { BasketballPosition } from '@/domain/primitives'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

const HEIGHT_RANGES = { PG: [178, 198], SG: [183, 203], SF: [188, 208], PF: [193, 213], C: [198, 220] } as const
const WEIGHT_RANGES = { PG: [74, 95], SG: [78, 100], SF: [82, 108], PF: [88, 118], C: [95, 130] } as const

/** Isolated deterministic metadata stream; it never consumes names, ratings, or match RNG. */
export function generatePlayerBio(playerId: string, position: BasketballPosition, referenceDate: GameDate): PlayerBio {
  const random = new SeededRandomSource(hashStringToSeed(`player-bio-v1:${playerId}`))
  const age = random.nextInt(18, 35)
  const month = random.nextInt(1, 12)
  const day = random.nextInt(1, 28)
  const referenceYear = Number(referenceDate.slice(0, 4))
  const birthdayHasPassed = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}` <= referenceDate.slice(5)
  const dateOfBirth = createGameDate(referenceYear - age - (birthdayHasPassed ? 0 : 1), month, day)
  const [minimumHeight, maximumHeight] = HEIGHT_RANGES[position]
  const heightCm = random.nextInt(minimumHeight, maximumHeight)
  const [minimumWeight, maximumWeight] = WEIGHT_RANGES[position]
  const heightRatio = (heightCm - minimumHeight) / (maximumHeight - minimumHeight)
  const centeredWeight = Math.round(minimumWeight + (maximumWeight - minimumWeight) * heightRatio)
  const weightKg = Math.max(minimumWeight, Math.min(maximumWeight, centeredWeight + random.nextInt(-4, 4)))
  const wingspanCm = heightCm + random.nextInt(-4, 9)
  const standingReachCm = Math.round(heightCm * .91 + (position === 'C' ? 10 : position === 'PF' ? 7 : 3) + random.nextInt(-3, 5))
  return { dateOfBirth, heightCm, weightKg, wingspanCm, standingReachCm, dominantHand: random.nextInt(0, 9) === 0 ? 'LEFT' : 'RIGHT', measurementProvenance: { wingspanCm: 'generated', standingReachCm: 'generated', dominantHand: 'generated' } }
}
