import {
  deriveGovernanceDecisionStatus,
  resolveGovernanceDecisionRights,
  type GovernanceDecision,
} from '@/domain/governance'
import { getMarketKnowledge } from '@/domain/market'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { PlayerTransferNegotiation } from '@/domain/transfer'
import { isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { activeTransferFor } from './PlayerTransferService'
import { transferFeeAuthorization, type TransferFeeAuthorization } from './PlayerTransferFinance'
import { sellerContractInForce } from '@/engine/transfer'

/**
 * What the manager legitimately knows about a player's contractual situation before and during an approach. The public registry tells
 * who the owner club is and until when the contract runs; it does NOT tell the salary, the seller's price or the player's wishes:
 * those are revealed only by the answers of the club and of the player.
 */
export interface TransferSituation {
  readonly kind: 'FREE_AGENT' | 'OWN_PLAYER' | 'CONTRACTED_ELSEWHERE' | 'UNAVAILABLE'
  readonly ownerTeamId?: TeamId
  readonly ownerClubName?: string
  readonly contractExpiresOn?: string
  readonly remainingYears?: number
  /** What THIS club has learned about the willingness to negotiate; absent means unknown, never "no". */
  readonly knownAvailability?: 'NOT_FOR_SALE' | 'LISTENING' | 'OPEN'
  readonly activeTransfer?: PlayerTransferNegotiation
  readonly feeAuthorization: TransferFeeAuthorization
  readonly blockers: readonly string[]
}

export function describeTransferSituation(world: GameWorld, buyerTeamId: TeamId, playerId: PlayerId): TransferSituation {
  const buyer = world.teams[buyerTeamId]
  const feeAuthorization = transferFeeAuthorization(world, buyerTeamId)
  if (buyer === undefined || world.players[playerId] === undefined) return { kind: 'UNAVAILABLE', feeAuthorization, blockers: ['PLAYER_OR_CLUB_NOT_FOUND'] }
  if (isPlayerFreeAgent(world, playerId)) return { kind: 'FREE_AGENT', feeAuthorization, blockers: [] }
  if (buyer.rosterPlayerIds.includes(playerId)) return { kind: 'OWN_PLAYER', feeAuthorization, blockers: [] }
  const owner = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))
  const contract = owner === undefined ? undefined : sellerContractInForce(world, owner.id, playerId)
  if (owner === undefined || contract === undefined) return { kind: 'UNAVAILABLE', feeAuthorization, blockers: ['NO_CONTRACT_IN_FORCE_WITH_A_CLUB'] }
  const knowledge = getMarketKnowledge(world.marketKnowledge, buyer.organizationId, playerId)
  const remainingYears = Math.max(0, Math.round((Date.parse(`${contract.term.expiresOn}T00:00:00Z`) - Date.parse(`${world.currentDate}T00:00:00Z`)) / 86_400_000 / 365.25 * 10) / 10)
  const activeTransfer = activeTransferFor(world, buyerTeamId, playerId)
  const blockers = [
    ...(buyer.coachId === world.userCoachId ? [] : ['ONLY_THE_MANAGERS_CLUB_CAN_BUY']),
    ...(activeTransfer === undefined ? [] : ['A_TRANSFER_NEGOTIATION_IS_ALREADY_OPEN']),
    ...(feeAuthorization.state === 'AVAILABLE' ? [] : ['NO_TRANSFER_COMPENSATION_AUTHORIZATION']),
  ]
  return {
    kind: 'CONTRACTED_ELSEWHERE', ownerTeamId: owner.id, ownerClubName: owner.name, contractExpiresOn: contract.term.expiresOn, remainingYears,
    ...(knowledge?.availability === undefined ? {} : { knownAvailability: knowledge.availability }),
    ...(activeTransfer === undefined ? {} : { activeTransfer }), feeAuthorization, blockers,
  }
}

export interface TransferGovernanceView {
  readonly decision?: GovernanceDecision
  readonly status: 'NOT_REQUESTED' | 'PROPOSED' | 'REVIEW_STARTED' | 'APPROVED' | 'REJECTED' | 'VETOED' | 'WITHDRAWN' | 'EXECUTED'
  readonly requiredApproverBodyIds: readonly string[]
  readonly approvedBodyIds: readonly string[]
  readonly pendingBodyNames: readonly string[]
  /** Bodies in which the manager himself holds an active seat and can therefore act. */
  readonly userProposerBodyIds: readonly string[]
  readonly userApproverBodyIds: readonly string[]
}

export function describeTransferGovernance(world: GameWorld, transfer: PlayerTransferNegotiation): TransferGovernanceView {
  const institution = Object.values(world.governanceInstitutionsById).find((item) => item.teamIds.includes(transfer.buyerTeamId))
  const decision = institution === undefined ? undefined : Object.values(world.governanceDecisionsById).find((item) => item.institutionId === institution.id
    && item.decisionType === 'PLAYER_CONTRACT_SIGNING' && item.subject.kind === 'GENERIC' && item.subject.referenceId === transfer.id)
  const userSeats = Object.values(world.governanceAppointmentsById).filter((appointment) => appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId
    && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate)).map((appointment) => appointment.bodyId)
  const graph = { bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) }
  const rights = institution === undefined ? undefined : resolveGovernanceDecisionRights({ decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId: institution.id, asOfDate: decision?.proposedOn ?? world.currentDate, ...graph })
  const events = decision === undefined ? [] : Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id)
  const required = rights?.approverBodyIds ?? []
  const approved = required.filter((bodyId) => events.some((event) => event.kind === 'APPROVED' && event.bodyId === bodyId))
  const status = decision === undefined ? 'NOT_REQUESTED' : deriveGovernanceDecisionStatus(events, required)
  return {
    ...(decision === undefined ? {} : { decision }),
    status: status as TransferGovernanceView['status'],
    requiredApproverBodyIds: required,
    approvedBodyIds: approved,
    pendingBodyNames: required.filter((bodyId) => !approved.includes(bodyId)).map((bodyId) => world.governanceBodiesById[bodyId]?.name ?? bodyId),
    userProposerBodyIds: (rights?.proposerBodyIds ?? []).filter((bodyId) => userSeats.includes(bodyId)),
    userApproverBodyIds: decision === undefined ? [] : required.filter((bodyId) => userSeats.includes(bodyId) && !approved.includes(bodyId)),
  }
}
