import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld, getEcosystemForTeam } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { ClubNeed } from '@/engine/clubNeeds'
import type { GMWorkflowDecision } from '@/engine/gmPlanning'
import { assessMarketCandidatesForNeed } from './MarketCandidateIntelligence'
import { assessMarketCandidateFeasibility, type MarketCandidateFeasibility, type MarketCandidateFeasibilityAssessment } from './MarketCandidateFeasibility'
import { selectAcquisitionProposal, type FeasibleMarketCandidate } from './AcquisitionProposalIntelligence'

let base: GameWorld
let teamId: TeamId
let playerIds: PlayerId[]
let sourceTeamId: TeamId

beforeAll(() => {
  base = createNewGame()
  const target = Object.values(base.teams).find((team) => team.coachId !== undefined && team.coachId !== base.userCoachId)!
  teamId = target.id
  const source = Object.values(base.teams).find((team) => team.id !== target.id
    && getEcosystemForTeam(base, team.id)?.kind !== 'ncaaLike'
    && team.rosterPlayerIds.length >= 8)!
  sourceTeamId = source.id
  playerIds = source.rosterPlayerIds.slice(0, 3)
})

describe('AcquisitionProposalIntelligence', () => {
  it('selects the first eligible BS10B candidate in order and exposes only a small alternative set', () => {
    const fixture = freeAgentFixture()
    const candidates = fixture.assessment.candidates.map((candidate) => supportedFreeAgent(candidate))
    const assessment = { ...fixture.assessment, candidates }
    const proposal = selectAcquisitionProposal(fixture.world, assessment, workflow(fixture.world))
    expect(proposal.proposalType).toBe('FREE_AGENT_APPROACH')
    expect(proposal.preferredCandidate?.playerId).toBe(candidates[0]!.playerId)
    expect(proposal.candidateRank).toBe(1)
    expect(proposal.alternatives.map((item) => item.playerId)).toEqual(candidates.slice(1, 3).map((item) => item.playerId))
    expect(selectAcquisitionProposal(fixture.world, assessment, workflow(fixture.world))).toEqual(proposal)
  })

  it('skips explicit feasibility blockers but keeps a candidate with unknown information eligible', () => {
    const fixture = freeAgentFixture()
    const [blocked, unknown] = fixture.assessment.candidates
    const candidates = [
      supportedFreeAgent(blocked!, { blockers: ['KNOWN_EXPECTED_SALARY_EXCEEDS_PLAYER_BUDGET'], affordability: 'OVER_BUDGET' }),
      supportedFreeAgent(unknown!, { expectedSalary: undefined, affordability: 'UNKNOWN', approachability: 'UNKNOWN' }),
    ]
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates }, workflow(fixture.world))
    expect(proposal.preferredCandidate?.playerId).toBe(unknown!.playerId)
    expect(proposal.proposalType).toBe('FREE_AGENT_APPROACH')
    expect(proposal.proposalReadiness).toBe('MORE_INFORMATION_REQUIRED')
    expect(proposal.missingInformation).toContain('EXPECTED_SALARY_UNKNOWN')
  })

  it('retains a non-blocked unknown route as a no-action result with a specific information gap', () => {
    const fixture = freeAgentFixture()
    const candidate = supportedFreeAgent(fixture.assessment.candidates[0]!, { route: 'UNKNOWN', routeSupport: 'UNKNOWN', affordability: 'NOT_APPLICABLE' })
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [candidate] }, workflow(fixture.world))
    expect(proposal.proposalType).toBe('NO_ACTIONABLE_PROPOSAL')
    expect(proposal.preferredCandidate?.playerId).toBe(candidate.playerId)
    expect(proposal.noProposalReason).toBe('ACQUISITION_ROUTE_UNKNOWN')
    expect(proposal.missingInformation).toContain('ACQUISITION_ROUTE_SUPPORT_UNKNOWN')
  })

  it('returns an explicit no-candidate result and a stable derived ID for an empty assessment', () => {
    const fixture = freeAgentFixture()
    const empty = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [] }, workflow(fixture.world))
    const repeated = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [] }, workflow(fixture.world))
    expect(empty.proposalType).toBe('NO_ACTIONABLE_PROPOSAL')
    expect(empty.noProposalReason).toBe('NO_DISCOVERABLE_CANDIDATES')
    expect(empty.id).toBe(repeated.id)
  })

  it('keeps hidden ratings and MarketReality out of selected proposal output', () => {
    const fixture = freeAgentFixture()
    const candidates = fixture.assessment.candidates.map((candidate) => supportedFreeAgent(candidate))
    const assessment = { ...fixture.assessment, candidates }
    const before = selectAcquisitionProposal(fixture.world, assessment, workflow(fixture.world))
    const changedTruth = updateGameWorld(fixture.world, {
      players: Object.values(fixture.world.players).map((player) => player.id === before.preferredCandidate?.playerId
        ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 1])) as typeof player.basketball.ratings } }
        : player),
      marketReality: Object.values(fixture.world.marketRealityByPlayerId).map((reality) => reality.playerId === before.preferredCandidate?.playerId
        ? { ...reality, expectedSalary: reality.expectedSalary + 3_000_000, expectedYears: 4, playerWillingness: 0, sellerWillingness: 0 }
        : reality),
    })
    const after = selectAcquisitionProposal(changedTruth, assessment, workflow(changedTruth))
    expect(after).toEqual(before)
    expect(after).not.toHaveProperty('overall')
    expect(after).not.toHaveProperty('world')
  })

  it('carries club-known salary and expected-term signals without turning them into an offer', () => {
    const fixture = freeAgentFixture({ expectedSalary: 650_000, expectedYears: 2, playerInterest: 61 })
    const candidate = supportedFreeAgent(fixture.assessment.candidates[0]!)
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [candidate] }, workflow(fixture.world))
    expect(proposal.proposalType).toBe('FREE_AGENT_APPROACH')
    expect(proposal.knownExpectedSalary).toMatchObject({ value: 650_000, source: 'AGENT', confidence: 75, assessedAt: fixture.world.currentDate })
    expect(proposal.expectedTermYears).toMatchObject({ value: 2, source: 'AGENT', confidence: 75 })
    expect(proposal.proposedContractTerm).toBe('NOT_SELECTED')
    expect(proposal.preferredCandidate?.feasibility.playerInterest?.value).toBe(61)
    expect(proposal.proposalReadiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps expected salary, term, and interest unknown when club knowledge is absent', () => {
    const fixture = freeAgentFixture()
    const candidate = supportedFreeAgent(fixture.assessment.candidates[0]!, { expectedSalary: undefined, playerInterest: undefined, affordability: 'UNKNOWN' })
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [candidate] }, workflow(fixture.world))
    expect(proposal.knownExpectedSalary).toBeUndefined()
    expect(proposal.expectedTermYears).toBeUndefined()
    expect(proposal.proposedContractTerm).toBe('NOT_SELECTED')
    expect(proposal.missingInformation).toEqual(expect.arrayContaining(['EXPECTED_SALARY_UNKNOWN', 'AFFORDABILITY_UNKNOWN', 'EXPECTED_TERM_KNOWLEDGE_UNKNOWN', 'PLAYER_INTEREST_UNKNOWN']))
  })

  it('updates proposal evidence when legitimate club-scoped MarketKnowledge changes', () => {
    const unknown = freeAgentFixture()
    const known = freeAgentFixture({ expectedSalary: 650_000, expectedYears: 2, playerInterest: 61 })
    const unknownCandidate = supportedFreeAgent(unknown.assessment.candidates[0]!)
    const knownCandidate = supportedFreeAgent(known.assessment.candidates[0]!)
    const unknownProposal = selectAcquisitionProposal(unknown.world, { ...unknown.assessment, candidates: [unknownCandidate] }, workflow(unknown.world))
    const knownProposal = selectAcquisitionProposal(known.world, { ...known.assessment, candidates: [knownCandidate] }, workflow(known.world))
    expect(unknownProposal.knownExpectedSalary).toBeUndefined()
    expect(knownProposal.knownExpectedSalary?.value).toBe(650_000)
    expect(knownProposal.expectedTermYears?.value).toBe(2)
    expect(knownProposal.knownPlayerInterest?.value).toBe(61)
  })

  it('surfaces a known financial block instead of selecting an unaffordable candidate', () => {
    const fixture = freeAgentFixture()
    const candidate = supportedFreeAgent(fixture.assessment.candidates[0]!, { blockers: ['KNOWN_EXPECTED_SALARY_EXCEEDS_PLAYER_BUDGET'], affordability: 'OVER_BUDGET' })
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [candidate] }, workflow(fixture.world))
    expect(proposal.proposalType).toBe('NO_ACTIONABLE_PROPOSAL')
    expect(proposal.noProposalReason).toBe('ALL_CANDIDATES_BLOCKED')
    expect(proposal.proposalReadiness).toBe('FINANCIAL_BLOCK')
    expect(proposal.blockers).toContain(`${candidate.playerId}:KNOWN_EXPECTED_SALARY_EXCEEDS_PLAYER_BUDGET`)
  })

  it('returns a trade enquiry without seller acceptance, outgoing assets, or package construction', () => {
    const fixture = freeAgentFixture()
    const incoming = supportedFreeAgent(fixture.assessment.candidates[0]!, {
      route: 'TRADE', routeSupport: 'SUPPORTED', availability: 'UNKNOWN', marketAvailability: undefined,
      affordability: 'NOT_APPLICABLE', approachability: 'UNKNOWN', expectedSalary: undefined,
    }, { acquisitionContext: 'TRADE_CONTEXT', contractStatus: 'UNDER_CONTRACT', currentTeam: { teamId: sourceTeamId, name: fixture.world.teams[sourceTeamId]!.name } })
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [incoming] }, workflow(fixture.world))
    expect(proposal.proposalType).toBe('TRADE_ENQUIRY')
    expect(proposal.route).toBe('TRADE')
    expect(proposal.packageStatus).toBe('NOT_CONSTRUCTED')
    expect(proposal.perceivedValueStatus).toBe('UNKNOWN')
    expect(proposal.preferredCandidate?.feasibility.sellerWillingness).toBeUndefined()
    expect(proposal.missingInformation).toContain('SELLER_WILLINGNESS_UNKNOWN')
    expect(proposal.alternatives).toEqual([])
  })

  it('produces no actionable proposal for unsupported transfer candidates', () => {
    const fixture = freeAgentFixture()
    const transfer = supportedFreeAgent(fixture.assessment.candidates[0]!, {
      route: 'TRANSFER', routeSupport: 'UNSUPPORTED', blockers: ['NO_CANONICAL_PLAYER_TRANSFER_OR_FEE_MODEL'], affordability: 'NOT_APPLICABLE',
    }, { acquisitionContext: 'TRANSFER_CONTEXT' })
    const proposal = selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [transfer] }, workflow(fixture.world))
    expect(proposal.proposalType).toBe('NO_ACTIONABLE_PROPOSAL')
    expect(proposal.proposalReadiness).toBe('UNSUPPORTED')
    expect(proposal.noProposalReason).toBe('NO_CANONICAL_TRANSFER_MODEL')
  })

  it('does not mutate negotiations, contracts, transactions, trade history, Governance, or Finance', () => {
    const fixture = freeAgentFixture()
    const candidate = supportedFreeAgent(fixture.assessment.candidates[0]!)
    const before = {
      negotiations: fixture.world.negotiationsById,
      contracts: fixture.world.contractsById,
      transactions: fixture.world.playerTransactionsById,
      trades: fixture.world.tradeHistoryById,
      governance: fixture.world.governanceRequestsById,
      finance: fixture.world.treasuryApplicationsById,
    }
    selectAcquisitionProposal(fixture.world, { ...fixture.assessment, candidates: [candidate] }, workflow(fixture.world))
    expect(fixture.world.negotiationsById).toBe(before.negotiations)
    expect(fixture.world.contractsById).toBe(before.contracts)
    expect(fixture.world.playerTransactionsById).toBe(before.transactions)
    expect(fixture.world.tradeHistoryById).toBe(before.trades)
    expect(fixture.world.governanceRequestsById).toBe(before.governance)
    expect(fixture.world.treasuryApplicationsById).toBe(before.finance)
  })
})

function freeAgentFixture(signal: { readonly expectedSalary?: number; readonly expectedYears?: number; readonly playerInterest?: number } = {}): {
  readonly world: GameWorld
  readonly assessment: MarketCandidateFeasibilityAssessment
} {
  const released = playerIds.reduce((world, playerId) => releasePlayer(world, sourceTeamId, playerId), base)
  const organizationId = released.teams[teamId]!.organizationId
  const world = updateGameWorld(released, { marketKnowledge: playerIds.map((playerId) => ({
    organizationId,
    playerId,
    availability: 'OPEN' as const,
    expectedSalary: signal.expectedSalary,
    expectedYears: signal.expectedYears,
    playerInterest: signal.playerInterest,
    confidence: 75,
    assessedAt: released.currentDate,
    source: 'AGENT' as const,
  })) })
  const need = makeNeed()
  const candidates = assessMarketCandidatesForNeed(world, teamId, need, 'CONTEND')
  return { world, assessment: assessMarketCandidateFeasibility(world, candidates) }
}

function supportedFreeAgent(
  candidate: FeasibleMarketCandidate,
  overrides: Partial<MarketCandidateFeasibility> = {},
  candidateOverrides: Partial<FeasibleMarketCandidate> = {},
): FeasibleMarketCandidate {
  return {
    ...candidate,
    ...candidateOverrides,
    feasibility: {
      ...candidate.feasibility,
      route: 'FREE_AGENT_SIGNING',
      routeSupport: 'SUPPORTED',
      approachability: 'HIGH',
      affordability: 'AFFORDABLE',
      blockers: [],
      ...overrides,
    },
  }
}

function workflow(world: GameWorld): GMWorkflowDecision {
  return {
    teamId,
    needId: 'test-need',
    planId: `${teamId}:test-need`,
    responseFamily: 'EXTERNAL_ACQUISITION',
    selectedOn: world.currentDate,
    selectionReason: 'INITIAL_SELECTION',
    currentValidity: 'CURRENT',
    currentPlanningEligibility: 'SELECTABLE',
    route: 'MARKET_INTELLIGENCE_REQUIRED',
    status: 'WAITING_INFORMATION',
    currentExecutionReadiness: 'UNKNOWN_AUTHORITY',
    authorityStatus: 'UNKNOWN',
    responsibleSystem: 'BS10_MARKET_INTELLIGENCE',
    reviewedOn: world.currentDate,
    coordinationFlags: [],
    reasons: [],
    blockers: [],
  }
}

function makeNeed(): ClubNeed {
  return {
    id: 'test-need', priorityRank: 1, kind: 'POSITIONAL_DEPTH', severity: 'HIGH', urgency: 'SOON', confidence: 'HIGH', strategicFit: 'HIGH',
    affectedArea: 'POSITION', targetPosition: 'PG', relatedPlayerIds: [], evidence: [], temporalScope: 'STRUCTURAL', financialContext: 'HEALTHY',
  }
}
