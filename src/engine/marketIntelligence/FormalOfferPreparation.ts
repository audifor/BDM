import { isActiveNegotiation, negotiationIdForOpening, negotiationOpeningKeyString } from '@/domain/market'
import type { MarketSignalEvidence } from './MarketCandidateFeasibility'
import type { FreeAgentOfferIntelligence } from './FreeAgentOfferIntelligence'
import { validateResponsibilityAssignment } from '@/domain/responsibility'
import type { NegotiationRole } from '@/domain/market'
import { canTeamAffordAdditionalSalary, getResponsibility, getStaffAssignment, getStaffPerson, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import type { StaffPersonId } from '@/domain/ids'

export type FormalOfferPreparationReadiness =
  | 'READY_TO_SUBMIT_OFFER'
  | 'MORE_INFORMATION_REQUIRED'
  | 'NO_EXECUTION_OWNER'
  | 'AUTHORITY_REVIEW_REQUIRED'
  | 'FINANCIAL_BLOCK'
  | 'STALE'
  | 'CONTACT_NOT_POSITIVE'
  | 'BLOCKED'

export type FormalOfferPreparationOwner =
  | { readonly kind: 'USER' }
  | { readonly kind: 'STAFF'; readonly staffPersonId: StaffPersonId; readonly name: string; readonly role: string }

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
  readonly promisedRole?: NegotiationRole
  readonly roleAuthority: 'UNKNOWN'
  readonly agentId?: FreeAgentOfferIntelligence['agentId']
  readonly agentFeeProposal?: number
  readonly agentFeeAuthority: 'UNKNOWN'
  readonly payrollAffordability: 'AFFORDABLE' | 'OVER_BUDGET' | 'UNKNOWN'
  readonly executionResponsibility: {
    readonly kind: 'submitPlayerContractOffer'
    readonly status: 'USER_AUTHORITY' | 'RESOLVED_HOLDER' | 'NO_EXECUTION_OWNER' | 'BLOCKED'
    readonly owner?: FormalOfferPreparationOwner
    readonly reasons: readonly string[]
    readonly blockers: readonly string[]
  }
  readonly governanceAuthority: 'UNKNOWN'
  readonly financeV2Context?: FreeAgentOfferIntelligence['financeV2Context']
  readonly readiness: FormalOfferPreparationReadiness
  readonly missingInformation: readonly string[]
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
    && offer.sourcePlanId !== undefined
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
  const salaryProposal = hasSalary ? { amount: salaryExpectation!.value, policy: 'MATCH_KNOWN_EXPECTATION' as const } : undefined
  const termEvidence = offer.expectedTermYears
  const hasTerm = termEvidence !== undefined && Number.isSafeInteger(termEvidence.value) && termEvidence.value > 0
  const termProposalYears = hasTerm ? termEvidence!.value : undefined
  const payrollAffordability: FormalOfferPreparation['payrollAffordability'] = salaryProposal === undefined
    ? 'UNKNOWN'
    : canTeamAffordAdditionalSalary(world, offer.teamId, salaryProposal.amount) ? 'AFFORDABLE' : 'OVER_BUDGET'
  const executionResponsibility = resolveOfferExecutionResponsibility(world, offer.teamId)

  const missingInformation = [
    ...(salaryProposal === undefined ? [salaryExpectation === undefined ? 'CLUB_KNOWN_EXPECTED_SALARY_UNKNOWN' : 'CLUB_KNOWN_EXPECTED_SALARY_INVALID'] : []),
    ...(termProposalYears === undefined ? [termEvidence === undefined ? 'CLUB_KNOWN_EXPECTED_TERM_UNKNOWN' : 'CLUB_KNOWN_EXPECTED_TERM_INVALID'] : []),
    'INCOMING_PLAYER_ROLE_AUTHORITY_UNKNOWN',
    'OPENING_AGENT_FEE_AUTHORITY_UNKNOWN',
  ]
  const blockers = [
    ...(!sourceIsCurrent ? ['CURRENT_GM_PLAN_OR_BS10C_PROPOSAL_UNAVAILABLE'] : []),
    ...(currentFreeAgent ? [] : ['PLAYER_NO_LONGER_FREE_AGENT']),
    ...(!positiveContact ? ['CURRENT_CONTACT_RESPONSE_NOT_POSITIVE'] : []),
    ...(conflict ? ['CONFLICTING_ACTIVE_NEGOTIATION'] : []),
    ...(payrollAffordability === 'OVER_BUDGET' ? ['CURRENT_PAYROLL_CANNOT_SUPPORT_PROPOSED_SALARY'] : []),
    ...executionResponsibility.blockers,
    'PLAYER_CONTRACT_GOVERNANCE_AUTHORITY_UNKNOWN',
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
                : 'AUTHORITY_REVIEW_REQUIRED'

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
    roleAuthority: 'UNKNOWN',
    ...(offer.agentId === undefined ? {} : { agentId: offer.agentId }),
    agentFeeAuthority: 'UNKNOWN',
    payrollAffordability,
    executionResponsibility,
    governanceAuthority: 'UNKNOWN',
    ...(offer.financeV2Context === undefined ? {} : { financeV2Context: offer.financeV2Context }),
    readiness,
    missingInformation: Object.freeze(missingInformation),
    blockers: Object.freeze(blockers),
    reasons: Object.freeze([
      ...(salaryProposal === undefined ? [] : ['CLUB_POLICY_MATCHES_KNOWN_EXPECTED_SALARY']),
      ...(termProposalYears === undefined ? [] : ['CLUB_POLICY_MATCHES_KNOWN_EXPECTED_YEARS']),
      ...(positiveContact ? ['CURRENT_CONTACT_IS_OPEN_TO_TALKS'] : []),
      'PREPARATION_IS_DERIVED_AND_DOES_NOT_SUBMIT_AN_OFFER',
    ]),
  })
}

function resolveOfferExecutionResponsibility(world: GameWorld, teamId: FreeAgentOfferIntelligence['teamId']): FormalOfferPreparation['executionResponsibility'] {
  const team = world.teams[teamId]
  if (team?.coachId === world.userCoachId) {
    return { kind: 'submitPlayerContractOffer', status: 'USER_AUTHORITY', owner: { kind: 'USER' }, reasons: ['USER_TEAM_HAS_EXPLICIT_APPLICATION_AUTHORITY'], blockers: [] }
  }
  const responsibility = getResponsibility(world, teamId, 'submitPlayerContractOffer')
  if (responsibility?.mode !== 'delegated' || responsibility.holderStaffId === undefined) {
    return { kind: 'submitPlayerContractOffer', status: 'NO_EXECUTION_OWNER', reasons: [], blockers: ['NO_DELEGATED_FORMAL_OFFER_OWNER'] }
  }
  const holder = getStaffPerson(world, responsibility.holderStaffId)
  const assignment = getStaffAssignment(world, responsibility.holderStaffId)
  if (holder === undefined || assignment === undefined || assignment.teamId !== teamId || assignment.assignedOn > world.currentDate) {
    return { kind: 'submitPlayerContractOffer', status: 'BLOCKED', reasons: [], blockers: ['INVALID_FORMAL_OFFER_OWNER_ASSIGNMENT'] }
  }
  const validation = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, assignment.role, holder)
  if (!validation.ok) return { kind: 'submitPlayerContractOffer', status: 'BLOCKED', reasons: [], blockers: [`INVALID_FORMAL_OFFER_OWNER_ASSIGNMENT:${validation.reason ?? 'unknown'}`] }
  return {
    kind: 'submitPlayerContractOffer',
    status: 'RESOLVED_HOLDER',
    owner: { kind: 'STAFF', staffPersonId: holder.id, name: `${holder.identity.firstName} ${holder.identity.lastName}`, role: assignment.role },
    reasons: ['DELEGATED_FORMAL_OFFER_OWNER_RESOLVED'],
    blockers: [],
  }
}
