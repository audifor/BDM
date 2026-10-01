import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { addDays } from '@/domain/date'
import { createNegotiationContact } from '@/domain/market'
import { createGMPlanState } from '@/domain/gmPlanning'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'
import type { ClubStrategicMode } from '@/domain/clubStrategy'
import type { Team } from '@/domain/team'
import { canTeamAffordAdditionalSalary, getActivePlayerContract, updateGameWorld, type GameWorld } from '@/domain/world'
import type { ClubNeed } from '@/engine/clubNeeds'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessMarketCandidatesForNeed } from './MarketCandidateIntelligence'
import { assessMarketCandidateFeasibility } from './MarketCandidateFeasibility'
import { assessRoutedMarketCandidates, assessRoutedMarketCandidateFeasibility } from '@/app/marketIntelligence'
import { initializeMarketAgents, progressNegotiationContactResponses } from '@/engine/market'

let base: GameWorld
let club: Team
let externalPlayerId: PlayerId

beforeAll(() => {
  base = createNewGame()
  club = Object.values(base.teams).find((team) => team.coachId !== undefined && team.coachId !== base.userCoachId)!
  externalPlayerId = Object.values(base.players).find((player) => {
    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(player.id))
    return sourceTeam !== undefined && sourceTeam.id !== club.id && getActivePlayerContract(base, player.id) !== undefined
  })!.id
})

describe('MarketCandidateIntelligence', () => {
  it('ignores external Player Truth changes when OrganizationKnowledge is unchanged', () => {
    const world = withKnowledge(base, externalPlayerId, { creation: finding(86), shooting: finding(72), interiorDefense: finding(66) })
    const need = makeNeed({ kind: 'ROLE_GAP', targetRole: 'PRIMARY_HANDLING', affectedArea: 'ROLE' })
    const before = assessMarketCandidatesForNeed(world, club.id, need, 'CONTEND')
    const changedTruth = updateGameWorld(world, { players: Object.values(world.players).map((player) => player.id === externalPlayerId
      ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.entries(player.basketball.ratings).map(([key]) => [key, 1])) as typeof player.basketball.ratings } }
      : player) })
    expect(assessMarketCandidatesForNeed(changedTruth, club.id, need, 'CONTEND')).toEqual(before)
  })

  it('uses known role estimates and preserves unknown role evidence', () => {
    const need = makeNeed({ kind: 'ROLE_GAP', targetRole: 'PRIMARY_HANDLING', affectedArea: 'ROLE' })
    const unknownWorld = withMarketSignal(base, externalPlayerId)
    const unknown = assessMarketCandidatesForNeed(unknownWorld, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    const knownWorld = withKnowledge(base, externalPlayerId, { creation: finding(86) })
    const known = assessMarketCandidatesForNeed(knownWorld, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(unknown.roleFit).toBe('UNKNOWN')
    expect(known.roleFit).toBe('HIGH')
    expect(known.reasons).toContain('PRIMARY_HANDLER_EVIDENCE')
    expect(known.knownDimensions.creation?.provenance).toBe('scoutReport')
  })

  it('omits undiscoverable contracted Players but includes publicly listed free agents with limited knowledge', () => {
    const need = makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' })
    const hidden = assessMarketCandidatesForNeed(base, club.id, need, 'CONTEND')
    expect(hidden.candidates.some((item) => item.playerId === externalPlayerId)).toBe(false)

    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(externalPlayerId))!
    const freeAgentWorld = releasePlayer(base, sourceTeam.id, externalPlayerId)
    const freeAgent = assessMarketCandidatesForNeed(freeAgentWorld, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(freeAgent.discoverySources).toContain('PUBLIC_FREE_AGENT_LIST')
    expect(freeAgent.availabilityStatus).toBe('FREE_AGENT')
    expect(freeAgent.knowledgeStatus).toBe('LIMITED')
    expect(freeAgent.knowledgeConfidence).toBe('LOW')
    expect(freeAgent.missingKnowledge).toContain('shooting')
  })

  it('returns a valid empty result when no candidate has a discoverable source', () => {
    const noKnowledge = updateGameWorld(base, { organizationKnowledge: [], marketKnowledge: [] })
    const withProspectsFiltered = assessMarketCandidatesForNeed(noKnowledge, club.id, makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' }), 'CONTEND')
    expect(withProspectsFiltered).toMatchObject({ candidates: [], knowledgeStatus: 'MARKET_KNOWLEDGE_INSUFFICIENT' })
  })

  it('keeps contracted status separate from availability and values known primary or secondary position', () => {
    const need = makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' })
    const world = withKnowledge(base, externalPlayerId, { creation: finding(70) })
    const candidate = assessMarketCandidatesForNeed(world, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(candidate.contractStatus).toBe('UNDER_CONTRACT')
    expect(candidate.availabilityStatus).toBe('UNKNOWN')
    expect(candidate.blockers).toContain('CONTRACTED_PLAYER_AVAILABILITY_UNKNOWN')

    const positionWorld = updateGameWorld(world, { players: Object.values(world.players).map((item) => item.id === externalPlayerId
      ? { ...item, basketball: { ...item.basketball, primaryPosition: 'PG' as const } }
      : item) })
    const positionCandidate = assessMarketCandidatesForNeed(positionWorld, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(positionCandidate.positionFit).toBe('HIGH')
    expect(positionCandidate.reasons).toContain('POSITION_MATCH')
  })

  it('keeps free-agent salary and feasibility unchanged when hidden ratings and MarketReality change', () => {
    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(externalPlayerId))!
    const freeAgentWorld = releasePlayer(base, sourceTeam.id, externalPlayerId)
    const signalWorld = withMarketSignal(freeAgentWorld, externalPlayerId)
    const need = makeNeed()
    const assessment = assessMarketCandidatesForNeed(signalWorld, club.id, need, 'CONTEND')
    const before = assessMarketCandidateFeasibility(signalWorld, assessment)
    const changed = updateGameWorld(signalWorld, {
      players: Object.values(signalWorld.players).map((player) => player.id === externalPlayerId
        ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 100])) as typeof player.basketball.ratings } }
        : player),
      marketReality: Object.values(signalWorld.marketRealityByPlayerId).map((reality) => reality.playerId === externalPlayerId
        ? { ...reality, expectedSalary: reality.expectedSalary + 500_000, playerWillingness: 0, sellerWillingness: 0 }
        : reality),
    })
    const after = assessMarketCandidateFeasibility(changed, assessMarketCandidatesForNeed(changed, club.id, need, 'CONTEND'))
    expect(after.candidates.find((item) => item.playerId === externalPlayerId)?.feasibility).toEqual(before.candidates.find((item) => item.playerId === externalPlayerId)?.feasibility)
    expect(before.candidates.find((item) => item.playerId === externalPlayerId)?.feasibility.expectedSalary).toBeUndefined()
    expect(before.candidates.find((item) => item.playerId === externalPlayerId)?.feasibility.affordability).toBe('UNKNOWN')
  })

  it('uses only club MarketKnowledge salary, willingness, interest and availability with provenance', () => {
    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(externalPlayerId))!
    const freeAgentWorld = releasePlayer(base, sourceTeam.id, externalPlayerId)
    const marketWorld = updateGameWorld(freeAgentWorld, { marketKnowledge: [{ organizationId: club.organizationId, playerId: externalPlayerId, availability: 'OPEN', expectedSalary: 1_000_000, playerInterest: 72, sellerWillingness: 44, confidence: 65, assessedAt: base.currentDate, source: 'AGENT' }] })
    const unknown = assessMarketCandidateFeasibility(freeAgentWorld, assessMarketCandidatesForNeed(freeAgentWorld, club.id, makeNeed(), 'CONTEND')).candidates.find((item) => item.playerId === externalPlayerId)!
    const assessment = assessMarketCandidatesForNeed(marketWorld, club.id, makeNeed(), 'CONTEND')
    const candidate = assessMarketCandidateFeasibility(marketWorld, assessment).candidates.find((item) => item.playerId === externalPlayerId)!
    expect(candidate.feasibility.route).toBe('FREE_AGENT_SIGNING')
    expect(candidate.feasibility.routeSupport).toBe('SUPPORTED')
    expect(candidate.feasibility.expectedSalary).toMatchObject({ value: 1_000_000, source: 'AGENT', confidence: 65, assessedAt: base.currentDate })
    expect(candidate.feasibility.affordability).toBe(canTeamAffordAdditionalSalary(marketWorld, club.id, 1_000_000) ? 'AFFORDABLE' : 'OVER_BUDGET')
    expect(candidate.feasibility.playerInterest).toMatchObject({ value: 72, source: 'AGENT', confidence: 65 })
    expect(candidate.feasibility.sellerWillingness).toMatchObject({ value: 44, source: 'AGENT', confidence: 65 })
    expect(candidate.feasibility.availability).toBe('FREE_AGENT')
    expect(candidate.feasibility.marketAvailability).toBe('OPEN')
    expect(unknown.feasibility.affordability).toBe('UNKNOWN')
    expect(candidate.feasibility.affordability).not.toBe(unknown.feasibility.affordability)
    expect(unknown.feasibility.approachability).toBe('UNKNOWN')
    expect(candidate.feasibility.approachability).toBe(canTeamAffordAdditionalSalary(marketWorld, club.id, 1_000_000) ? 'MEDIUM' : 'BLOCKED')
  })

  it('feeds contact-revealed information into later BS10B feasibility without exposing MarketReality', () => {
    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(externalPlayerId))!
    const freeAgentWorld = initializeMarketAgents(releasePlayer(base, sourceTeam.id, externalPlayerId))
    const responseDate = addDays(freeAgentWorld.currentDate, 1)
    const reality = { ...freeAgentWorld.marketRealityByPlayerId[externalPlayerId]!, playerWillingness: 72, expectedSalary: 1_000_000 }
    const dueWorld = updateGameWorld(freeAgentWorld, { currentDate: responseDate, marketReality: [...Object.values(freeAgentWorld.marketRealityByPlayerId).filter((item) => item.playerId !== externalPlayerId), reality] })
    const contact = createNegotiationContact({ organizationId: club.organizationId, teamId: club.id, playerId: externalPlayerId, startedOn: freeAgentWorld.currentDate, actionKey: 'contact-to-feasibility', responsibleActor: { kind: 'ORGANIZATION' } })
    const before = assessMarketCandidateFeasibility(dueWorld, assessMarketCandidatesForNeed(dueWorld, club.id, makeNeed(), 'CONTEND')).candidates.find((item) => item.playerId === externalPlayerId)!
    const responded = progressNegotiationContactResponses(updateGameWorld(dueWorld, { negotiations: [contact] }))
    const after = assessMarketCandidateFeasibility(responded, assessMarketCandidatesForNeed(responded, club.id, makeNeed(), 'CONTEND')).candidates.find((item) => item.playerId === externalPlayerId)!

    expect(before.feasibility.expectedSalary).toBeUndefined()
    expect(after.feasibility.expectedSalary).toMatchObject({ value: 1_000_000, source: 'CLUB_CONTACT', confidence: 90, assessedAt: responseDate })
    expect(after.feasibility.playerInterest).toMatchObject({ value: 72, source: 'CLUB_CONTACT', confidence: 90, assessedAt: responseDate })
    expect(responded.marketRealityByPlayerId[externalPlayerId]).toEqual(dueWorld.marketRealityByPlayerId[externalPlayerId])
  })

  it('never turns unknown valuation, salary, interest or seller willingness into neutral values', () => {
    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(externalPlayerId))!
    const freeAgentWorld = releasePlayer(base, sourceTeam.id, externalPlayerId)
    const assessment = assessMarketCandidatesForNeed(withMarketSignal(freeAgentWorld, externalPlayerId), club.id, makeNeed(), 'CONTEND')
    const candidate = assessMarketCandidateFeasibility(freeAgentWorld, assessment).candidates.find((item) => item.playerId === externalPlayerId)!
    expect(candidate.feasibility.expectedSalary).toBeUndefined()
    expect(candidate.feasibility.affordability).toBe('UNKNOWN')
    expect(candidate.feasibility.playerInterest).toBeUndefined()
    expect(candidate.feasibility.sellerWillingness).toBeUndefined()
    expect(candidate.feasibility.perceivedEconomicValue).toBe('UNKNOWN')
    expect(candidate.feasibility.approachability).toBe('UNKNOWN')
  })

  it('does not infer trade availability or payroll affordability from a contracted player', () => {
    const world = withKnowledge(base, externalPlayerId, { creation: finding(75) })
    const candidate = assessMarketCandidatesForNeed(world, club.id, makeNeed(), 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    const result = assessMarketCandidateFeasibility(world, { ...assessMarketCandidatesForNeed(world, club.id, makeNeed(), 'CONTEND'), candidates: [{ ...candidate, acquisitionContext: 'CONTRACTED' }] }).candidates.find((item) => item.playerId === externalPlayerId)!
    expect(result.contractStatus).toBe('UNDER_CONTRACT')
    expect(result.feasibility.availability).toBe('UNKNOWN')
    expect(result.feasibility.route).toBe('UNKNOWN')
    expect(result.feasibility.routeSupport).toBe('UNKNOWN')
    expect(result.feasibility.affordability).toBe('NOT_APPLICABLE')
    expect(result.feasibility.currentContractAnnualSalary).toBe(getActivePlayerContract(world, externalPlayerId)?.compensation.annualSalary)
    expect(result.feasibility.expectedSalary).toBeUndefined()
    expect(result.feasibility.sellerWillingness).toBeUndefined()
    expect(result.feasibility.tradePackageLegality).toBe('NOT_ASSESSED')
  })

  it('reports trade-rule route support without constructing or validating a trade package', () => {
    const season = Object.values(base.seasons).find((item) => {
      const competition = base.competitions[item.competitionId]!
      const participants = item.participantTeamIds ?? competition.participantTeamIds
      return base.currentDate >= item.startDate && base.currentDate <= item.endDate && participants.includes(club.id)
    })!
    const competition = base.competitions[season.competitionId]!
    const sourceTeam = Object.values(base.teams).find((team) => team.id !== club.id && (season.participantTeamIds ?? competition.participantTeamIds).includes(team.id) && team.rosterPlayerIds.length > 0)!
    const playerId = sourceTeam.rosterPlayerIds[0]!
    const rules = { seasonId: season.id, ecosystemId: competition.ecosystemId, maxTeamsPerTrade: 2, allowedAssetKinds: ['player'] as const, maxFutureDraftCyclesTradable: 0, retainedSalary: { allowed: false, maximumPercentage: 0, maximumContractsPerTeam: 0 }, cashConsideration: { allowed: false, maximumAmount: 0 }, createTradeException: { enabled: false, expiresAfterSeasons: 1 } }
    const world = updateGameWorld(base, { tradeRulesBySeasonId: { ...base.tradeRulesBySeasonId, [season.id]: rules }, organizationKnowledge: [...base.organizationKnowledge, knowledge(club.organizationId, playerId, { creation: finding(70) })] })
    const candidate = assessMarketCandidatesForNeed(world, club.id, makeNeed(), 'CONTEND').candidates.find((item) => item.playerId === playerId)!
    const assessment = assessMarketCandidatesForNeed(world, club.id, makeNeed(), 'CONTEND')
    const tradeAssessment = { ...assessment, candidates: [{ ...candidate, acquisitionContext: 'TRADE_CONTEXT' as const, currentTeam: { teamId: sourceTeam.id, name: sourceTeam.name } }] }
    const result = assessMarketCandidateFeasibility(world, tradeAssessment).candidates[0]!
    expect(result.feasibility.route).toBe('TRADE')
    expect(result.feasibility.routeSupport).toBe('SUPPORTED')
    expect(result.feasibility.tradePackageLegality).toBe('NOT_ASSESSED')
    expect(result.feasibility.affordability).toBe('NOT_APPLICABLE')
    expect(result.feasibility.sellerWillingness).toBeUndefined()
    const noRulesWorld = updateGameWorld(world, { tradeRulesBySeasonId: {} })
    const unsupported = assessMarketCandidateFeasibility(noRulesWorld, tradeAssessment).candidates[0]!
    expect(unsupported.feasibility.route).toBe('TRADE')
    expect(unsupported.feasibility.routeSupport).toBe('UNSUPPORTED')
    expect(unsupported.feasibility.blockers).toContain('NO_ACTIVE_CANONICAL_TRADE_RULES')
  })

  it('labels cross-ecosystem transfer context unsupported when no transfer economics exist', () => {
    const candidate = assessMarketCandidatesForNeed(withKnowledge(base, externalPlayerId, { creation: finding(70) }), club.id, makeNeed(), 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    const assessment = assessMarketCandidatesForNeed(withKnowledge(base, externalPlayerId, { creation: finding(70) }), club.id, makeNeed(), 'CONTEND')
    const transferAssessment = { ...assessment, candidates: [{ ...candidate, acquisitionContext: 'TRANSFER_CONTEXT' as const }] }
    const result = assessMarketCandidateFeasibility(base, transferAssessment).candidates[0]!
    expect(result.feasibility.route).toBe('TRANSFER')
    expect(result.feasibility.routeSupport).toBe('UNSUPPORTED')
    expect(result.feasibility.routeReason).toBe('NO_CANONICAL_PLAYER_TRANSFER_OR_FEE_MODEL')
    expect(result.feasibility.approachability).toBe('BLOCKED')
    expect(result.feasibility.expectedSalary).toBeUndefined()
    expect(result.feasibility.perceivedEconomicValue).toBe('UNKNOWN')
  })

  it('keeps Finance V2 context separate and does not add transaction or Governance state', () => {
    const sourceTeam = Object.values(base.teams).find((team) => team.rosterPlayerIds.includes(externalPlayerId))!
    const world = releasePlayer(base, sourceTeam.id, externalPlayerId)
    const market = withMarketSignal(world, externalPlayerId)
    const assessment = assessMarketCandidatesForNeed(market, club.id, makeNeed({ financialContext: 'STRESSED' }), 'SURVIVE')
    const before = { negotiations: market.negotiationsById, transactions: market.playerTransactionsById, contracts: market.contractsById, trades: market.tradeHistoryById, governance: market.governanceRequestsById, finance: market.treasuryApplicationsById }
    const result = assessMarketCandidateFeasibility(market, assessment)
    const candidate = result.candidates.find((item) => item.playerId === externalPlayerId)!
    expect(candidate.feasibility.financeV2Context).toBe('STRESSED')
    expect(candidate.feasibility.approachability).toBe('UNKNOWN')
    expect(new Set(result.candidates.map((item) => item.playerId))).toEqual(new Set(assessment.candidates.map((item) => item.playerId)))
    expect(assessMarketCandidateFeasibility(market, assessment)).toEqual(result)
    expect(market.negotiationsById).toBe(before.negotiations)
    expect(market.playerTransactionsById).toBe(before.transactions)
    expect(market.governanceRequestsById).toBe(before.governance)
    expect(market.contractsById).toBe(before.contracts)
    expect(market.tradeHistoryById).toBe(before.trades)
    expect(market.treasuryApplicationsById).toBe(before.finance)
    expect(result).not.toHaveProperty('world')
  })

  it('uses only a listed secondary position and does not infer role fit from hidden ratings', () => {
    const need = makeNeed({ kind: 'POSITIONAL_DEPTH', targetPosition: 'PG', affectedArea: 'POSITION' })
    const withSecondary = updateGameWorld(withMarketSignal(base, externalPlayerId), { players: Object.values(base.players).map((player) => player.id === externalPlayerId
      ? { ...player, basketball: { ...player.basketball, primaryPosition: 'SG' as const, secondaryPositions: ['PG'] } }
      : player) })
    const secondaryCandidate = assessMarketCandidatesForNeed(withSecondary, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(secondaryCandidate.positionFit).toBe('MODERATE')
    expect(secondaryCandidate.reasons).toContain('SECONDARY_POSITION_MATCH')
    expect(secondaryCandidate.roleFit).toBe('UNKNOWN')
  })

  it('orders known primary-position matches ahead of known mismatches for positional depth', () => {
    const ids = Object.values(base.teams).find((team) => team.id !== club.id)!.rosterPlayerIds.slice(0, 2)
    const players = Object.values(base.players).map((player) => player.id === ids[0]
      ? { ...player, basketball: { ...player.basketball, primaryPosition: 'PG' as const } }
      : player.id === ids[1]
        ? { ...player, basketball: { ...player.basketball, primaryPosition: 'SG' as const } }
        : player)
    const world = updateGameWorld(base, { players, organizationKnowledge: ids.map((playerId) => knowledge(club.organizationId, playerId, { creation: finding(75), shooting: finding(75), interiorDefense: finding(75) })) })
    const candidates = assessMarketCandidatesForNeed(world, club.id, makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' }), 'CONTEND').candidates
    expect(candidates.slice(0, 2).map((candidate) => candidate.positionFit)).toEqual(['HIGH', 'LOW'])
  })

  it('keeps all seven unobserved basketball dimensions missing and reports insufficient market knowledge', () => {
    const candidate = assessMarketCandidatesForNeed(base, club.id, makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' }), 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)
    expect(candidate).toBeUndefined()
    const marketKnown = updateGameWorld(base, { marketKnowledge: [{ organizationId: club.organizationId, playerId: externalPlayerId, availability: 'LISTENING', confidence: 70, assessedAt: base.currentDate, source: 'MEDIA' }] })
    const result = assessMarketCandidatesForNeed(marketKnown, club.id, makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' }), 'CONTEND')
    const limited = result.candidates.find((item) => item.playerId === externalPlayerId)!
    expect(result.knowledgeStatus).toBe('MARKET_KNOWLEDGE_INSUFFICIENT')
    expect(limited.missingKnowledge).toEqual(['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical', 'medical confidence'])
    expect(limited.knownDimensions).toEqual({})
  })

  it('contextualizes current fit, potential knowledge, age and temporary versus structural timing separately', () => {
    const player = base.players[externalPlayerId]!
    const youngPlayerWorld = updateGameWorld(base, { players: Object.values(base.players).map((item) => item.id === externalPlayerId
      ? { ...item, bio: { ...item.bio, dateOfBirth: `${Number(base.currentDate.slice(0, 4)) - 20}-01-01` as typeof item.bio.dateOfBirth } }
      : item) })
    const known = withKnowledge(youngPlayerWorld, externalPlayerId, {
      creation: finding(88),
      'potential:physical': finding(35),
    })
    const roleNeed = makeNeed({ kind: 'ROLE_GAP', targetRole: 'PRIMARY_HANDLING', affectedArea: 'ROLE' })
    const contender = assessMarketCandidatesForNeed(known, club.id, roleNeed, 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    const developer = assessMarketCandidatesForNeed(known, club.id, roleNeed, 'DEVELOP').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(contender.strategyFit).toBe('HIGH')
    expect(developer.strategyFit).toBe('LOW')
    expect(developer.timelineFit).toBe('HIGH')
    expect(contender.name).toBe(`${player.firstName} ${player.lastName}`)

    const contractCandidateWorld = updateGameWorld(known, { marketKnowledge: [{ organizationId: club.organizationId, playerId: externalPlayerId, availability: 'OPEN', confidence: 90, assessedAt: base.currentDate, source: 'AGENT' }] })
    const structural = assessMarketCandidatesForNeed(contractCandidateWorld, club.id, makeNeed({ ...roleNeed, temporalScope: 'STRUCTURAL' }), 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    const temporary = assessMarketCandidatesForNeed(contractCandidateWorld, club.id, makeNeed({ ...roleNeed, temporalScope: 'TEMPORARY' }), 'CONTEND').candidates.find((item) => item.playerId === externalPlayerId)!
    expect(structural.timelineFit).toBe('HIGH')
    expect(temporary.timelineFit).toBe('UNKNOWN')
    expect(temporary.acquisitionContext).not.toBe('FREE_AGENT')
  })

  it('orders candidates deterministically by visible fit components and introduces no overall, value, affordability, or action authority', () => {
    const externalPlayers = Object.values(base.teams).find((team) => team.id !== club.id)!.rosterPlayerIds.slice(0, 2)
    const world = updateGameWorld(base, { organizationKnowledge: externalPlayers.map((playerId, index) => knowledge(club.organizationId, playerId, {
      creation: finding(index === 0 ? 48 : 84), shooting: finding(75), interiorDefense: finding(69),
    })) })
    const need = makeNeed({ kind: 'ROLE_GAP', targetRole: 'PRIMARY_HANDLING', affectedArea: 'ROLE' })
    const first = assessMarketCandidatesForNeed(world, club.id, need, 'CONTEND')
    const reordered = updateGameWorld(world, { organizationKnowledge: [...world.organizationKnowledge].reverse() })
    const second = assessMarketCandidatesForNeed(reordered, club.id, need, 'CONTEND')
    expect(first.candidates.map((item) => item.playerId)).toEqual(second.candidates.map((item) => item.playerId))
    expect(first.candidates[0]!.playerId).toBe(externalPlayers[1])
    expect(first.candidates[0]!.needFit).toBe('HIGH')
    for (const candidate of first.candidates) {
      expect(Object.keys(candidate).join(' ').toLowerCase()).not.toMatch(/overall|valuation|afford|salary|offer|tradeproposal|transaction/)
      expect(candidate.financialFeasibility).toBe('NOT_ASSESSED')
    }
    expect(first).not.toHaveProperty('world')

    const duplicateSignals = updateGameWorld(world, { marketKnowledge: [
      { organizationId: club.organizationId, playerId: externalPlayers[0]!, availability: 'OPEN', confidence: 90, assessedAt: world.currentDate, source: 'AGENT' },
      { organizationId: club.organizationId, playerId: externalPlayers[0]!, availability: 'NOT_FOR_SALE', confidence: 90, assessedAt: world.currentDate, source: 'AGENT' },
    ] })
    const reversedSignals = updateGameWorld(duplicateSignals, { marketKnowledge: [...duplicateSignals.marketKnowledge].reverse() })
    const duplicateCandidate = assessMarketCandidatesForNeed(duplicateSignals, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayers[0])
    const reversedCandidate = assessMarketCandidatesForNeed(reversedSignals, club.id, need, 'CONTEND').candidates.find((item) => item.playerId === externalPlayers[0])
    expect(duplicateCandidate).toEqual(reversedCandidate)
  })

  it('excludes Draft and Recruiting prospect pools from professional free-agent discovery', () => {
    const prospect = Object.values(base.players).find((player) => Object.values(base.recruitProfilesById).some((profile) => profile.playerId === player.id))
    if (prospect === undefined) return
    const result = assessMarketCandidatesForNeed(base, club.id, makeNeed({ targetPosition: 'PG', affectedArea: 'POSITION' }), 'CONTEND')
    expect(result.candidates.some((candidate) => candidate.playerId === prospect.id)).toBe(false)
  })

  it('connects only current incoming market routes and keeps user and AI knowledge perspectives explicit', () => {
    const shortRoster = updateGameWorld(base, { teams: Object.values(base.teams).map((team) => team.id === club.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team) })
    const aiContext = assessGMDecisionContext(shortRoster, club.id)
    const externalNeed = aiContext.needsAssessment.needs.find((need) => aiContext.options.some((option) => option.needId === need.id && option.kind === 'EXTERNAL_ACQUISITION' && option.planningEligibility === 'SELECTABLE'))
    expect(externalNeed).toBeDefined()
    if (externalNeed === undefined) return
    const externalOption = aiContext.options.find((option) => option.needId === externalNeed.id && option.kind === 'EXTERNAL_ACQUISITION')!
    const seededPlan = createGMPlanState({ id: `${club.id}:${externalNeed.id}`, teamId: club.id, needId: externalNeed.id, selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: shortRoster.currentDate, lastReviewedOn: shortRoster.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: externalOption.executionReadiness as Exclude<typeof externalOption.executionReadiness, 'BLOCKED'>, strategyAtSelection: aiContext.strategy, originalOptionPriority: externalOption.priority })
    const planned = updateGameWorld(shortRoster, { gmPlanStates: [...Object.values(shortRoster.gmPlanStatesById).filter((plan) => plan.teamId !== club.id), seededPlan] })
    const routed = assessRoutedMarketCandidates(planned, club.id)
    expect(routed).toHaveLength(1)
    expect(routed[0]!.route).toBe('MARKET_INTELLIGENCE_REQUIRED')
    expect(routed[0]!.perspective).toBe('ORGANIZATION_KNOWLEDGE')
    expect(routed[0]!.need.id).toBe(externalNeed.id)
    const feasibilityRoute = assessRoutedMarketCandidateFeasibility(planned, club.id)
    expect(feasibilityRoute[0]!.candidates.map((item) => item.playerId).sort()).toEqual(routed[0]!.candidates.map((item) => item.playerId).sort())
    expect(feasibilityRoute[0]!.candidates.every((item) => item.feasibility.perceivedEconomicValue === 'UNKNOWN')).toBe(true)
    expect(feasibilityRoute[0]!.candidates.every((item) => item.needFit !== undefined)).toBe(true)
    expect(assessRoutedMarketCandidates(base, club.id)).toEqual([])
    expect(assessRoutedMarketCandidates(planned, club.id).length).toBe(1)
    expect(planned.gmPlanStatesById[seededPlan.id]).toEqual(seededPlan)
    expect(planned.scoutingAssignmentsById).toBe(shortRoster.scoutingAssignmentsById)
    expect(planned.negotiationsById).toBe(shortRoster.negotiationsById)
    expect(planned.playerTransactionsById).toBe(shortRoster.playerTransactionsById)

    const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const shortUserRoster = updateGameWorld(base, { teams: Object.values(base.teams).map((team) => team.id === userTeam.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team) })
    const userContext = assessGMDecisionContext(shortUserRoster, userTeam.id)
    const userNeed = userContext.needsAssessment.needs.find((need) => userContext.options.some((option) => option.needId === need.id && option.kind === 'EXTERNAL_ACQUISITION' && option.planningEligibility === 'SELECTABLE'))
    expect(userNeed).toBeDefined()
    const userRouted = assessRoutedMarketCandidates(shortUserRoster, userTeam.id)
    expect(userRouted.every((item) => item.perspective === 'USER_ANALYTICS')).toBe(true)
    const userProjection = assessMarketCandidatesForNeed(shortUserRoster, userTeam.id, userNeed!, userContext.strategy)
    expect(userProjection.perspective).toBe('USER_ANALYTICS')
    expect(userProjection.candidates.every((candidate) => candidate.knownDimensions.overall === undefined)).toBe(true)
    expect(shortUserRoster.gmPlanStatesById).toBe(base.gmPlanStatesById)
  })
})

function makeNeed(overrides: Partial<ClubNeed> = {}): ClubNeed {
  return {
    id: 'test-need', priorityRank: 1, kind: 'POSITIONAL_DEPTH', severity: 'HIGH', urgency: 'SOON', confidence: 'HIGH', strategicFit: 'HIGH',
    affectedArea: 'POSITION', targetPosition: 'PG', relatedPlayerIds: [], evidence: [], temporalScope: 'STRUCTURAL', financialContext: 'HEALTHY', ...overrides,
  }
}

function finding(estimate: number, overrides: Partial<OrganizationKnowledgeDimension> = {}): OrganizationKnowledgeDimension {
  return { coverage: 1, confidence: 1, assessedAt: base.currentDate, provenance: 'scoutReport', estimate, uncertainty: 1, ...overrides }
}

function knowledge(organizationId: OrganizationKnowledge['organizationId'], subjectPlayerId: OrganizationKnowledge['subjectPlayerId'], dimensions: OrganizationKnowledge['dimensions']): OrganizationKnowledge {
  return { organizationId, subjectPlayerId, dimensions }
}

function withKnowledge(world: GameWorld, playerId: OrganizationKnowledge['subjectPlayerId'], dimensions: OrganizationKnowledge['dimensions']): GameWorld {
  const record = knowledge(club.organizationId, playerId, dimensions)
  return updateGameWorld(world, { organizationKnowledge: [...world.organizationKnowledge.filter((item) => item.subjectPlayerId !== playerId || item.organizationId !== club.organizationId), record] })
}

function withMarketSignal(world: GameWorld, playerId: PlayerId): GameWorld {
  return updateGameWorld(world, { marketKnowledge: [...world.marketKnowledge.filter((item) => item.organizationId !== club.organizationId || item.playerId !== playerId), { organizationId: club.organizationId, playerId, confidence: 50, assessedAt: world.currentDate, source: 'MEDIA' }] })
}
