import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import type { GameWorld } from '@/domain/world'
import { canTeamAffordAdditionalSalary, getEcosystemForTeam, getTeamFinancialSnapshot, updateGameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { ClubNeed } from '@/engine/clubNeeds'
import { assessMarketCandidatesForNeed } from './MarketCandidateIntelligence'
import { assessMarketCandidateFeasibility } from './MarketCandidateFeasibility'
import { selectAcquisitionProposal } from './AcquisitionProposalIntelligence'
import { assessFreeAgentOfferIntelligence, assessNegotiationOpeningReadiness } from './FreeAgentOfferIntelligence'

let base: GameWorld
let teamId: TeamId
let playerId: PlayerId
let proposal: ReturnType<typeof selectAcquisitionProposal>

beforeAll(() => {
  const initial = createNewGame()
  const team = Object.values(initial.teams).find((item) => item.coachId !== undefined && item.coachId !== initial.userCoachId)!
  const source = Object.values(initial.teams).find((item) => item.id !== team.id
    && getEcosystemForTeam(initial, item.id)?.kind !== 'ncaaLike'
    && item.rosterPlayerIds.length >= 8)!
  const released = source.rosterPlayerIds.slice(0, 3).reduce((world, id) => releasePlayer(world, source.id, id), initial)
  teamId = team.id
  playerId = source.rosterPlayerIds[0]!
  const organizationId = released.teams[teamId]!.organizationId
  base = updateGameWorld(released, {
    teamFinances: Object.values(released.teamFinancesByTeamId).map((item) => item.teamId === teamId ? { ...item, playerSalaryBudget: Math.max(item.playerSalaryBudget, 100_000_000) } : item),
    marketKnowledge: source.rosterPlayerIds.slice(0, 3).map((candidateId) => ({
      organizationId,
      playerId: candidateId,
      availability: 'OPEN' as const,
      expectedSalary: 650_000,
      expectedYears: 2,
      playerInterest: 61,
      confidence: 75,
      assessedAt: released.currentDate,
      source: 'AGENT' as const,
    })),
  })
  const candidates = assessMarketCandidatesForNeed(base, teamId, makeNeed(), 'CONTEND')
  proposal = selectAcquisitionProposal(base, assessMarketCandidateFeasibility(base, candidates))
  if (proposal.proposalType !== 'FREE_AGENT_APPROACH' || proposal.preferredCandidate?.playerId === undefined) {
    throw new Error('Expected BS10C to produce a free-agent approach fixture')
  }
  playerId = proposal.preferredCandidate.playerId
})

describe('FreeAgentOfferIntelligence', () => {
  it('consumes the exact BS10C player and carries its known salary and interest evidence', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.outcome).toBe('FREE_AGENT_OFFER')
    expect(result.sourceProposalId).toBe(proposal.id)
    expect(result.playerId).toBe(proposal.preferredCandidate?.playerId)
    expect(result.preparedSalary).toMatchObject({ value: 650_000, source: 'AGENT', confidence: 75, assessedAt: base.currentDate })
    expect(result.playerInterest?.value).toBe(61)
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps unknown salary unknown even when other candidate data contains no offer authority', () => {
    const unknownSalary = { ...proposal, knownExpectedSalary: undefined }
    const result = assessFreeAgentOfferIntelligence(base, unknownSalary)
    expect(result.preparedSalary).toBeUndefined()
    expect(result.payrollAffordability).toBe('UNKNOWN')
    expect(result.missingInformation).toContain('EXPECTED_SALARY_UNKNOWN')
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps an expected term distinct from a selected negotiation term', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.expectedTermYears?.value).toBe(2)
    expect(result.proposedTermYears).toBeUndefined()
    expect(result.missingInformation).toContain('SELECTED_NEGOTIATION_TERM_AUTHORITY_UNKNOWN')
  })

  it('does not invent an incoming player role or opening agent fee', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.proposedRole).toBeUndefined()
    expect(result.roleAuthority).toBe('UNKNOWN')
    expect(result.agentFee).toBeUndefined()
    expect(result.agentFeeAuthority).toBe('UNKNOWN')
    expect(result.missingInformation).toEqual(expect.arrayContaining(['INCOMING_CONTRACT_ROLE_AUTHORITY_UNKNOWN', 'OPENING_AGENT_FEE_AUTHORITY_UNKNOWN']))
  })

  it('resolves the real current recommend-signings holder while keeping advisory separate from execution authority', () => {
    const staffId = staffPersonIdFromString('offer-test:general-manager')
    const responsibilityId = `responsibility:${teamId}:recommendSignings`
    const world = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), {
        id: staffId,
        identity: { firstName: 'Offer', lastName: 'Manager' },
        professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> },
      }],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), {
        id: teamStaffAssignmentIdFromString('offer-test:general-manager-assignment'), staffPersonId: staffId, teamId, role: 'generalManager', assignedOn: base.currentDate,
      }],
      responsibilities: [
      ...Object.values(base.responsibilitiesById).filter((item) => item.id !== responsibilityId),
        { id: responsibilityId as never, teamId, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId },
      ],
    })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.transactionResponsibility).toMatchObject({
      kind: 'recommendSignings', mode: 'advisory', status: 'RESOLVED_HOLDER',
      holder: { staffId, role: 'generalManager' }, openingAuthority: 'UNKNOWN',
    })
    expect(result.transactionResponsibility.holder?.name).toBe('Offer Manager')
    expect(result.governanceAuthority).toBe('UNKNOWN')
  })

  it('preserves user-controlled responsibility without inventing a staff holder', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.transactionResponsibility).toMatchObject({ kind: 'recommendSignings', status: 'USER_CONTROLLED', openingAuthority: 'UNKNOWN' })
    expect(result.transactionResponsibility.holder).toBeUndefined()
  })

  it('leaves responsibility unknown when no current recommendation row exists', () => {
    const world = updateGameWorld(base, { responsibilities: Object.values(base.responsibilitiesById).filter((item) => !(item.teamId === teamId && item.kind === 'recommendSignings')) })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.transactionResponsibility.status).toBe('UNKNOWN')
    expect(result.blockers).toContain('TRANSACTION_RESPONSIBILITY_UNKNOWN')
  })

  it('keeps a currently affordable BS10B estimate separate from current payroll and Finance V2 context', () => {
    const currentPayroll = getTeamFinancialSnapshot(base, teamId).currentPlayerPayroll
    const tightened = updateGameWorld(base, {
      teamFinances: Object.values(base.teamFinancesByTeamId).map((item) => item.teamId === teamId ? { ...item, playerSalaryBudget: currentPayroll + 100_000 } : item),
    })
    const stressedProposal = { ...proposal, preferredCandidate: { ...proposal.preferredCandidate!, feasibility: { ...proposal.preferredCandidate!.feasibility, financeV2Context: 'STRESSED' as const } } }
    const result = assessFreeAgentOfferIntelligence(tightened, stressedProposal)
    expect(proposal.preferredCandidate?.feasibility.affordability).toBe('AFFORDABLE')
    expect(result.payrollAffordability).toBe('OVER_BUDGET')
    expect(result.readiness).toBe('FINANCIAL_BLOCK')
    expect(result.financeV2Context).toBe('STRESSED')
    expect(canTeamAffordAdditionalSalary(base, teamId, 650_000)).toBe(true)
  })

  it('detects an active canonical negotiation before indicating readiness', () => {
    const organizationId = base.teams[teamId]!.organizationId
    const id = `negotiation:${organizationId}:${playerId}:${base.currentDate}`
    const world = updateGameWorld(base, { negotiations: [{ id, organizationId, playerId, salary: 650_000, years: 2, role: 'ROTATION', agentFee: 1, status: 'OPEN', round: 0 }] })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.readiness).toBe('NEGOTIATION_ALREADY_EXISTS')
    expect(result.existingNegotiation).toMatchObject({ id, status: 'OPEN', kind: 'ACTIVE' })
  })

  it('detects same-day negotiation ID collision even when the earlier negotiation closed', () => {
    const organizationId = base.teams[teamId]!.organizationId
    const id = `negotiation:${organizationId}:${playerId}:${base.currentDate}`
    const world = updateGameWorld(base, { negotiations: [{ id, organizationId, playerId, salary: 650_000, years: 2, role: 'ROTATION', agentFee: 1, status: 'REJECTED', round: 1 }] })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.readiness).toBe('NEGOTIATION_ID_COLLISION')
    expect(result.existingNegotiation?.kind).toBe('ID_COLLISION')
  })

  it('keeps player-budget governance separate from transaction authority', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.governanceAuthority).toBe('UNKNOWN')
    expect(result.blockers).toContain('TRANSACTION_GOVERNANCE_AUTHORITY_UNKNOWN')
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps trade enquiries and no-action proposals out of free-agent offer progression', () => {
    const trade = assessFreeAgentOfferIntelligence(base, { ...proposal, proposalType: 'TRADE_ENQUIRY' })
    expect(trade.outcome).toBe('TRADE_ENQUIRY_ONLY')
    expect(trade.blockers).toContain('TRADE_PACKAGE_INTELLIGENCE_REQUIRED')
    expect(trade.readiness).toBe('UNSUPPORTED')

    const noAction = assessFreeAgentOfferIntelligence(base, { ...proposal, proposalType: 'NO_ACTIONABLE_PROPOSAL', noProposalReason: 'NO_CANONICAL_TRANSFER_MODEL' })
    expect(noAction.outcome).toBe('NO_ACTIONABLE_PROPOSAL')
    expect(noAction.blockers).toContain('NO_CANONICAL_TRANSFER_MODEL')
    expect(noAction.readiness).toBe('UNSUPPORTED')
  })

  it('does not change offer intelligence when hidden ratings or MarketReality changes', () => {
    const before = assessFreeAgentOfferIntelligence(base, proposal)
    const changedTruth = updateGameWorld(base, {
      players: Object.values(base.players).map((player) => player.id === playerId
        ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 1])) as typeof player.basketball.ratings } }
        : player),
      marketReality: Object.values(base.marketRealityByPlayerId).map((truth) => truth.playerId === playerId
        ? { ...truth, expectedSalary: 99_000_000, expectedYears: 4, playerWillingness: 0 }
        : truth),
    })
    expect(assessFreeAgentOfferIntelligence(changedTruth, proposal)).toEqual(before)
  })

  it('is deterministic and creates no negotiation, contract, transaction, Governance or Finance state', () => {
    const before = {
      negotiations: base.negotiationsById,
      contracts: base.contractsById,
      transactions: base.playerTransactionsById,
      governance: base.governanceRequestsById,
      finance: base.treasuryApplicationsById,
    }
    const first = assessFreeAgentOfferIntelligence(base, proposal)
    const second = assessFreeAgentOfferIntelligence(base, proposal)
    expect(second).toEqual(first)
    expect(base.negotiationsById).toBe(before.negotiations)
    expect(base.contractsById).toBe(before.contracts)
    expect(base.playerTransactionsById).toBe(before.transactions)
    expect(base.governanceRequestsById).toBe(before.governance)
    expect(base.treasuryApplicationsById).toBe(before.finance)
  })

  it('readiness checks each canonical negotiation requirement without a constant fallback', () => {
    expect(assessNegotiationOpeningReadiness({
      isCurrentFreeAgent: true,
      payrollAffordability: 'AFFORDABLE',
      requiredFields: { salary: true, termYears: true, role: true, agentFee: true },
      existingNegotiation: 'NONE',
      governanceAuthority: 'AUTHORIZED',
      responsibilityOpeningAuthority: 'AUTHORIZED',
    })).toMatchObject({ readiness: 'READY_TO_OPEN_NEGOTIATION', missingInformation: [] })
    expect(assessNegotiationOpeningReadiness({
      isCurrentFreeAgent: true,
      payrollAffordability: 'AFFORDABLE',
      requiredFields: { salary: true, termYears: true, role: true, agentFee: false },
      existingNegotiation: 'NONE',
      governanceAuthority: 'AUTHORIZED',
      responsibilityOpeningAuthority: 'AUTHORIZED',
    })).toMatchObject({ readiness: 'MORE_INFORMATION_REQUIRED', missingInformation: ['OPENING_AGENT_FEE_AUTHORITY_UNKNOWN'] })
  })
})

function makeNeed(): ClubNeed {
  return {
    id: 'test-need', priorityRank: 1, kind: 'POSITIONAL_DEPTH', severity: 'HIGH', urgency: 'SOON', confidence: 'HIGH', strategicFit: 'HIGH',
    affectedArea: 'POSITION', targetPosition: 'PG', relatedPlayerIds: [], evidence: [], temporalScope: 'STRUCTURAL', financialContext: 'HEALTHY',
  }
}
