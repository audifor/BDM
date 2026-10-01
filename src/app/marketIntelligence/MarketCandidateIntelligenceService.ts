import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessMarketCandidateFeasibility, assessMarketCandidatesForNeed, type MarketCandidateAssessment, type MarketCandidateFeasibilityAssessment } from '@/engine/marketIntelligence'
import { inspectGMPlanWorkflows } from '../gmPlanning/GMPlanWorkflowService'

export interface RoutedMarketCandidateAssessment extends MarketCandidateAssessment {
  readonly planId: string
  readonly route: 'MARKET_INTELLIGENCE_REQUIRED'
}

export interface RoutedMarketCandidateFeasibilityAssessment extends MarketCandidateFeasibilityAssessment {
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

/** Read-only feasibility over the exact BS10A candidates for each current BS9E market route. */
export function assessRoutedMarketCandidateFeasibility(world: GameWorld, teamId: TeamId): readonly RoutedMarketCandidateFeasibilityAssessment[] {
  return Object.freeze(assessRoutedMarketCandidates(world, teamId).map((assessment) => ({
    ...assessMarketCandidateFeasibility(world, assessment),
    planId: assessment.planId,
    route: assessment.route,
  })))
}
