import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { EMPTY_DEVELOPMENT_STIMULUS } from '@/domain/development/DevelopmentStimulus'
import {
  appendRatingHistory,
  EMPTY_PLAYER_RATING_HISTORY,
  type PlayerRatingDeltas,
} from '@/domain/development/PlayerRatingHistory'
import { CANONICAL_RATING_KEYS, legacyCanonicalRatingSignals, type CanonicalRatingKey, type Player } from '@/domain/player'
import type { PlayerDevelopmentContext, PlayerDevelopmentResult } from './PlayerDevelopment'
import { developPlayerForSeason } from './PlayerDevelopment'

/**
 * Canonical rating movement of one transition.
 *
 * The canonical signals are a projection of the 80-key truth that the development engine writes,
 * so they are recomputed on both sides of the transition instead of being inferred from the truth
 * deltas. A transition that moves no canonical rating records nothing.
 */
function canonicalDeltas(before: Player, after: Player): PlayerRatingDeltas {
  const previous = legacyCanonicalRatingSignals(before.basketball.ratings)
  const next = legacyCanonicalRatingSignals(after.basketball.ratings)
  const deltas: Partial<Record<CanonicalRatingKey, number>> = {}
  for (const key of CANONICAL_RATING_KEYS) {
    const delta = next[key] - previous[key]
    if (delta !== 0) deltas[key] = delta
  }
  return deltas
}

export function applyOffseasonDevelopment(world: GameWorld, context: PlayerDevelopmentContext): { readonly world: GameWorld; readonly results: readonly PlayerDevelopmentResult[] } {
  const developed = Object.values(world.players).map((player) => developPlayerForSeason(player, { ...context, stimulusByRating: world.developmentStimulusByPlayerId[player.id]?.byRating }))
  const developmentStimulusByPlayerId = Object.fromEntries(Object.values(world.players).map((player) => [player.id, { playerId: player.id, byRating: { ...EMPTY_DEVELOPMENT_STIMULUS } }]))
  const playerRatingHistoryByPlayerId = { ...world.playerRatingHistoryByPlayerId }
  for (const item of developed) {
    const previous = world.players[item.player.id]
    if (previous === undefined) continue
    const deltas = canonicalDeltas(previous, item.player)
    if (Object.keys(deltas).length === 0) continue
    playerRatingHistoryByPlayerId[item.player.id] = appendRatingHistory(
      playerRatingHistoryByPlayerId[item.player.id] ?? EMPTY_PLAYER_RATING_HISTORY,
      { seasonId: context.fromSeasonId, deltas },
    )
  }
  return {
    world: updateGameWorld(world, {
      players: developed.map((item) => item.player),
      developmentStimulusByPlayerId,
      playerRatingHistoryByPlayerId,
    }),
    results: developed.map((item) => item.result),
  }
}
