import type { GameDate } from '@/domain/date'
import { countryIdFromString, playerIdFromString, type PlayerId } from '@/domain/ids'
import { calculateAge, createPlayer, type Player } from '@/domain/player'
import type { BasketballPosition } from '@/domain/primitives'
import { generateCanonicalDevelopmentProfile, generateCanonicalRatings } from '@/engine/world/CanonicalPlayerTruthGenerator'
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator'

/**
 * Playable Core V1 · F3. The ACB 2026/27 development universe ships no unsigned players, so a New Game would offer an empty
 * free-agent market. This is an explicitly synthetic, identified population produced by the canonical player factories
 * (same bio/ratings/development generators as the rostered players); it carries no contract and belongs to no club.
 * Ids start with `acb-free-agent-player-`, names end in `[sintético]`, so it can never be mistaken for sourced ACB facts.
 */
export const ACB_SYNTHETIC_FREE_AGENT_ID_PREFIX = 'acb-free-agent-player-'
const POOL_COMPOSITION: readonly (readonly [BasketballPosition, number])[] = [['PG', 3], ['SG', 3], ['SF', 3], ['PF', 3], ['C', 3]]

export function isAcbSyntheticFreeAgentId(playerId: string): boolean {
  return playerId.startsWith(ACB_SYNTHETIC_FREE_AGENT_ID_PREFIX)
}

export function createAcbSyntheticFreeAgents(input: { readonly seed: number; readonly currentDate: GameDate; readonly nationalityId: ReturnType<typeof countryIdFromString> }): readonly Player[] {
  return POOL_COMPOSITION.flatMap(([position, count]) => Array.from({ length: count }, (_, index) => {
    const id: PlayerId = playerIdFromString(`${ACB_SYNTHETIC_FREE_AGENT_ID_PREFIX}${position.toLowerCase()}-${String(index + 1).padStart(2, '0')}`)
    const bio = generatePlayerBio(id, position, input.currentDate)
    const ratings = generateCanonicalRatings(input.seed, id, position)
    return createPlayer({
      id,
      firstName: 'Libre',
      lastName: `${position}-${String(index + 1).padStart(2, '0')} [sintético]`,
      gender: 'male',
      nationalityId: input.nationalityId,
      basketball: { primaryPosition: position, ratings },
      bio,
      development: generateCanonicalDevelopmentProfile(input.seed, id, ratings, calculateAge(bio.dateOfBirth, input.currentDate)),
    })
  }))
}
