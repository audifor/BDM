import type { PlayerId, TeamId } from '@/domain/ids'
import { negotiationIdForOpening, type ContractNegotiation } from '@/domain/market'
import type { GameWorld } from '@/domain/world'
import { createNegotiationContact as createContactInEngine, type CreateNegotiationContactResult } from '@/engine/market'
import { assessRoutedFreeAgentOfferIntelligence } from './FreeAgentOfferIntelligenceService'

export type PreferredFreeAgentContactStatus =
  | 'CREATED'
  | 'ALREADY_EXISTS'
  | 'STALE_PLAN_OR_PROPOSAL'
  | 'PLAYER_NOT_FREE_AGENT'
  | 'NO_EXECUTION_OWNER'
  | 'ACTIVE_NEGOTIATION_EXISTS'
  | 'BLOCKED'
  | 'NO_CURRENT_PROPOSAL'

export interface PreferredFreeAgentContactResult {
  readonly status: PreferredFreeAgentContactStatus
  readonly world: GameWorld
  readonly reason?: string
  readonly contact?: ContractNegotiation & { readonly status: 'CONTACTED' }
}

/** Recomputes the full live routed proposal chain; the supplied proposal ID only identifies the user's intended row. */
export function initiatePreferredFreeAgentContact(world: GameWorld, teamId: TeamId, expectedProposalId: string, selectedPlayerId?: PlayerId): PreferredFreeAgentContactResult {
  if (world.teams[teamId] === undefined) return { status: 'BLOCKED', world, reason: 'TEAM_NOT_FOUND' }
  const offers = assessRoutedFreeAgentOfferIntelligence(world, teamId, selectedPlayerId)
  const offer = offers.find((item) => item.sourceProposalId === expectedProposalId)
  if (offer === undefined) return { status: 'STALE_PLAN_OR_PROPOSAL', world, reason: 'EXPECTED_PROPOSAL_IS_NOT_CURRENT' }
  if (offer.outcome !== 'FREE_AGENT_OFFER' || offer.playerId === undefined || offer.actionKey === undefined || offer.sourcePlanId === undefined) {
    return { status: 'NO_CURRENT_PROPOSAL', world, reason: offer.blockers[0] ?? 'NO_CURRENT_FREE_AGENT_APPROACH' }
  }

  const team = world.teams[teamId]!
  const id = negotiationIdForOpening({ organizationId: team.organizationId, teamId, playerId: offer.playerId, actionKey: offer.actionKey })
  const existing = world.negotiationsById[id]
  if (existing?.status === 'CONTACTED'
    && existing.teamId === teamId
    && existing.playerId === offer.playerId
    && (existing.actionKey === undefined || existing.actionKey === offer.actionKey)
    && existing.organizationId === team.organizationId
    && existing.sourcePlanId === offer.sourcePlanId
    && existing.sourceProposalId === offer.sourceProposalId) {
    return { status: 'ALREADY_EXISTS', world, contact: existing as ContractNegotiation & { readonly status: 'CONTACTED' } }
  }

  if (offer.contactReadiness === 'STALE_PLAN_OR_PROPOSAL') return { status: 'STALE_PLAN_OR_PROPOSAL', world, reason: 'CURRENT_PLAN_OR_PROPOSAL_IS_STALE' }
  if (offer.contactReadiness === 'CANDIDATE_NOT_FREE_AGENT') return { status: 'PLAYER_NOT_FREE_AGENT', world, reason: 'PLAYER_NOT_FREE_AGENT' }
  if (offer.contactReadiness === 'ACTIVE_NEGOTIATION_EXISTS' || offer.contactReadiness === 'SAME_ATTEMPT_ALREADY_RECORDED') {
    return { status: 'ACTIVE_NEGOTIATION_EXISTS', world, reason: 'ACTIVE_NEGOTIATION_ALREADY_EXISTS' }
  }
  if (offer.contactReadiness === 'CONTACT_AUTHORITY_UNAVAILABLE') return { status: 'NO_EXECUTION_OWNER', world, reason: 'NO_CONTACT_EXECUTION_OWNER' }
  if (offer.contactReadiness === 'CONTACT_AUTHORITY_BLOCKED') return { status: 'BLOCKED', world, reason: offer.contactAuthority.blockers[0] ?? 'CONTACT_AUTHORITY_BLOCKED' }
  if (offer.contactReadiness !== 'READY_TO_CONTACT') return { status: 'BLOCKED', world, reason: `CONTACT_NOT_READY:${offer.contactReadiness}` }

  const responsibleActor = offer.contactAuthority.authorityStatus === 'USER_CONTROLLED'
    ? { kind: 'USER' as const }
    : offer.contactAuthority.authorityStatus === 'AUTHORIZED' && offer.contactAuthority.responsibleStaffId !== undefined
      ? { kind: 'STAFF' as const, staffPersonId: offer.contactAuthority.responsibleStaffId }
      : undefined
  if (responsibleActor === undefined) return { status: 'NO_EXECUTION_OWNER', world, reason: 'NO_TRUTHFUL_CONTACT_ACTOR' }

  const result = createContactInEngine(world, {
    organizationId: team.organizationId,
    teamId,
    playerId: offer.playerId,
    startedOn: world.currentDate,
    actionKey: offer.actionKey,
    responsibleActor,
    sourcePlanId: offer.sourcePlanId,
    sourceProposalId: offer.sourceProposalId,
  })
  return { status: result.status, world: result.world, ...('reason' in result ? { reason: result.reason } : { contact: result.contact as ContractNegotiation & { readonly status: 'CONTACTED' } }) }
}
