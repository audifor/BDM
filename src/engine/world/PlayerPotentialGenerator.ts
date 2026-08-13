import { calculateBootstrapAbilityProxy, type PlayerPotential, type PlayerRatings } from '@/domain/player'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export function generatePlayerPotential(playerId: string, ratings: PlayerRatings, age: number): PlayerPotential {
  const [minimum, maximum] = potentialHeadroomRangeForAge(age)
  const headroom = new SeededRandomSource(hashStringToSeed(`player-potential-v1:${playerId}`)).nextInt(minimum, maximum)
  return { ceiling: Math.max(0, Math.min(100, Math.round(calculateBootstrapAbilityProxy(ratings) + headroom))) }
}

export function potentialHeadroomRangeForAge(age: number): readonly [number, number] {
  if (age <= 20) return [8, 28]
  if (age <= 23) return [6, 24]
  if (age <= 26) return [4, 18]
  if (age <= 28) return [2, 12]
  if (age <= 30) return [0, 8]
  if (age <= 32) return [0, 6]
  return [0, 4]
}
