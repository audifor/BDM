import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessFormalOfferPreparation, type FormalOfferPreparation } from '@/engine/marketIntelligence'
import { assessRoutedFreeAgentOfferIntelligence } from './FreeAgentOfferIntelligenceService'

/** Rebuilds current plan/BS10C intelligence before deriving a response-gated offer preparation. */
export function assessRoutedFormalOfferPreparations(world: GameWorld, teamId: TeamId): readonly FormalOfferPreparation[] {
  return Object.freeze(assessRoutedFreeAgentOfferIntelligence(world, teamId)
    .map((offer) => assessFormalOfferPreparation(world, offer)))
}
