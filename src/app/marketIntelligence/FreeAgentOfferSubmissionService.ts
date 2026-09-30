import { negotiationContactActor, negotiationIdForOpening, negotiationOfferActor, negotiationOpeningKeyString, type ContractNegotiation, type NegotiationResponsibleActor } from '@/domain/market'
import type { TeamId } from '@/domain/ids'
import { isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { openNegotiation } from '@/engine/market'
import type { FormalOfferPreparation } from '@/engine/marketIntelligence'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import { assessRoutedFreeAgentOfferIntelligence } from './FreeAgentOfferIntelligenceService'

export interface SubmitPreparedFreeAgentOfferInput {
  readonly teamId: TeamId
  readonly negotiationId: string
  readonly expectedProposalId: string
}

export type SubmitPreparedFreeAgentOfferStatus =
  | 'SUBMITTED'
  | 'ALREADY_SUBMITTED'
  | 'NOT_READY'
  | 'STALE_PLAN_OR_PROPOSAL'
  | 'CONTACT_NOT_POSITIVE'
  | 'PLAYER_NOT_FREE_AGENT'
  | 'NO_EXECUTION_OWNER'
  | 'FINANCIAL_BLOCK'
  | 'LIFECYCLE_CONFLICT'
  | 'BLOCKED'

export interface SubmitPreparedFreeAgentOfferResult {
  readonly status: SubmitPreparedFreeAgentOfferStatus
  readonly world: GameWorld
  readonly negotiation?: ContractNegotiation
  readonly preparation?: FormalOfferPreparation
  readonly reason?: string
}

/** Rebuilds current BS9–BS10D intelligence from identifiers and submits one nonbinding OPEN offer. */
export function submitPreparedFreeAgentOffer(world: GameWorld, input: SubmitPreparedFreeAgentOfferInput): SubmitPreparedFreeAgentOfferResult {
  const team = world.teams[input.teamId]
  if (team === undefined) return { status: 'BLOCKED', world, reason: 'TEAM_NOT_FOUND' }
  const intended = world.negotiationsById[input.negotiationId]
  if (intended?.teamId === input.teamId && intended.sourceProposalId === input.expectedProposalId
    && intended.status === 'CONTACTED' && !isPlayerFreeAgent(world, intended.playerId)) {
    return { status: 'PLAYER_NOT_FREE_AGENT', world, negotiation: intended, reason: 'PLAYER_NO_LONGER_FREE_AGENT' }
  }

  const isUserDirectedIntent = intended?.sourcePlanId?.startsWith(`user-market-intent:${input.teamId}:`) === true
  const offer = assessRoutedFreeAgentOfferIntelligence(world, input.teamId,
    isUserDirectedIntent ? intended?.playerId : undefined,
    isUserDirectedIntent ? intended?.sourcePlanId : undefined)
    .find((candidate) => candidate.sourceProposalId === input.expectedProposalId)
  if (offer === undefined || offer.outcome !== 'FREE_AGENT_OFFER' || offer.playerId === undefined
    || offer.actionKey === undefined || offer.sourcePlanId === undefined) {
    return { status: 'STALE_PLAN_OR_PROPOSAL', world, reason: 'EXPECTED_PROPOSAL_IS_NOT_CURRENT' }
  }

  const currentNegotiationId = negotiationIdForOpening({ organizationId: team.organizationId, teamId: input.teamId, playerId: offer.playerId, actionKey: offer.actionKey })
  if (currentNegotiationId !== input.negotiationId) return { status: 'STALE_PLAN_OR_PROPOSAL', world, reason: 'EXPECTED_NEGOTIATION_IS_NOT_CURRENT' }
  const existing = world.negotiationsById[currentNegotiationId]
  if (existing === undefined) return { status: 'CONTACT_NOT_POSITIVE', world, reason: 'CANONICAL_CONTACT_NOT_FOUND' }

  const openingKey = negotiationOpeningKeyString({ organizationId: team.organizationId, teamId: input.teamId, playerId: offer.playerId, actionKey: offer.actionKey })
  if (existing.id !== currentNegotiationId || existing.organizationId !== team.organizationId || existing.teamId !== input.teamId
    || existing.playerId !== offer.playerId || existing.actionKey !== offer.actionKey || existing.openingKey !== openingKey
    || existing.sourcePlanId !== offer.sourcePlanId || existing.sourceProposalId !== offer.sourceProposalId) {
    return { status: 'STALE_PLAN_OR_PROPOSAL', world, reason: 'CANONICAL_NEGOTIATION_DOES_NOT_MATCH_CURRENT_PROPOSAL' }
  }

  const preparation = assessFormalOfferPreparation(world, offer)
  if (existing.status === 'OPEN') return alreadySubmitted(world, existing, offer, preparation)
  if (existing.status === 'CLOSED') return { status: 'CONTACT_NOT_POSITIVE', world, negotiation: existing, preparation, reason: 'CONTACT_IS_CLOSED' }
  if (existing.status !== 'CONTACTED') return { status: 'LIFECYCLE_CONFLICT', world, negotiation: existing, preparation, reason: `NEGOTIATION_ALREADY_${existing.status}` }
  if (!isPlayerFreeAgent(world, existing.playerId)) return { status: 'PLAYER_NOT_FREE_AGENT', world, negotiation: existing, preparation, reason: 'PLAYER_NO_LONGER_FREE_AGENT' }
  if (existing.contactResponse?.outcome !== 'OPEN_TO_TALKS') return { status: 'CONTACT_NOT_POSITIVE', world, negotiation: existing, preparation, reason: 'CONTACT_RESPONSE_NOT_OPEN_TO_TALKS' }
  if (negotiationContactActor(existing) === undefined) return { status: 'BLOCKED', world, negotiation: existing, preparation, reason: 'CONTACT_ACTOR_ATTRIBUTION_UNAVAILABLE' }

  if (preparation.readiness !== 'READY_TO_SUBMIT_OFFER') return readinessResult(world, existing, preparation)
  const offerResponsibleActor = actorFromPreparation(preparation)
  if (offerResponsibleActor === undefined) return { status: 'NO_EXECUTION_OWNER', world, negotiation: existing, preparation, reason: 'NO_CURRENT_FORMAL_OFFER_OWNER' }
  if (preparation.salaryProposal === undefined || preparation.termProposalYears === undefined) {
    return { status: 'NOT_READY', world, negotiation: existing, preparation, reason: 'REQUIRED_OPEN_TERMS_MISSING' }
  }

  try {
    const next = openNegotiation(world, {
      organizationId: team.organizationId,
      teamId: input.teamId,
      playerId: existing.playerId,
      ...(preparation.agentId === undefined ? {} : { agentId: preparation.agentId }),
      salary: preparation.salaryProposal.amount,
      years: preparation.termProposalYears,
      ...(preparation.roleProposal === undefined ? {} : { role: preparation.roleProposal }),
      ...(preparation.agentFeeProposal === undefined ? {} : { agentFee: preparation.agentFeeProposal }),
      actionKey: offer.actionKey,
      sourcePlanId: offer.sourcePlanId,
      sourceProposalId: offer.sourceProposalId,
      offerResponsibleActor,
    })
    const negotiation = next.negotiationsById[currentNegotiationId]
    if (negotiation?.status !== 'OPEN') return { status: 'BLOCKED', world, preparation, reason: 'ENGINE_DID_NOT_CREATE_OPEN_OFFER' }
    return { status: 'SUBMITTED', world: next, negotiation, preparation }
  } catch (error) {
    return engineFailure(world, existing, preparation, error)
  }
}

function alreadySubmitted(world: GameWorld, existing: ContractNegotiation, offer: ReturnType<typeof assessRoutedFreeAgentOfferIntelligence>[number], preparation: FormalOfferPreparation): SubmitPreparedFreeAgentOfferResult {
  const actor = actorFromPreparation(preparation)
  const recordedActor = negotiationOfferActor(existing)
  const sameActor = actor?.kind === recordedActor?.kind
    && (actor?.kind !== 'STAFF' || (recordedActor?.kind === 'STAFF' && actor.staffPersonId === recordedActor.staffPersonId))
  const sameTerms = preparation.salaryProposal?.amount === existing.salary
    && preparation.termProposalYears === existing.years
    && preparation.roleProposal === existing.role
    && preparation.agentFeeProposal === existing.agentFee
    && offer.agentId === existing.agentId
  if (existing.contactResponse?.outcome !== 'OPEN_TO_TALKS' || !sameActor || !sameTerms) {
    return { status: 'LIFECYCLE_CONFLICT', world, negotiation: existing, preparation, reason: 'OPEN_OFFER_DOES_NOT_MATCH_CURRENT_PREPARATION' }
  }
  return { status: 'ALREADY_SUBMITTED', world, negotiation: existing, preparation }
}

function actorFromPreparation(preparation: FormalOfferPreparation): NegotiationResponsibleActor | undefined {
  const owner = preparation.executionResponsibility.owner
  if (owner?.kind === 'USER') return { kind: 'USER' }
  if (owner?.kind === 'STAFF') return { kind: 'STAFF', staffPersonId: owner.staffPersonId }
  return undefined
}

function readinessResult(world: GameWorld, negotiation: ContractNegotiation, preparation: FormalOfferPreparation): SubmitPreparedFreeAgentOfferResult {
  const status: SubmitPreparedFreeAgentOfferStatus = preparation.readiness === 'STALE'
    ? 'STALE_PLAN_OR_PROPOSAL'
    : preparation.readiness === 'CONTACT_NOT_POSITIVE'
      ? 'CONTACT_NOT_POSITIVE'
      : preparation.readiness === 'NO_EXECUTION_OWNER'
        ? 'NO_EXECUTION_OWNER'
        : preparation.readiness === 'FINANCIAL_BLOCK'
          ? 'FINANCIAL_BLOCK'
          : preparation.readiness === 'BLOCKED' && preparation.blockers.includes('CONFLICTING_ACTIVE_NEGOTIATION')
            ? 'LIFECYCLE_CONFLICT'
            : 'NOT_READY'
  return { status, world, negotiation, preparation, reason: preparation.blockers[0] ?? preparation.readiness }
}

function engineFailure(world: GameWorld, negotiation: ContractNegotiation, preparation: FormalOfferPreparation, error: unknown): SubmitPreparedFreeAgentOfferResult {
  const reason = error instanceof Error ? error.message : String(error)
  const status: SubmitPreparedFreeAgentOfferStatus = reason.includes('no longer a free agent')
    ? 'PLAYER_NOT_FREE_AGENT'
    : reason.includes('cannot afford')
      ? 'FINANCIAL_BLOCK'
      : reason.includes('not authorized')
        ? 'NO_EXECUTION_OWNER'
        : reason.includes('positive current contact')
          ? 'CONTACT_NOT_POSITIVE'
          : reason.includes('already exists') || reason.includes('already in use') || reason.includes('exact existing CONTACTED')
            ? 'LIFECYCLE_CONFLICT'
            : 'BLOCKED'
  return { status, world, negotiation, preparation, reason }
}

export interface AiFreeAgentOfferCheckpointResult {
  readonly world: GameWorld
  readonly results: readonly SubmitPreparedFreeAgentOfferResult[]
}

/** Attempts once, immediately after response processing, for AI contacts answered positively today. */
export function submitAiOffersAfterPositiveContactResponses(world: GameWorld): AiFreeAgentOfferCheckpointResult {
  const contacts = Object.values(world.negotiationsById)
    .filter((item) => item.status === 'CONTACTED' && item.contactResponse?.outcome === 'OPEN_TO_TALKS'
      && item.contactResponse.respondedOn === world.currentDate && item.teamId !== undefined
      && item.sourceProposalId !== undefined && world.teams[item.teamId]?.coachId !== undefined
      && world.teams[item.teamId]?.coachId !== world.userCoachId)
    .sort((a, b) => a.id.localeCompare(b.id))
  let current = world
  const results: SubmitPreparedFreeAgentOfferResult[] = []
  for (const contact of contacts) {
    const result = submitPreparedFreeAgentOffer(current, { teamId: contact.teamId!, negotiationId: contact.id, expectedProposalId: contact.sourceProposalId! })
    results.push(result)
    current = result.world
  }
  return { world: current, results: Object.freeze(results) }
}
