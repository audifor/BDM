import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessMarketCandidatesForNeed, type MarketCandidateAssessment } from '@/engine/marketIntelligence'
import { inspectGMPlanWorkflows } from '@/app/gmPlanning'

export interface RoutedMarketCandidateAssessment extends MarketCandidateAssessment {
  readonly planId: string
  readonly route: 'MARKET_INTELLIGENCE_REQUIRED'
}

/** Read-only handoff from a current BS9E incoming-market route to candidate intelligence. */
export function assessRoutedMarketCandidates(world: GameWorld, teamId: TeamId): readonly RoutedMarketCandidateAssessment[] {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)
  const workflows = inspectGMPlanWorkflows(world, teamId)
  const context = assessGMDecisionContext(world, teamId)
  return Object.freeze(workflows.decisions
    .filter((decision) => decision.currentValidity === 'CURRENT'
      && decision.responseFamily === 'EXTERNAL_ACQUISITION'
      && decision.route === 'MARKET_INTELLIGENCE_REQUIRED')
    .flatMap((decision) => {
      const need = context.needsAssessment.needs.find((item) => item.id === decision.needId)
      if (need === undefined) return []
      return [{ ...assessMarketCandidatesForNeed(world, teamId, need, context.strategy), planId: decision.planId, route: 'MARKET_INTELLIGENCE_REQUIRED' as const }]
    }))
}
