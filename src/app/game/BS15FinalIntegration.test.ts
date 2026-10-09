import { initializeMarketAgents } from '@/engine/market/MarketEngine'
import { describe, expect, it } from 'vitest'
import { updateGameWorld, getWorldValidationReport } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createFacilityClubScenario } from '@/app/facilities/testFixtures'
import { startClubFacilityProject } from '@/app/facilities/FacilityProjectCommands'
import { buildClubFacilitiesWorkspaceModel } from '@/app/facilities/ClubFacilitiesReadModel'
import { createGovernanceClubScenario, withPendingBudgetDecision } from '@/app/governance/testFixtures'
import { buildClubGovernanceModel } from '@/app/governance/BoardGovernanceReadModel'
import { resolveTradeSeasonAuthorityForTeam } from '@/engine/trade/TradeSeasonAuthority'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { getScheduledGamesToday } from '@/engine/calendar'
import { advanceGameDayWithResult, advanceGameDayWithResultAsync } from './advanceGameDay'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import { createNewGame } from './createNewGame'
import { withShortGameFormat } from './testFixtures'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('BS15 final merged-world coexistence', () => {
  it('preserves Talent, Board, funded Facilities, Trade/Market and mixed WorldSim through a short day and Save V4', async () => {
    const facility = createFacilityClubScenario()
    const governance = createGovernanceClubScenario()
    let world = updateGameWorld(facility.world, {
      governanceInstitutions: Object.values(governance.world.governanceInstitutionsById),
      governanceBodies: Object.values(governance.world.governanceBodiesById),
      governanceAuthorityGrants: Object.values(governance.world.governanceAuthorityGrantsById),
      governanceDecisionParticipationGrants: Object.values(governance.world.governanceDecisionParticipationGrantsById),
      governanceAppointments: Object.values(governance.world.governanceAppointmentsById),
    })
    world = withPendingBudgetDecision({ ...governance, world }).world
    const started = startClubFacilityProject(world, { teamId: facility.teamId, projectId: facility.scheduledProjectId, startedAt: facility.asOf, commitment: { currencyCode: 'EUR', minorUnits: 3_000_000 } })
    expect(started.status).toBe('APPLIED')
    world = started.world
    const cohort = Object.values(world.talentCohortsById).find(item => item.candidateCapacity > 0)!
    const candidate = materializeTalentCandidate(world, cohort.id, 1, 'SCOUTING_DISCOVERY')
    world = withShortGameFormat(initializeMarketAgents(candidate.world), 0.1)
    const source = serializeGameWorldV4(world, savedAt)
    const settings = { level: 'MINIMAL' as const, highDetailCompetitionIds: [], lowDetailCompetitionIds: [], promoteKnockoutGames: false }
    const sync = advanceGameDayWithResult(world, () => 15015, ['userGame'], { simulationDetail: settings })
    const runner = createInlineMatchRunner()
    const asyncResult = await advanceGameDayWithResultAsync(world, runner, () => 15015, ['userGame'], { simulationDetail: settings })
    runner.dispose()
    expect(sync.failure).toBeUndefined()
    expect(sync.status).not.toBe('BREAKPOINT_PREVENTED')
    expect(asyncResult.failure).toBeUndefined()
    expect(serializeGameWorldV4(asyncResult.world, savedAt)).toEqual(serializeGameWorldV4(sync.world, savedAt))
    expect(serializeGameWorldV4(world, savedAt)).toEqual(source)
    expect(sync.phases.filter(phase => phase.phaseId === 'DAY_PUBLICATION')).toHaveLength(1)
    expect(new Set(sync.phases.map(phase => phase.phaseId)).size).toBe(sync.phases.length)
    expect(getWorldValidationReport(sync.world)?.mode).toBe('incremental')
    const logs = getScheduledGamesToday(world).map(game => sync.world.matchStatLogsByGameId[game.id]!)
    expect(logs.some(log => log.resolution === 'FAST')).toBe(true)
    expect(logs.some(log => log.resolution === 'BACKGROUND')).toBe(true)
    const matchEvidence = Object.values(sync.world.developmentStimulusEventsById).filter(event => event.sourceType === 'match')
    for (const log of logs) for (const line of log.playerLines.filter(line => line.stats.secondsPlayed > 0)) {
      expect(matchEvidence.filter(event => event.sourceId === log.gameId && event.playerId === line.playerId)).toHaveLength(1)
    }
    const restored = deserializeGameWorldV4(serializeGameWorldV4(sync.world, savedAt))
    expect(serializeGameWorldV4(deserializeGameWorldV4(serializeGameWorldV4(restored, savedAt)), savedAt)).toEqual(serializeGameWorldV4(restored, savedAt))
    expect(buildClubGovernanceModel(restored, facility.teamId).bodies).toHaveLength(3)
    expect(buildClubGovernanceModel(restored, facility.teamId).decisions).toHaveLength(1)
    expect(buildClubFacilitiesWorkspaceModel(restored, facility.teamId)).toEqual(buildClubFacilitiesWorkspaceModel(sync.world, facility.teamId))
    const tradeSeason = Object.values(restored.seasons).find(season => restored.tradeRulesBySeasonId[season.id] !== undefined && restored.competitions[season.competitionId]!.gender === 'male')!
    const tradeTeam = restored.competitions[tradeSeason.competitionId]!.participantTeamIds[0]!
    const tradeAuthority = resolveTradeSeasonAuthorityForTeam(restored, tradeTeam, tradeSeason.startDate)
    expect(tradeAuthority, JSON.stringify({ tradeTeam, tradeSeason, rules: restored.tradeRulesBySeasonId[tradeSeason.id], ecosystem: restored.ecosystems[restored.competitions[tradeSeason.competitionId]!.ecosystemId] })).toBeDefined()
    expect(tradeAuthority?.rules.tradeWindow?.closesOn).toBeDefined()
    expect(restored.marketRealityByPlayerId).toEqual(sync.world.marketRealityByPlayerId)
    expect(Object.keys(restored.marketRealityByPlayerId).length).toBeGreaterThan(0)
    const again = materializeTalentCandidate(restored, cohort.id, 1, 'SCOUTING_DISCOVERY')
    expect(again.created).toBe(false)
    expect(again.player.id).toBe(candidate.player.id)
    expect(restored.playerEnrollmentsById).toEqual(sync.world.playerEnrollmentsById)
  }, 120_000)
  it.each(['FULL', 'STANDARD', 'BACKGROUND'] as const)('honors explicit %s with the same sync/async authority and immutable match evidence', async forceDetail => {
    const world = withShortGameFormat(createNewGame(), 0.1)
    const sync = advanceGameDayWithResult(world, () => 15015, ['userGame'], { forceDetail })
    const runner = createInlineMatchRunner()
    const asyncResult = await advanceGameDayWithResultAsync(world, runner, () => 15015, ['userGame'], { forceDetail })
    runner.dispose()
    expect(sync.failure).toBeUndefined()
    expect(asyncResult.failure).toBeUndefined()
    expect(serializeGameWorldV4(asyncResult.world, savedAt)).toEqual(serializeGameWorldV4(sync.world, savedAt))
    const expected = forceDetail === 'STANDARD' ? 'FAST' : forceDetail
    for (const game of getScheduledGamesToday(world)) expect(sync.world.matchStatLogsByGameId[game.id]?.resolution).toBe(expected)
  }, 120_000)

})
