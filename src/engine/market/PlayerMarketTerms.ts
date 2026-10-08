import type { PlayerId } from '@/domain/ids'
import { calculateBootstrapAbilityProxy } from '@/domain/player'
import type { GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export interface FreeAgentMarketTerms { readonly playerId: PlayerId; readonly annualSalary: number; readonly contractYears: number }
export const calculateBootstrapSalaryBase = (ability: number) => 100_000 + Math.pow(Math.max(0, ability - 40), 2) * 1_000

/** Shared existing terms for free agency and an atomic college/international exit. */
export function getPlayerMarketTerms(world: GameWorld, playerId: PlayerId): FreeAgentMarketTerms {
  const player = world.players[playerId]
  if (!player) throw new Error('Player is unavailable')
  const ability = calculateBootstrapAbilityProxy(player.basketball.ratings)
  const variance = new SeededRandomSource(hashStringToSeed(`free-agent-market-salary-v1:${world.currentSeasonId}:${playerId}`)).nextFloat(.95, 1.15)
  return { playerId, annualSalary: Math.max(1, Math.round(calculateBootstrapSalaryBase(ability) * variance / 10_000) * 10_000), contractYears: new SeededRandomSource(hashStringToSeed(`free-agent-market-term-v1:${world.currentSeasonId}:${playerId}`)).nextInt(1, 4) }
}
