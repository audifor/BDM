import type { AgentId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { ResponsibilityMode } from '@/domain/responsibility'
import { validateResponsibilityAssignment } from '@/domain/responsibility'
import type { GameWorld } from '@/domain/world'
import { canTeamAffordAdditionalSalary, getResponsibility, getStaffAssignment, getStaffPerson, isPlayerFreeAgent } from '@/domain/world'
import type { AcquisitionProposalIntelligence } from './AcquisitionProposalIntelligence'
import type { Affordability, MarketSignalEvidence } from './MarketCandidateFeasibility'

export type NegotiationOpeningReadiness =
  | 'READY_TO_OPEN_NEGOTIATION'
  | 'MORE_INFORMATION_REQUIRED'
  | 'AUTHORITY_REVIEW_REQUIRED'
  | 'FINANCIAL_BLOCK'
  | 'UNSUPPORTED'
  | 'NEGOTIATION_ALREADY_EXISTS'
  | 'NEGOTIATION_ID_COLLISION'

export type OfferIntelligenceOutcome = 'FREE_AGENT_OFFER' | 'TRADE_ENQUIRY_ONLY' | 'NO_ACTIONABLE_PROPOSAL'
export type PayrollAffordability = 'AFFORDABLE' | 'OVER_BUDGET' | 'UNKNOWN'
export type OpeningAuthority = 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'BLOCKED' | 'UNKNOWN'
export interface NegotiationOpeningReadinessAssessment {
  readonly readiness: NegotiationOpeningReadiness
  readonly missingInformation: readonly string[]
}

export interface TransactionResponsibilityResolution {
  readonly kind: 'recommendSignings'
  readonly mode?: ResponsibilityMode
  readonly status: 'RESOLVED_HOLDER' | 'USER_CONTROLLED' | 'ORGANIZATIONAL' | 'UNKNOWN'
  readonly holder?: {
    readonly staffId: StaffPersonId
    readonly name: string
    readonly role: string
  }
  /** Responsibility for recommendation does not itself grant negotiation-opening permission. */
  readonly openingAuthority: OpeningAuthority
}

export interface FreeAgentOfferIntelligence {
  /** Stable derived ID, not persisted. */
  readonly id: string
  readonly outcome: OfferIntelligenceOutcome
  readonly readiness: NegotiationOpeningReadiness
  readonly teamId: TeamId
  readonly needId?: string
  readonly sourceProposalId: string
  readonly playerId?: PlayerId
  readonly playerName?: string
  /** Exact BS10C club-known salary signal; no salary is generated here. */
  readonly preparedSalary?: MarketSignalEvidence
  /** Expected years remain an observation, not a selected offer term. */
  readonly expectedTermYears?: MarketSignalEvidence
  readonly proposedTermYears?: number
  readonly proposedRole?: 'STAR' | 'STARTER' | 'ROTATION' | 'DEPTH'
  readonly roleAuthority: 'UNKNOWN'
  readonly agentId?: AgentId
  readonly agentFee?: number
  readonly agentFeeAuthority: 'UNKNOWN'
  readonly payrollAffordability: PayrollAffordability
  readonly bs10bAffordability?: Affordability
  readonly financeV2Context?: 'HEALTHY' | 'CONSTRAINED' | 'STRESSED' | 'UNKNOWN'
  readonly playerInterest?: MarketSignalEvidence
  readonly transactionResponsibility: TransactionResponsibilityResolution
  /** No signing or contract-opening decision type is mapped in Governance V2. */
  readonly governanceAuthority: OpeningAuthority
  readonly existingNegotiation?: {
    readonly id: string
    readonly status: 'OPEN' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED'
    readonly kind: 'ACTIVE' | 'ID_COLLISION'
  }
  readonly missingInformation: readonly string[]
  readonly blockers: readonly string[]
  readonly reasons: readonly string[]
}

/**
 * Resolve the strongest safe status for the future MarketEngine.openNegotiation call.
 * The caller supplies current, canonical facts; unknown required values and authorities stop readiness.
 */
export function assessNegotiationOpeningReadiness(input: {
  readonly isCurrentFreeAgent: boolean
  readonly payrollAffordability: PayrollAffordability
  readonly requiredFields: {
    readonly salary: boolean
    readonly termYears: boolean
    readonly role: boolean
    readonly agentFee: boolean
  }
  readonly existingNegotiation: 'NONE' | 'ACTIVE' | 'ID_COLLISION'
  readonly governanceAuthority: OpeningAuthority
  readonly responsibilityOpeningAuthority: OpeningAuthority
}): NegotiationOpeningReadinessAssessment {
  const missingInformation = [
    ...(!input.requiredFields.salary ? ['EXPECTED_SALARY_UNKNOWN'] : []),
    ...(!input.requiredFields.termYears ? ['SELECTED_NEGOTIATION_TERM_AUTHORITY_UNKNOWN'] : []),
    ...(!input.requiredFields.role ? ['INCOMING_CONTRACT_ROLE_AUTHORITY_UNKNOWN'] : []),
    ...(!input.requiredFields.agentFee ? ['OPENING_AGENT_FEE_AUTHORITY_UNKNOWN'] : []),
  ]
  const readiness: NegotiationOpeningReadiness = !input.isCurrentFreeAgent
    ? 'UNSUPPORTED'
    : input.existingNegotiation === 'ACTIVE'
      ? 'NEGOTIATION_ALREADY_EXISTS'
      : input.existingNegotiation === 'ID_COLLISION'
        ? 'NEGOTIATION_ID_COLLISION'
        : input.payrollAffordability === 'OVER_BUDGET'
          ? 'FINANCIAL_BLOCK'
          : missingInformation.length > 0
            ? 'MORE_INFORMATION_REQUIRED'
            : input.governanceAuthority === 'BLOCKED' || input.responsibilityOpeningAuthority === 'BLOCKED'
              ? 'UNSUPPORTED'
              : input.governanceAuthority !== 'AUTHORIZED' || input.responsibilityOpeningAuthority !== 'AUTHORIZED'
                ? 'AUTHORITY_REVIEW_REQUIRED'
                : 'READY_TO_OPEN_NEGOTIATION'
  return { readiness, missingInformation: Object.freeze(missingInformation) }
}

/** Consumes exactly one current BS10C result. It never opens a negotiation or mutates GameWorld. */
export function assessFreeAgentOfferIntelligence(world: GameWorld, proposal: AcquisitionProposalIntelligence): FreeAgentOfferIntelligence {
  const team = world.teams[proposal.teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${proposal.teamId}`)

  if (proposal.proposalType === 'TRADE_ENQUIRY') {
    return nonFreeAgentOutcome(proposal, 'TRADE_ENQUIRY_ONLY', 'TRADE_PACKAGE_INTELLIGENCE_REQUIRED', 'UNSUPPORTED')
  }
  if (proposal.proposalType !== 'FREE_AGENT_APPROACH' || proposal.preferredCandidate === undefined) {
    return nonFreeAgentOutcome(proposal, 'NO_ACTIONABLE_PROPOSAL', proposal.noProposalReason ?? 'NO_BS10C_FREE_AGENT_APPROACH', 'UNSUPPORTED')
  }

  const candidate = proposal.preferredCandidate
  const playerId = candidate.playerId
  const organizationId = team.organizationId
  const representation = world.playerRepresentations.find((item) => item.playerId === playerId && item.startedOn <= world.currentDate)
  const preparedSalary = proposal.knownExpectedSalary
  const expectedTermYears = proposal.expectedTermYears
  const payrollAffordability: PayrollAffordability = preparedSalary === undefined
    ? 'UNKNOWN'
    : canTeamAffordAdditionalSalary(world, proposal.teamId, preparedSalary.value) ? 'AFFORDABLE' : 'OVER_BUDGET'
  const negotiationId = `negotiation:${organizationId}:${playerId}:${world.currentDate}`
  const activeNegotiation = Object.values(world.negotiationsById).find((item) => item.organizationId === organizationId
    && item.playerId === playerId
    && (item.status === 'OPEN' || item.status === 'COUNTERED'))
  const idCollision = activeNegotiation === undefined ? world.negotiationsById[negotiationId] : undefined
  const existingNegotiation = activeNegotiation === undefined
    ? idCollision === undefined ? 'NONE' as const : 'ID_COLLISION' as const
    : 'ACTIVE' as const
  const currentlyFreeAgent = isPlayerFreeAgent(world, playerId)
  const transactionResponsibility = resolveTransactionResponsibility(world, proposal.teamId)
  const readinessAssessment = assessNegotiationOpeningReadiness({
    isCurrentFreeAgent: currentlyFreeAgent,
    payrollAffordability,
    requiredFields: {
      salary: preparedSalary !== undefined,
      termYears: false,
      role: false,
      agentFee: false,
    },
    existingNegotiation,
    governanceAuthority: 'UNKNOWN',
    responsibilityOpeningAuthority: transactionResponsibility.openingAuthority,
  })
  const missingInformation = [
    ...readinessAssessment.missingInformation,
    ...(expectedTermYears === undefined ? ['EXPECTED_TERM_KNOWLEDGE_UNKNOWN'] : []),
  ]
  const blockers = [
    ...(currentlyFreeAgent ? [] : ['CANDIDATE_NO_LONGER_FREE_AGENT']),
    ...(payrollAffordability === 'OVER_BUDGET' ? ['CURRENT_PLAYER_PAYROLL_EXCEEDS_KNOWN_SALARY_BUDGET'] : []),
    ...(transactionResponsibility.status === 'UNKNOWN' ? ['TRANSACTION_RESPONSIBILITY_UNKNOWN'] : []),
    'TRANSACTION_GOVERNANCE_AUTHORITY_UNKNOWN',
    'NEGOTIATION_OPENING_NOT_REQUESTED_OR_CREATED',
  ]
  return Object.freeze({
    id: `free-agent-offer:${proposal.id}`,
    outcome: 'FREE_AGENT_OFFER',
    readiness: readinessAssessment.readiness,
    teamId: proposal.teamId,
    ...(proposal.needId === undefined ? {} : { needId: proposal.needId }),
    sourceProposalId: proposal.id,
    playerId,
    playerName: candidate.name,
    ...(preparedSalary === undefined ? {} : { preparedSalary }),
    ...(expectedTermYears === undefined ? {} : { expectedTermYears }),
    roleAuthority: 'UNKNOWN',
    ...(representation === undefined ? {} : { agentId: representation.agentId }),
    agentFeeAuthority: 'UNKNOWN',
    payrollAffordability,
    bs10bAffordability: candidate.feasibility.affordability,
    financeV2Context: candidate.feasibility.financeV2Context,
    ...(proposal.knownPlayerInterest === undefined ? {} : { playerInterest: proposal.knownPlayerInterest }),
    transactionResponsibility,
    governanceAuthority: 'UNKNOWN',
    ...(activeNegotiation === undefined && idCollision === undefined ? {} : { existingNegotiation: {
      id: (activeNegotiation ?? idCollision)!.id,
      status: (activeNegotiation ?? idCollision)!.status,
      kind: activeNegotiation === undefined ? 'ID_COLLISION' as const : 'ACTIVE' as const,
    } }),
    missingInformation: Object.freeze(missingInformation),
    blockers: Object.freeze(blockers),
    reasons: Object.freeze([
      'BS10C_PREFERRED_FREE_AGENT_CONSUMED',
      'EXPECTED_SALARY_CARRIED_WITHOUT_REGENERATION',
      ...(expectedTermYears === undefined ? ['EXPECTED_TERM_UNKNOWN'] : ['EXPECTED_TERM_NOT_SELECTED_AS_OFFER_TERM']),
      'NO_NEGOTIATION_OR_TRANSACTION_CREATED',
    ]),
  })
}

function nonFreeAgentOutcome(
  proposal: AcquisitionProposalIntelligence,
  outcome: Exclude<OfferIntelligenceOutcome, 'FREE_AGENT_OFFER'>,
  reason: string,
  readiness: NegotiationOpeningReadiness,
): FreeAgentOfferIntelligence {
  return Object.freeze({
    id: `free-agent-offer:${proposal.id}`,
    outcome,
    readiness,
    teamId: proposal.teamId,
    ...(proposal.needId === undefined ? {} : { needId: proposal.needId }),
    sourceProposalId: proposal.id,
    ...(proposal.preferredCandidate === undefined ? {} : { playerId: proposal.preferredCandidate.playerId, playerName: proposal.preferredCandidate.name }),
    roleAuthority: 'UNKNOWN',
    agentFeeAuthority: 'UNKNOWN',
    payrollAffordability: 'UNKNOWN',
    transactionResponsibility: { kind: 'recommendSignings' as const, status: 'UNKNOWN' as const, openingAuthority: 'UNKNOWN' as const },
    governanceAuthority: 'UNKNOWN',
    missingInformation: Object.freeze([]),
    blockers: Object.freeze([reason]),
    reasons: Object.freeze(['BS10D_A_DOES_NOT_PROGRESS_TRADE_OR_NO_ACTION_PROPOSALS']),
  })
}

function resolveTransactionResponsibility(world: GameWorld, teamId: TeamId): TransactionResponsibilityResolution {
  const responsibility = getResponsibility(world, teamId, 'recommendSignings')
  if (responsibility === undefined) return { kind: 'recommendSignings', status: 'UNKNOWN', openingAuthority: 'UNKNOWN' }
  if (responsibility.mode === 'userControlled') return { kind: 'recommendSignings', mode: responsibility.mode, status: 'USER_CONTROLLED', openingAuthority: 'UNKNOWN' }
  if (responsibility.mode === 'organizational') return { kind: 'recommendSignings', mode: responsibility.mode, status: 'ORGANIZATIONAL', openingAuthority: 'UNKNOWN' }
  const holderStaffId = responsibility.holderStaffId
  const holder = holderStaffId === undefined ? undefined : getStaffPerson(world, holderStaffId)
  const assignment = holderStaffId === undefined ? undefined : getStaffAssignment(world, holderStaffId)
  if (holder === undefined || assignment === undefined || assignment.teamId !== teamId || assignment.assignedOn > world.currentDate) {
    return { kind: 'recommendSignings', mode: responsibility.mode, status: 'UNKNOWN', openingAuthority: 'UNKNOWN' }
  }
  const validation = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, assignment.role, holder)
  if (!validation.ok) return { kind: 'recommendSignings', mode: responsibility.mode, status: 'UNKNOWN', openingAuthority: 'UNKNOWN' }
  return {
    kind: 'recommendSignings',
    mode: responsibility.mode,
    status: 'RESOLVED_HOLDER',
    holder: { staffId: holder.id, name: `${holder.identity.firstName} ${holder.identity.lastName}`, role: assignment.role },
    openingAuthority: 'UNKNOWN',
  }
}
