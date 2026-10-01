import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { inspectGMPlanWorkflows } from '../gmPlanning/GMPlanWorkflowService'
import { assessRoutedMarketCandidateFeasibility } from '@/app/marketIntelligence/MarketCandidateIntelligenceService'
import { createNoActionableProposal, selectAcquisitionProposal, type AcquisitionProposalIntelligence } from '@/engine/marketIntelligence'

/** Joins the current plan authority context to the existing BS10A/BS10B candidate and feasibility results. */
export function assessRoutedAcquisitionProposalIntelligence(world: GameWorld, teamId: TeamId): readonly AcquisitionProposalIntelligence[] {
  if (world.teams[teamId] === undefined) throw new RangeError(`Unknown Team ${teamId}`)
  const workflow = inspectGMPlanWorkflows(world, teamId)
  const routedFeasibility = assessRoutedMarketCandidateFeasibility(world, teamId)
  const acquisitionDecisions = workflow.decisions.filter((decision) => decision.responseFamily === 'EXTERNAL_ACQUISITION')

  if (acquisitionDecisions.length === 0) {
    return Object.freeze([createNoActionableProposal({ teamId, reason: 'NO_CURRENT_EXTERNAL_ACQUISITION_PLAN' })])
  }

  const proposals = acquisitionDecisions.map((decision) => {
    const assessment = routedFeasibility.find((item) => item.planId === decision.planId)
    if (assessment !== undefined) return selectAcquisitionProposal(world, assessment, decision)
    const noProposalReason = decision.currentValidity === 'STALE'
      ? 'CURRENT_PLAN_STALE'
      : decision.status === 'WAITING_APPROVAL' || decision.route === 'APPROVAL_PATH_UNRESOLVED'
        ? 'APPROVAL_PATH_UNRESOLVED'
        : decision.currentExecutionReadiness === 'BLOCKED'
          ? 'CURRENT_PLAN_BLOCKED'
          : 'NO_CURRENT_MARKET_INTELLIGENCE_ROUTE'
    return createNoActionableProposal({
      teamId,
      planId: decision.planId,
      needId: decision.needId,
      responsibleSystem: decision.responsibleSystem,
      planExecutionReadiness: decision.currentExecutionReadiness,
      reason: noProposalReason,
    })
  })

  return Object.freeze(proposals)
}
