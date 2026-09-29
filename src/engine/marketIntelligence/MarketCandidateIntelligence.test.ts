import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { createGMPlanState } from '@/domain/gmPlanning'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { OrganizationKnowledge, OrganizationKnowledgeDimension } from '@/domain/knowledge'
import type { ClubStrategicMode } from '@/domain/clubStrategy'
import type { Team } from '@/domain/team'
import { getActivePlayerContract, updateGameWorld, type GameWorld } from '@/domain/world'
import type { ClubNeed } from '@/engine/clubNeeds'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessMarketCandidatesForNeed } from './MarketCandidateIntelligence'
import { assessRoutedMarketCandidates } from '@/app/marketIntelligence'

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
