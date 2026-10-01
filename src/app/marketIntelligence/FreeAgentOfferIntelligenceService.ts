import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessRoutedAcquisitionProposalIntelligence } from '@/app/marketIntelligence/AcquisitionProposalIntelligenceService'
import { inspectGMPlanWorkflows } from '@/app/gmPlanning/GMPlanWorkflowService'
import { assessRoutedMarketCandidateFeasibility } from './MarketCandidateIntelligenceService'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessGMPlanWorkflow, type GMWorkflowDecision } from '@/engine/gmPlanning'
import { createGMPlanState } from '@/domain/gmPlanning'
import { assessMarketCandidatesForNeed, assessMarketCandidateFeasibility, selectAcquisitionProposal } from '@/engine/marketIntelligence'
import { isPlayerFreeAgent } from '@/domain/world'
import { assessFreeAgentOfferIntelligence, type FreeAgentOfferIntelligence } from '@/engine/marketIntelligence'

/** Read-only BS10D-A handoff from each current BS10C result; never creates a negotiation. */
export function assessRoutedFreeAgentOfferIntelligence(world: GameWorld, teamId: TeamId, selectedPlayerId?: PlayerId, intentPlanId?: string): readonly FreeAgentOfferIntelligence[] {
  const workflows = inspectGMPlanWorkflows(world, teamId)
  if (world.teams[teamId]?.coachId !== world.userCoachId) {
    return Object.freeze(assessRoutedAcquisitionProposalIntelligence(world, teamId)
      .map((proposal) => assessFreeAgentOfferIntelligence(world, proposal, workflows.decisions.find((decision) => decision.planId === proposal.planId && decision.needId === proposal.needId))))
  }

  // User planning stays advisory and unpersisted. A selectable BS9 need plus
  // exact BS10 feasibility produces a stable, target-specific user intent.
  const direct = assessUserDirectedTargets(world, teamId, selectedPlayerId, intentPlanId)
  return Object.freeze(direct.map(({ proposal, workflow }) => assessFreeAgentOfferIntelligence(world, proposal, workflow)))
}

function assessUserDirectedTargets(world: GameWorld, teamId: TeamId, selectedPlayerId?: PlayerId, requestedPlanId?: string): readonly { readonly proposal: ReturnType<typeof selectAcquisitionProposal>; readonly workflow: GMWorkflowDecision }[] {
  const context = assessGMDecisionContext(world, teamId)
  const acquisitionOptions = context.options.filter((option) => option.kind === 'EXTERNAL_ACQUISITION' && option.planningEligibility === 'SELECTABLE')
  const requestedNeedId = requestedPlanId?.startsWith(`user-market-intent:${teamId}:`) ? requestedPlanId.slice(`user-market-intent:${teamId}:`.length) : undefined
  const options = acquisitionOptions.filter((option) => requestedNeedId === undefined || option.needId === requestedNeedId)
    .sort((a, b) => a.priority - b.priority || a.needId.localeCompare(b.needId))
  const targets: { proposal: ReturnType<typeof selectAcquisitionProposal>; workflow: GMWorkflowDecision }[] = []
  const seenPlayers = new Set<PlayerId>()
  for (const option of options) {
    const need = context.needsAssessment.needs.find((item) => item.id === option.needId)
    if (need === undefined) continue
    const plan = createGMPlanState({
      id: `user-market-intent:${teamId}:${need.id}`,
      teamId,
      needId: need.id,
      selectedOptionKind: 'EXTERNAL_ACQUISITION',
      selectedOn: context.asOfDate,
      lastReviewedOn: context.asOfDate,
      selectionReason: 'INITIAL_SELECTION',
      executionReadinessAtSelection: option.executionReadiness as Exclude<typeof option.executionReadiness, 'BLOCKED'>,
      strategyAtSelection: context.strategy,
      originalOptionPriority: option.priority,
    })
    const workflow = assessGMPlanWorkflow(context, plan)
    if (workflow.currentValidity !== 'CURRENT' || workflow.route !== 'MARKET_INTELLIGENCE_REQUIRED') continue
    const candidates = assessMarketCandidateFeasibility(world, assessMarketCandidatesForNeed(world, teamId, need, context.strategy))
    const eligible = candidates.candidates.filter((item) => (selectedPlayerId === undefined || item.playerId === selectedPlayerId)
      && !seenPlayers.has(item.playerId)
      && item.feasibility.route === 'FREE_AGENT_SIGNING'
      && item.feasibility.routeSupport === 'SUPPORTED'
      && item.feasibility.blockers.length === 0
      && isPlayerFreeAgent(world, item.playerId))
    for (const candidate of eligible) {
      seenPlayers.add(candidate.playerId)
      targets.push({ workflow, proposal: selectAcquisitionProposal(world, { ...candidates, candidates: [candidate] }, workflow) })
    }
    if (selectedPlayerId !== undefined && targets.length > 0) break
  }
  return Object.freeze(targets)
}
