import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createGovernanceDecision, createGovernanceDecisionEvent, createGovernanceRequest, createGovernanceRequestEvent } from '@/domain/governance'
import { applyUserCoachForJob, declineCoachJobOffer } from '@/app/coachCareer/CoachCareerService'
import { createPreMatchMediaOpportunity, skipMediaOpportunity } from '@/engine/media'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { createDraftForCompletedSeason, generateDraftProspects, getAvailableDraftProspects, getCurrentDraftPick, makeDraftSelection, openDraft } from '@/engine/draft'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'
import { advanceGameDay, SimulationAdvanceBlockedError } from './advanceGameDay'
import { continueGame, getContinueStopReason } from './ContinueFlow'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { simulateUntilDate } from './simulateUntilDate'

describe('simulation breakpoints', () => {
  it('allows advancement when there is no pending decision', () => {
    const result = evaluateSimulationBreakpoints(createAcbTestGame())
    expect(result).toMatchObject({ mayAdvance: true, level: 'BACKGROUND' })
    expect(result.candidates).toEqual([])
  })

  it.each(['INFO', 'IMPORTANT'] as const)('does not stop advancement for %s', (level) => {
    const world = createAcbTestGame()
    const result = evaluateSimulationBreakpoints(world, { additionalCandidates: [{
      level, reason: 'testNotice', sourceKind: 'NOTICE', sourceId: level, effectiveDate: world.currentDate,
      ownership: { kind: 'SYSTEM' }, diagnostic: 'Informational projection.',
    }] })
    expect(result.mayAdvance).toBe(true)
    expect(result.level).toBe(level)
  })

  it('orders simultaneous candidates by severity, date, source kind and source ID', () => {
    const world = createAcbTestGame()
    const input = ['z', 'b', 'a'].map((sourceId) => ({ level: 'IMPORTANT' as const, reason: 'test', sourceKind: sourceId === 'z' ? 'ZED' : 'ALPHA', sourceId, effectiveDate: world.currentDate, ownership: { kind: 'SYSTEM' as const }, diagnostic: sourceId }))
    const first = evaluateSimulationBreakpoints(world, { additionalCandidates: input })
    const second = evaluateSimulationBreakpoints(world, { additionalCandidates: [...input].reverse() })
    expect(first.candidates.map((item) => item.orderingKey)).toEqual(second.candidates.map((item) => item.orderingKey))
    expect(first.candidates.map((item) => item.sourceId)).toEqual(['a', 'b', 'z'])
  })

  it('stops on a user-owned draft pick, removes it after the canonical selection and preserves it through save/load', () => {
    const setup = createUserDraftWorld()
    const pending = evaluateSimulationBreakpoints(setup.world)
    expect(pending.breakpoint).toMatchObject({ level: 'ACTION_REQUIRED', reason: 'draftPick', sourceId: setup.pickId, route: 'draft' })
    expect(getContinueStopReason(setup.world)).toMatchObject({ type: 'breakpoint', breakpoint: { reason: 'draftPick', sourceId: setup.pickId } })
    expect(continueGame(setup.world).daysAdvanced).toBe(0)
    expect(() => advanceGameDay(setup.world)).toThrow(SimulationAdvanceBlockedError)
    expect(simulateUntilDate(setup.world, addDays(setup.world.currentDate, 1)).stopReason).toMatchObject({ type: 'breakpoint', breakpoint: { reason: 'draftPick', sourceId: setup.pickId } })

    const selected = makeDraftSelection(setup.world, setup.draftId, setup.userTeamId, getAvailableDraftProspects(setup.world, setup.draftId)[0]!)
    expect(evaluateSimulationBreakpoints(selected).candidates.some((item) => item.reason === 'draftPick')).toBe(false)
  }, 20_000)

  it('projects and clears a Governance request addressed to the user coach', () => {
    const base = createAcbTestGame()
    const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const issuerId = Object.values(base.coaches).find((coach) => coach.id !== base.userCoachId)!.id
    const institutionId = 'institution:breakpoint-test'
    const request = createGovernanceRequest({ id: 'request:user', institutionId, issuer: { kind: 'ACTOR', actor: { kind: 'COACH', id: issuerId } }, recipient: { kind: 'ACTOR', actor: { kind: 'COACH', id: base.userCoachId } }, category: 'OPERATIONS', summary: 'Review the operating plan', dueOn: addDays(base.currentDate, 2), origin: { kind: 'STANDALONE' } })
    const issued = createGovernanceRequestEvent({ id: 'request:user:issued', requestId: request.id, kind: 'ISSUED', effectiveOn: base.currentDate, actor: request.issuer })
    const world = updateGameWorld(base, { governanceInstitutions: [{ id: institutionId, universe: 'PROFESSIONAL_CLUB', name: 'Test club', teamIds: [userTeam.id] }], governanceRequests: [request], governanceRequestEvents: [issued] })
    expect(evaluateSimulationBreakpoints(world).breakpoint).toMatchObject({ reason: 'governanceRequest', sourceId: request.id, deadline: request.dueOn })
    expect(getContinueStopReason(world)).toMatchObject({ type: 'breakpoint', breakpoint: { reason: 'governanceRequest', sourceId: request.id } })
    expect(simulateUntilDate(world, addDays(world.currentDate, 1)).stopReason).toMatchObject({ type: 'breakpoint', breakpoint: { reason: 'governanceRequest', sourceId: request.id } })
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(world, '2032-01-02T00:00:00.000Z'))
    expect(evaluateSimulationBreakpoints(loaded).breakpoint).toEqual(evaluateSimulationBreakpoints(world).breakpoint)
    const resolved = createGovernanceRequestEvent({ id: 'request:user:z-declined', requestId: request.id, kind: 'DECLINED', effectiveOn: base.currentDate, actor: request.recipient })
    expect(evaluateSimulationBreakpoints(updateGameWorld(world, { governanceRequestEvents: [...Object.values(world.governanceRequestEventsById), resolved] })).candidates.some((item) => item.sourceId === request.id)).toBe(false)
  })

  it('projects an unresolved Governance approval only when the user coach holds the active approving appointment', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
    const institutionId = 'institution:approval-test'
    const grant = { id: 'grant:approval-test', fromBodyId: 'body:issuer', toBodyId: 'body:approver', decision: 'BUDGET' as const, grantedOn: base.currentDate }
    const decision = createGovernanceDecision({ id: 'decision:approval-test', institutionId, decisionType: 'BUDGET', proposedByBodyId: 'body:issuer', proposedOn: base.currentDate, subject: { kind: 'BUDGET', scope: 'TEAM', referenceId: team.id } })
    const participations = [
      { id: 'right:propose', authorityGrantId: grant.id, bodyId: 'body:issuer', edgeParticipant: 'DELEGATOR' as const, right: 'PROPOSE' as const },
      { id: 'right:approve', authorityGrantId: grant.id, bodyId: 'body:approver', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const },
    ]
    const proposal = createGovernanceDecisionEvent({ id: 'decision:approval-test:proposed', decisionId: decision.id, kind: 'PROPOSED', bodyId: 'body:issuer', effectiveOn: base.currentDate, authorityGrantIds: [grant.id] })
    const world = updateGameWorld(base, {
      governanceInstitutions: [{ id: institutionId, universe: 'PROFESSIONAL_CLUB', name: 'Approval test', teamIds: [team.id] }],
      governanceBodies: [{ id: 'body:issuer', institutionId, kind: 'EXECUTIVE', name: 'Executive' }, { id: 'body:approver', institutionId, kind: 'BOARD', name: 'Board' }],
      governanceAppointments: [{ id: 'appointment:user-approver', bodyId: 'body:approver', actor: { kind: 'COACH', id: base.userCoachId }, role: 'BOARD_MEMBER', startedOn: base.currentDate }],
      governanceAuthorityGrants: [grant], governanceDecisionParticipationGrants: participations,
      governanceDecisions: [decision], governanceDecisionEvents: [proposal],
    })
    expect(evaluateSimulationBreakpoints(world).breakpoint).toMatchObject({ reason: 'governanceApproval', sourceId: decision.id, actionTarget: { decisionId: decision.id } })
  })

  it('stops on a durable job offer addressed to the user coach until Career resolves it', () => {
    const base = createNewGame()
    const opening = Object.values(base.coachJobOpeningsById).find((item) => item.status === 'open')!
    const applied = applyUserCoachForJob(base, opening.id)
    const offer = Object.values(applied.world.coachJobOffersById).find((item) => item.coachId === base.userCoachId && item.status === 'pending')!
    expect(evaluateSimulationBreakpoints(applied.world).candidates).toContainEqual(expect.objectContaining({ reason: 'coachJobOffer', sourceId: offer.id, route: 'coach' }))

    const declined = declineCoachJobOffer(applied.world, offer.id)
    expect(evaluateSimulationBreakpoints(declined).candidates.some((item) => item.sourceId === offer.id)).toBe(false)
  })

  it('treats a user-owned market counteroffer as actionable while an open offer remains informational', () => {
    const base = createAcbTestGame()
    const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const negotiation = { id: 'negotiation:user-test', organizationId: userTeam.organizationId, playerId: Object.values(base.players)[0]!.id, salary: 100_000, years: 1, role: 'ROTATION' as const, agentFee: 0, status: 'OPEN' as const, round: 0 }
    const openWorld = updateGameWorld(base, { negotiations: [negotiation] })
    expect(evaluateSimulationBreakpoints(openWorld)).toMatchObject({ mayAdvance: true, breakpoint: { level: 'INFO', reason: 'marketNegotiationAwaitingExternalResponse' } })

    const counteredWorld = updateGameWorld(openWorld, { negotiations: [{ ...negotiation, status: 'COUNTERED', round: 1 }] })
    expect(evaluateSimulationBreakpoints(counteredWorld).breakpoint).toMatchObject({ level: 'ACTION_REQUIRED', reason: 'marketNegotiation', sourceId: negotiation.id, route: 'market' })
    expect(getContinueStopReason(counteredWorld)).toMatchObject({ type: 'breakpoint', breakpoint: { sourceId: negotiation.id } })
    expect(simulateUntilDate(counteredWorld, addDays(counteredWorld.currentDate, 1)).stopReason).toMatchObject({ type: 'breakpoint', breakpoint: { sourceId: negotiation.id } })
    expect(() => advanceGameDay(counteredWorld)).toThrow(SimulationAdvanceBlockedError)

    const acceptedWorld = updateGameWorld(openWorld, { negotiations: [{ ...negotiation, status: 'ACCEPTED' }] })
    expect(evaluateSimulationBreakpoints(acceptedWorld).candidates.some((item) => item.sourceId === negotiation.id)).toBe(false)
  })

  it('blocks an unsafe past-schedule day transition before mutation', () => {
    const world = createAcbTestGame()
    const game = Object.values(world.games).find((item) => item.status === 'scheduled')!
    const broken = updateGameWorld(world, { currentDate: addDays(game.date, 1) })
    expect(evaluateSimulationBreakpoints(broken).breakpoint).toMatchObject({ level: 'BLOCKING', reason: 'scheduledGameInPast', sourceId: game.id })
    expect(() => advanceGameDay(broken)).toThrow(SimulationAdvanceBlockedError)
    expect(broken.currentDate).toBe(addDays(game.date, 1))
  })

  it('stops Simulate Until Date at a user game instead of resolving it automatically', () => {
    const world = createNewGame()
    const result = simulateUntilDate(world, addDays(world.currentDate, 1))
    expect(result.daysAdvanced).toBe(0)
    expect(result.world).toBe(world)
    expect(result.stopReason).toMatchObject({ type: 'userGame', breakpoint: { level: 'ACTION_REQUIRED' } })
  })

  it('stops on media until the canonical media command resolves it', () => {
    const base = createNewGame()
    const game = Object.values(base.games).find((item) => item.status === 'scheduled' && (item.homeTeamId === Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id || item.awayTeamId === Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id))!
    const importantGame = updateGameWorld(base, { games: Object.values(base.games).map((item) => item.id === game.id ? { ...item, stakes: 'final' as never } : item) })
    const world = createPreMatchMediaOpportunity(importantGame, game.id)
    const opportunity = Object.values(world.mediaOpportunitiesById).find((item) => item.status === 'pending')!
    const stopped = simulateUntilDate(world, addDays(world.currentDate, 1))
    expect(stopped.daysAdvanced).toBe(0)
    expect(stopped.stopReason).toMatchObject({ type: 'mediaOpportunity', breakpoint: { level: 'ACTION_REQUIRED', sourceId: opportunity.id } })

    const resolved = skipMediaOpportunity(world, opportunity.id)
    expect(evaluateSimulationBreakpoints(resolved).candidates.some((item) => item.sourceId === opportunity.id)).toBe(false)
  })
})

function createUserDraftWorld() {
  let world = createNewGame()
  const nba = Object.values(world.ecosystems).find((ecosystem) => ecosystem.kind === 'nbaLike')!
  const season = Object.values(world.seasons).find((item) => world.competitions[item.competitionId]!.ecosystemId === nba.id)!
  for (const game of Object.values(world.games).filter((item) => item.seasonId === season.id)) {
    world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 100, awayScore: 90 })
  }
  world = finalizeSeason(world, season.id)
  const userTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id
  world = createDraftForCompletedSeason(world, nba.id, season.id, { rounds: 1, orderMethod: 'reverseStandings', scheduledAfterDays: 1 }, [])
  const draftId = Object.values(world.draftsById).find((draft) => draft.sourceSeasonId === season.id)!.id
  if (world.draftsById[draftId]!.prospectPlayerIds.length === 0) world = generateDraftProspects(world, draftId, Object.values(world.teams).length)
  const scheduledOn = world.draftsById[draftId]!.scheduledOn
  for (const game of Object.values(world.games).filter((item) => item.status === 'scheduled')) {
    world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 100, awayScore: 90 })
  }
  world = updateGameWorld(world, { currentDate: scheduledOn, draftPicks: Object.values(world.draftPicksById).map((pick, index) => index === 0 ? { ...pick, ownerTeamId: userTeamId } : pick) })
  world = openDraft(world, draftId)
  const pickId = getCurrentDraftPick(world, draftId)!.id
  return { world, draftId, pickId, userTeamId }
}
