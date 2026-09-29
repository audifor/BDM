import type { GameWorld } from '@/domain/world'
import type { MarketKnowledge } from '@/domain/market'
import type { TeamId } from '@/domain/ids'
import type { ExecutionReadiness } from '@/engine/gmDecisionContext'
import type { GMWorkflowDecision, GMWorkflowResponsibleSystem } from '@/engine/gmPlanning'
import type { MarketCandidateFeasibilityAssessment, MarketCandidateFeasibility, MarketSignalEvidence } from './MarketCandidateFeasibility'
import type { MarketCandidateIntelligence } from './MarketCandidateIntelligence'

export type AcquisitionProposalType = 'FREE_AGENT_APPROACH' | 'TRADE_ENQUIRY' | 'NO_ACTIONABLE_PROPOSAL'
export type AcquisitionProposalReadiness = 'READY_FOR_NEGOTIATION' | 'MORE_INFORMATION_REQUIRED' | 'FINANCIAL_BLOCK' | 'AUTHORITY_REVIEW_REQUIRED' | 'UNSUPPORTED' | 'NO_ACTIONABLE_PROPOSAL'
export type TransactionAuthority = 'AUTHORITY_UNKNOWN'

export type FeasibleMarketCandidate = MarketCandidateIntelligence & { readonly feasibility: MarketCandidateFeasibility }

export interface AcquisitionProposalAlternative {
  readonly playerId: FeasibleMarketCandidate['playerId']
  readonly name: string
  readonly candidateRank: number
  readonly proposalType: Exclude<AcquisitionProposalType, 'NO_ACTIONABLE_PROPOSAL'>
  readonly route: MarketCandidateFeasibility['route']
  readonly approachability: MarketCandidateFeasibility['approachability']
  readonly needFit: MarketCandidateIntelligence['needFit']
}

export interface AcquisitionProposalIntelligence {
  /** Stable derived identifier; this is not a persisted entity ID. */
  readonly id: string
  readonly teamId: TeamId
  readonly planId?: string
  readonly needId?: string
  readonly proposalType: AcquisitionProposalType
  readonly proposalReadiness: AcquisitionProposalReadiness
  readonly preferredCandidate?: FeasibleMarketCandidate
  readonly candidateRank?: number
  readonly route?: MarketCandidateFeasibility['route']
  readonly planExecutionReadiness?: ExecutionReadiness
  readonly governanceReadiness: TransactionAuthority
  readonly responsibleSystem: GMWorkflowResponsibleSystem
  readonly responsibleRole: 'UNKNOWN'
  readonly knownExpectedSalary?: MarketSignalEvidence
  readonly knownPlayerInterest?: MarketSignalEvidence
  readonly knownSellerWillingness?: MarketSignalEvidence
  /** Club-known expected term signal; it is not a selected offer term. */
  readonly expectedTermYears?: MarketSignalEvidence
  readonly proposedContractTerm: 'NOT_SELECTED' | 'NOT_APPLICABLE'
  readonly affordability: MarketCandidateFeasibility['affordability'] | 'NOT_APPLICABLE'
  readonly perceivedValueStatus: 'UNKNOWN' | 'NOT_APPLICABLE'
  readonly packageStatus: 'NOT_CONSTRUCTED' | 'NOT_APPLICABLE'
  readonly missingInformation: readonly string[]
  readonly blockers: readonly string[]
  readonly reasons: readonly string[]
  readonly alternatives: readonly AcquisitionProposalAlternative[]
  readonly noProposalReason?: string
}

/** Selects from the exact ordered BS10B assessment. It neither rediscovers candidates nor mutates the world. */
export function selectAcquisitionProposal(
  world: GameWorld,
  assessment: MarketCandidateFeasibilityAssessment,
  workflow?: GMWorkflowDecision,
): AcquisitionProposalIntelligence {
  const supported = assessment.candidates.filter(isProposalEligible)
  const selected = supported[0]
  if (selected !== undefined) {
    const candidateRank = assessment.candidates.indexOf(selected) + 1
    const proposalType = proposalTypeFor(selected)
    const expectedTermYears = proposalType === 'FREE_AGENT_APPROACH'
      ? knownMarketExpectedYears(world.marketKnowledge, world.teams[assessment.teamId]!.organizationId, selected)
      : undefined
    const missingInformation = proposalType === 'FREE_AGENT_APPROACH'
      ? freeAgentMissingInformation(selected, expectedTermYears)
      : tradeEnquiryMissingInformation(selected)
    const proposalReadiness: AcquisitionProposalReadiness = missingInformation.length > 0
      ? 'MORE_INFORMATION_REQUIRED'
      : 'AUTHORITY_REVIEW_REQUIRED'
    const route = selected.feasibility.route
    return Object.freeze({
      id: proposalId(assessment.teamId, workflow?.planId, selected.playerId, route),
      teamId: assessment.teamId,
      ...(workflow === undefined ? {} : { planId: workflow.planId, needId: workflow.needId }),
      proposalType,
      proposalReadiness,
      preferredCandidate: selected,
      candidateRank,
      route,
      ...(workflow?.currentExecutionReadiness === undefined ? {} : { planExecutionReadiness: workflow.currentExecutionReadiness }),
      governanceReadiness: 'AUTHORITY_UNKNOWN',
      responsibleSystem: workflow?.responsibleSystem ?? 'UNRESOLVED',
      responsibleRole: 'UNKNOWN',
      ...(selected.feasibility.expectedSalary === undefined ? {} : { knownExpectedSalary: selected.feasibility.expectedSalary }),
      ...(selected.feasibility.playerInterest === undefined ? {} : { knownPlayerInterest: selected.feasibility.playerInterest }),
      ...(selected.feasibility.sellerWillingness === undefined ? {} : { knownSellerWillingness: selected.feasibility.sellerWillingness }),
      ...(expectedTermYears === undefined ? {} : { expectedTermYears }),
      proposedContractTerm: proposalType === 'FREE_AGENT_APPROACH' ? 'NOT_SELECTED' : 'NOT_APPLICABLE',
      affordability: selected.feasibility.affordability,
      perceivedValueStatus: proposalType === 'TRADE_ENQUIRY' ? 'UNKNOWN' : 'NOT_APPLICABLE',
      packageStatus: proposalType === 'TRADE_ENQUIRY' ? 'NOT_CONSTRUCTED' : 'NOT_APPLICABLE',
      missingInformation: Object.freeze(missingInformation),
      blockers: Object.freeze([]),
      reasons: Object.freeze(proposalReasons(selected, proposalType)),
      alternatives: Object.freeze(supported.slice(1, 3).map((candidate, index) => alternative(candidate, candidateRank + index + 1))),
    })
  }

  const unknownRouteCandidate = assessment.candidates.find((candidate) => candidate.feasibility.routeSupport === 'UNKNOWN' && candidate.feasibility.blockers.length === 0)
  if (unknownRouteCandidate !== undefined) {
    return noActionableProposal({
      assessment,
      workflow,
      candidate: unknownRouteCandidate,
      reason: 'ACQUISITION_ROUTE_UNKNOWN',
      readiness: 'MORE_INFORMATION_REQUIRED',
      missingInformation: ['ACQUISITION_ROUTE_SUPPORT_UNKNOWN'],
      blockers: [],
      reasons: ['CANDIDATE_RETAINED_BUT_NO_ROUTE_CAN_YET_FORM_AN_APPROACH'],
    })
  }

  const blockers = assessment.candidates.flatMap((candidate) => candidate.feasibility.blockers.map((blocker) => `${candidate.playerId}:${blocker}`))
  const unsupportedTransferOnly = assessment.candidates.length > 0 && assessment.candidates.every((candidate) => candidate.feasibility.route === 'TRANSFER' && candidate.feasibility.routeSupport === 'UNSUPPORTED')
  const financialBlockOnly = assessment.candidates.length > 0
    && blockers.length > 0
    && assessment.candidates.every((candidate) => candidate.feasibility.blockers.length > 0
      && candidate.feasibility.blockers.every((blocker) => blocker === 'KNOWN_EXPECTED_SALARY_EXCEEDS_PLAYER_BUDGET'))
  const noProposalReason = assessment.candidates.length === 0
    ? 'NO_DISCOVERABLE_CANDIDATES'
    : unsupportedTransferOnly
      ? 'NO_CANONICAL_TRANSFER_MODEL'
      : blockers.length > 0
        ? 'ALL_CANDIDATES_BLOCKED'
        : 'NO_SUPPORTED_ACTIONABLE_ROUTE'
  return noActionableProposal({
    assessment,
    workflow,
    reason: noProposalReason,
    readiness: unsupportedTransferOnly ? 'UNSUPPORTED' : financialBlockOnly ? 'FINANCIAL_BLOCK' : 'NO_ACTIONABLE_PROPOSAL',
    missingInformation: [],
    blockers,
    reasons: assessment.candidates.length === 0 ? ['CURRENT_ROUTE_HAS_NO_DISCOVERABLE_TARGETS'] : ['NO_ELIGIBLE_SUPPORTED_CANDIDATE'],
  })
}

export function createNoActionableProposal(input: {
  readonly teamId: TeamId
  readonly planId?: string
  readonly needId?: string
  readonly responsibleSystem?: GMWorkflowResponsibleSystem
  readonly planExecutionReadiness?: ExecutionReadiness
  readonly reason: string
}): AcquisitionProposalIntelligence {
  return Object.freeze({
    id: proposalId(input.teamId, input.planId, undefined, 'NO_ACTIONABLE_PROPOSAL'),
    teamId: input.teamId,
    ...(input.planId === undefined ? {} : { planId: input.planId }),
    ...(input.needId === undefined ? {} : { needId: input.needId }),
    proposalType: 'NO_ACTIONABLE_PROPOSAL',
    proposalReadiness: input.reason === 'NO_CANONICAL_TRANSFER_MODEL' ? 'UNSUPPORTED' : 'NO_ACTIONABLE_PROPOSAL',
    ...(input.planExecutionReadiness === undefined ? {} : { planExecutionReadiness: input.planExecutionReadiness }),
    governanceReadiness: 'AUTHORITY_UNKNOWN',
    responsibleSystem: input.responsibleSystem ?? 'UNRESOLVED',
    responsibleRole: 'UNKNOWN',
    proposedContractTerm: 'NOT_APPLICABLE',
    affordability: 'NOT_APPLICABLE',
    perceivedValueStatus: 'NOT_APPLICABLE',
    packageStatus: 'NOT_APPLICABLE',
    missingInformation: Object.freeze([]),
    blockers: Object.freeze([]),
    reasons: Object.freeze([]),
    alternatives: Object.freeze([]),
    noProposalReason: input.reason,
  })
}

function noActionableProposal(input: {
  readonly assessment: MarketCandidateFeasibilityAssessment
  readonly workflow?: GMWorkflowDecision
  readonly candidate?: FeasibleMarketCandidate
  readonly reason: string
  readonly readiness: AcquisitionProposalReadiness
  readonly missingInformation: readonly string[]
  readonly blockers: readonly string[]
  readonly reasons: readonly string[]
}): AcquisitionProposalIntelligence {
  const { assessment, workflow, candidate } = input
  return Object.freeze({
    id: proposalId(assessment.teamId, workflow?.planId, candidate?.playerId, 'NO_ACTIONABLE_PROPOSAL'),
    teamId: assessment.teamId,
    ...(workflow === undefined ? {} : { planId: workflow.planId, needId: workflow.needId }),
    proposalType: 'NO_ACTIONABLE_PROPOSAL',
    proposalReadiness: input.readiness,
    ...(candidate === undefined ? {} : { preferredCandidate: candidate, candidateRank: assessment.candidates.indexOf(candidate) + 1 }),
    ...(candidate === undefined ? {} : { route: candidate.feasibility.route }),
    ...(workflow?.currentExecutionReadiness === undefined ? {} : { planExecutionReadiness: workflow.currentExecutionReadiness }),
    governanceReadiness: 'AUTHORITY_UNKNOWN',
    responsibleSystem: workflow?.responsibleSystem ?? 'UNRESOLVED',
    responsibleRole: 'UNKNOWN',
    proposedContractTerm: 'NOT_APPLICABLE',
    affordability: candidate?.feasibility.affordability ?? 'NOT_APPLICABLE',
    perceivedValueStatus: 'NOT_APPLICABLE',
    packageStatus: 'NOT_APPLICABLE',
    missingInformation: Object.freeze([...input.missingInformation]),
    blockers: Object.freeze([...input.blockers]),
    reasons: Object.freeze([...input.reasons]),
    alternatives: Object.freeze([]),
    noProposalReason: input.reason,
  })
}

function isProposalEligible(candidate: FeasibleMarketCandidate): boolean {
  return candidate.feasibility.routeSupport === 'SUPPORTED'
    && candidate.feasibility.blockers.length === 0
    && (candidate.feasibility.route === 'FREE_AGENT_SIGNING' || candidate.feasibility.route === 'TRADE')
}

function proposalTypeFor(candidate: FeasibleMarketCandidate): Exclude<AcquisitionProposalType, 'NO_ACTIONABLE_PROPOSAL'> {
  return candidate.feasibility.route === 'FREE_AGENT_SIGNING' ? 'FREE_AGENT_APPROACH' : 'TRADE_ENQUIRY'
}

function freeAgentMissingInformation(candidate: FeasibleMarketCandidate, expectedTermYears: MarketSignalEvidence | undefined): string[] {
  return [
    ...(candidate.feasibility.expectedSalary === undefined ? ['EXPECTED_SALARY_UNKNOWN'] : []),
    ...(candidate.feasibility.affordability === 'UNKNOWN' ? ['AFFORDABILITY_UNKNOWN'] : []),
    ...(expectedTermYears === undefined ? ['EXPECTED_TERM_KNOWLEDGE_UNKNOWN'] : []),
    ...(candidate.feasibility.playerInterest === undefined ? ['PLAYER_INTEREST_UNKNOWN'] : []),
    ...(candidate.missingKnowledge.includes('medical confidence') ? ['MEDICAL_CONFIDENCE_UNKNOWN'] : []),
  ]
}

function tradeEnquiryMissingInformation(candidate: FeasibleMarketCandidate): string[] {
  return [
    ...(candidate.feasibility.sellerWillingness === undefined ? ['SELLER_WILLINGNESS_UNKNOWN'] : []),
    'TRADE_PACKAGE_NOT_CONSTRUCTED',
    'PERCEIVED_TRADE_VALUE_UNKNOWN',
  ]
}

function proposalReasons(candidate: FeasibleMarketCandidate, type: Exclude<AcquisitionProposalType, 'NO_ACTIONABLE_PROPOSAL'>): string[] {
  return [
    `NEED_FIT_${candidate.needFit}`,
    `APPROACHABILITY_${candidate.feasibility.approachability}`,
    `ROUTE_${candidate.feasibility.route}`,
    ...(type === 'TRADE_ENQUIRY' ? ['NO_FAIR_PACKAGE_AUTHORITY_EXISTS'] : ['NO_OFFER_OR_NEGOTIATION_CREATED']),
  ]
}

function alternative(candidate: FeasibleMarketCandidate, candidateRank: number): AcquisitionProposalAlternative {
  return Object.freeze({
    playerId: candidate.playerId,
    name: candidate.name,
    candidateRank,
    proposalType: proposalTypeFor(candidate),
    route: candidate.feasibility.route,
    approachability: candidate.feasibility.approachability,
    needFit: candidate.needFit,
  })
}

function knownMarketExpectedYears(
  records: readonly MarketKnowledge[],
  organizationId: string,
  candidate: FeasibleMarketCandidate,
): MarketSignalEvidence | undefined {
  const matching = records.filter((record) => record.organizationId === organizationId && record.playerId === candidate.playerId)
  matching.sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)
    || b.confidence - a.confidence
    || a.source.localeCompare(b.source)
    || (a.availability ?? 'UNKNOWN').localeCompare(b.availability ?? 'UNKNOWN'))
  const knowledge = matching[0]
  const years = knowledge?.expectedYears
  return knowledge !== undefined && Number.isInteger(years) && (years ?? 0) > 0
    ? Object.freeze({ value: years!, source: knowledge.source, confidence: knowledge.confidence, assessedAt: knowledge.assessedAt })
    : undefined
}

function proposalId(teamId: TeamId, planId: string | undefined, playerId: string | undefined, kind: string): string {
  return `acquisition-proposal:${teamId}:${planId ?? 'no-plan'}:${playerId ?? 'none'}:${kind}`
}
