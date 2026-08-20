import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { EMPTY_DEVELOPMENT_STIMULUS } from '@/domain/development/DevelopmentStimulus'
import type { PlayerDevelopmentContext, PlayerDevelopmentResult } from './PlayerDevelopment'
import { developPlayerForSeason } from './PlayerDevelopment'

export function applyOffseasonDevelopment(world: GameWorld, context: PlayerDevelopmentContext): { readonly world: GameWorld; readonly results: readonly PlayerDevelopmentResult[] } {
  const developed = Object.values(world.players).map((player) => developPlayerForSeason(player, { ...context, stimulusByRating: world.developmentStimulusByPlayerId[player.id]?.byRating }))
  const developmentStimulusByPlayerId = Object.fromEntries(Object.values(world.players).map((player) => [player.id, { playerId: player.id, byRating: { ...EMPTY_DEVELOPMENT_STIMULUS } }]))
  return { world: updateGameWorld(world, { players: developed.map((item) => item.player), developmentStimulusByPlayerId }), results: developed.map((item) => item.result) }
}
