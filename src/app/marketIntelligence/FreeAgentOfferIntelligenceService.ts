import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessRoutedAcquisitionProposalIntelligence } from '@/app/marketIntelligence/AcquisitionProposalIntelligenceService'
import { inspectGMPlanWorkflows } from '@/app/gmPlanning/GMPlanWorkflowService'
import { assessFreeAgentOfferIntelligence, type FreeAgentOfferIntelligence } from '@/engine/marketIntelligence'

/** Read-only BS10D-A handoff from each current BS10C result; never creates a negotiation. */
export function assessRoutedFreeAgentOfferIntelligence(world: GameWorld, teamId: TeamId): readonly FreeAgentOfferIntelligence[] {
  const workflows = inspectGMPlanWorkflows(world, teamId)
  return Object.freeze(assessRoutedAcquisitionProposalIntelligence(world, teamId)
    .map((proposal) => assessFreeAgentOfferIntelligence(world, proposal, workflows.decisions.find((decision) => decision.planId === proposal.planId && decision.needId === proposal.needId))))
}
