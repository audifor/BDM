import { isActiveNegotiation, negotiationIdForOpening, negotiationOpeningKeyString } from '@/domain/market'
import type { MarketSignalEvidence } from './MarketCandidateFeasibility'
import type { FreeAgentOfferIntelligence } from './FreeAgentOfferIntelligence'
import type { NegotiationRole } from '@/domain/market'
import { canTeamAffordAdditionalSalary, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { resolveOfferExecutionResponsibility, type OfferExecutionOwner } from '@/engine/market/NegotiationOfferAuthority'

export type FormalOfferPreparationReadiness =
  | 'READY_TO_SUBMIT_OFFER'
  | 'MORE_INFORMATION_REQUIRED'
  | 'NO_EXECUTION_OWNER'
  | 'FINANCIAL_BLOCK'
  | 'STALE'
  | 'CONTACT_NOT_POSITIVE'
  | 'BLOCKED'

export type FormalOfferPreparationOwner = OfferExecutionOwner

export interface FormalOfferPreparation {
  /** Stable derived identity; this is not persisted. */
  readonly id: string
  readonly teamId: FreeAgentOfferIntelligence['teamId']
  readonly playerId?: FreeAgentOfferIntelligence['playerId']
  readonly negotiationId?: string
  readonly currentContactResponse?: 'OPEN_TO_TALKS' | 'NOT_INTERESTED'
  readonly salaryExpectation?: MarketSignalEvidence
  readonly salaryProposal?: { readonly amount: number; readonly policy: 'MATCH_KNOWN_EXPECTATION' }
  readonly salaryAuthority: 'MATCH_KNOWN_EXPECTATION' | 'UNKNOWN'
  readonly expectedTermYears?: MarketSignalEvidence
  readonly termProposalYears?: number
  readonly termAuthority: 'MATCH_KNOWN_EXPECTED_YEARS' | 'UNKNOWN'
  readonly roleProposal?: NegotiationRole
  readonly roleStatus: 'NOT_YET_PROPOSED' | 'PROPOSED'
  readonly roleAuthority: 'NOT_REQUIRED_AT_OPEN' | 'UNKNOWN'
  readonly agentId?: FreeAgentOfferIntelligence['agentId']
  readonly agentFeeProposal?: number
  readonly agentFeeStatus: 'NOT_YET_PROPOSED' | 'PROPOSED'
  readonly agentFeeAuthority: 'NOT_REQUIRED_AT_OPEN' | 'UNKNOWN'
  readonly payrollAffordability: 'AFFORDABLE' | 'OVER_BUDGET' | 'UNKNOWN'
  readonly executionResponsibility: {
    readonly kind: 'submitPlayerContractOffer'
    readonly status: 'USER_AUTHORITY' | 'RESOLVED_HOLDER' | 'NO_EXECUTION_OWNER' | 'BLOCKED'
    readonly owner?: FormalOfferPreparationOwner
    readonly reasons: readonly string[]
    readonly blockers: readonly string[]
  }
  readonly governanceAuthority: 'NOT_REQUIRED'
  readonly signingGovernanceDecisionType: 'PLAYER_CONTRACT_SIGNING'
  readonly financeV2Context?: FreeAgentOfferIntelligence['financeV2Context']
  readonly readiness: FormalOfferPreparationReadiness
  readonly missingInformation: readonly string[]
  readonly deferredInformation: readonly string[]
  readonly blockers: readonly string[]
  readonly reasons: readonly string[]
}

/** Read-only exact-field preparation after the current canonical contact has a positive response. */
export function assessFormalOfferPreparation(world: GameWorld, offer: FreeAgentOfferIntelligence): FormalOfferPreparation {
  const team = world.teams[offer.teamId]
  const playerId = offer.playerId
  const sourceIsCurrent = offer.outcome === 'FREE_AGENT_OFFER'
    && offer.readiness !== 'STALE_PLAN_OR_PROPOSAL'
    && offer.actionKey !== undefined
    && offer.actionKey.trim() !== ''
    && offer.sourcePlanId !== undefined
    && offer.sourcePlanId.trim() !== ''
    && offer.sourceProposalId.trim() !== ''
    && team !== undefined
    && playerId !== undefined
  const negotiationId = sourceIsCurrent
    ? negotiationIdForOpening({ organizationId: team!.organizationId, teamId: offer.teamId, playerId: playerId!, actionKey: offer.actionKey! })
    : undefined
  const contact = negotiationId === undefined ? undefined : world.negotiationsById[negotiationId]
  const exactContact = contact?.status === 'CONTACTED'
    && contact.teamId === offer.teamId
    && contact.organizationId === team!.organizationId
    && contact.playerId === playerId
    && contact.actionKey === offer.actionKey
    && contact.openingKey === negotiationOpeningKeyString({ organizationId: team!.organizationId, teamId: offer.teamId, playerId: playerId!, actionKey: offer.actionKey! })
    && contact.sourcePlanId === offer.sourcePlanId
    && contact.sourceProposalId === offer.sourceProposalId
  const positiveContact = exactContact && contact.contactResponse?.outcome === 'OPEN_TO_TALKS'
  const currentFreeAgent = playerId !== undefined && isPlayerFreeAgent(world, playerId)
  const conflict = positiveContact && Object.values(world.negotiationsById).some((item) => item.id !== contact.id
    && isActiveNegotiation(item)
    && item.playerId === playerId
    && (item.teamId === offer.teamId || (item.teamId === undefined && item.organizationId === team!.organizationId)))

  const salaryExpectation = offer.preparedSalary
  const hasSalary = salaryExpectation !== undefined
    && Number.isSafeInteger(salaryExpectation.value)
    && salaryExpectation.value > 0
    && salaryExpectation.value <= 100_000_000
  const salaryProposal = hasSalary ? { amount: salaryExpectation!.value, policy: 'MATCH_KNOWN_EXPECTATION' as const } : undefined
  const termEvidence = offer.expectedTermYears
  const hasTerm = termEvidence !== undefined && Number.isSafeInteger(termEvidence.value) && termEvidence.value > 0
  const termProposalYears = hasTerm ? termEvidence!.value : undefined
  const payrollAffordability: FormalOfferPreparation['payrollAffordability'] = salaryProposal === undefined
    ? 'UNKNOWN'
    : canTeamAffordAdditionalSalary(world, offer.teamId, salaryProposal.amount) ? 'AFFORDABLE' : 'OVER_BUDGET'
  const executionResponsibility = {
    kind: 'submitPlayerContractOffer' as const,
    ...resolveOfferExecutionResponsibility(world, offer.teamId),
  }

  const missingInformation = [
    ...(salaryProposal === undefined ? [salaryExpectation === undefined ? 'CLUB_KNOWN_EXPECTED_SALARY_UNKNOWN' : 'CLUB_KNOWN_EXPECTED_SALARY_INVALID'] : []),
    ...(termProposalYears === undefined ? [termEvidence === undefined ? 'CLUB_KNOWN_EXPECTED_TERM_UNKNOWN' : 'CLUB_KNOWN_EXPECTED_TERM_INVALID'] : []),
  ]
  const blockers = [
    ...(!sourceIsCurrent ? ['CURRENT_GM_PLAN_OR_BS10C_PROPOSAL_UNAVAILABLE'] : []),
    ...(currentFreeAgent ? [] : ['PLAYER_NO_LONGER_FREE_AGENT']),
    ...(!positiveContact ? ['CURRENT_CONTACT_RESPONSE_NOT_POSITIVE'] : []),
    ...(conflict ? ['CONFLICTING_ACTIVE_NEGOTIATION'] : []),
    ...(payrollAffordability === 'OVER_BUDGET' ? ['CURRENT_PAYROLL_CANNOT_SUPPORT_PROPOSED_SALARY'] : []),
    ...executionResponsibility.blockers,
    ...missingInformation,
  ]
  const readiness: FormalOfferPreparationReadiness = !sourceIsCurrent || !currentFreeAgent
    ? 'STALE'
    : !positiveContact
      ? 'CONTACT_NOT_POSITIVE'
      : conflict
        ? 'BLOCKED'
        : payrollAffordability === 'OVER_BUDGET'
          ? 'FINANCIAL_BLOCK'
          : executionResponsibility.status === 'BLOCKED'
            ? 'BLOCKED'
            : executionResponsibility.owner === undefined
              ? 'NO_EXECUTION_OWNER'
              : missingInformation.length > 0
                ? 'MORE_INFORMATION_REQUIRED'
                : 'READY_TO_SUBMIT_OFFER'

  return Object.freeze({
    id: `formal-offer-preparation:${offer.sourceProposalId}`,
    teamId: offer.teamId,
    ...(playerId === undefined ? {} : { playerId }),
    ...(negotiationId === undefined ? {} : { negotiationId }),
    ...(positiveContact ? { currentContactResponse: contact.contactResponse!.outcome } : {}),
    ...(salaryExpectation === undefined ? {} : { salaryExpectation }),
    ...(salaryProposal === undefined ? {} : { salaryProposal }),
    salaryAuthority: salaryProposal === undefined ? 'UNKNOWN' : salaryProposal.policy,
    ...(termEvidence === undefined ? {} : { expectedTermYears: termEvidence }),
    ...(termProposalYears === undefined ? {} : { termProposalYears }),
    termAuthority: termProposalYears === undefined ? 'UNKNOWN' : 'MATCH_KNOWN_EXPECTED_YEARS',
    ...(offer.proposedRole === undefined ? {} : { roleProposal: offer.proposedRole }),
    roleStatus: offer.proposedRole === undefined ? 'NOT_YET_PROPOSED' : 'PROPOSED',
    roleAuthority: offer.proposedRole === undefined ? 'NOT_REQUIRED_AT_OPEN' : 'UNKNOWN',
    ...(offer.agentId === undefined ? {} : { agentId: offer.agentId }),
    ...(offer.agentFee === undefined ? {} : { agentFeeProposal: offer.agentFee }),
    agentFeeStatus: offer.agentFee === undefined ? 'NOT_YET_PROPOSED' : 'PROPOSED',
    agentFeeAuthority: offer.agentFee === undefined ? 'NOT_REQUIRED_AT_OPEN' : 'UNKNOWN',
    payrollAffordability,
    executionResponsibility,
    governanceAuthority: 'NOT_REQUIRED',
    signingGovernanceDecisionType: 'PLAYER_CONTRACT_SIGNING',
    ...(offer.financeV2Context === undefined ? {} : { financeV2Context: offer.financeV2Context }),
    readiness,
    missingInformation: Object.freeze(missingInformation),
    deferredInformation: Object.freeze([
      ...(offer.proposedRole === undefined ? ['ROLE_PROPOSAL_DEFERRED_UNTIL_SUPPORTED_OR_AGREED'] : []),
      ...(offer.agentFee === undefined ? ['AGENT_FEE_DEFERRED_UNTIL_EXPLICITLY_REVEALED'] : []),
      'PLAYER_CONTRACT_SIGNING_REQUIRES_SEPARATE_GOVERNANCE_AUTHORITY',
    ]),
    blockers: Object.freeze(blockers),
    reasons: Object.freeze([
      ...(salaryProposal === undefined ? [] : ['CLUB_POLICY_MATCHES_KNOWN_EXPECTED_SALARY']),
      ...(termProposalYears === undefined ? [] : ['CLUB_POLICY_MATCHES_KNOWN_EXPECTED_YEARS']),
      ...(positiveContact ? ['CURRENT_CONTACT_IS_OPEN_TO_TALKS'] : []),
      'FIRST_FORMAL_OFFER_IS_NONBINDING_AND_DOES_NOT_CREATE_A_CONTRACT',
      'PREPARATION_IS_DERIVED_AND_DOES_NOT_SUBMIT_AN_OFFER',
    ]),
  })
}
