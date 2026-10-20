import { describe, expect, it } from 'vitest'
import { ACB_2026_27_TEAMS, ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { getPlayerContractStatus } from '@/domain/contract'
import { getTeamFinancialSnapshot, getTeamRoster, getTeamStaffAssignments, getTeamStaffPayroll, validateGameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getEligiblePlayersForCompetition } from '@/engine/eligibility'
import { repairRosterContractIntegrity } from '@/engine/market/RosterContractIntegrity'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { createConfiguredGameAsync } from './createConfiguredGame'
import { advanceGameDay } from './advanceGameDay'
import { continueGameAsync } from './ContinueFlow'
import { createInlineMatchRunner } from '@/app/matchNext/MatchSimulationRunner'
import { isAcbSyntheticFreeAgentId } from './AcbSyntheticFreeAgentPool'

const coach = {
  firstName: 'Elena', lastName: 'Piloto', dateOfBirth: '1990-01-01', gender: 'female',
  nationalityCountryCode: 'ESP', background: 'rookie', ambition: 'firstTitle',
  coachingStyle: 'balanced', disposition: 'balanced', biography: 'F0 synthetic test coach.',
} as const
const savedAt = '2026-10-19T17:00:00.000Z'

describe('F0 playable ACB career', () => {
  it.each(ACB_2026_27_TEAMS.map(({ key, name }) => [key, name]))('starts %s on July 1 without WorldDB', async (key, name) => {
    const world = await createConfiguredGameAsync({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: key, userCoachCreation: coach })
    expect(() => validateGameWorld(world)).not.toThrow()
    expect(world.currentDate).toBe('2026-07-01')
    expect(getUserTeam(world)?.name).toBe(name)
    expect(world.coaches[world.userCoachId]).toMatchObject({ firstName: coach.firstName, lastName: coach.lastName })
    expect(Object.values(world.teams)).toHaveLength(18)
    const rosterIds = Object.values(world.teams).flatMap(team => team.rosterPlayerIds)
    // Every rostered player sits on exactly one roster; the only unsigned players are the 15 identified synthetic free agents (F3).
    const unsigned = Object.keys(world.players).filter(id => !rosterIds.includes(id as never))
    expect(unsigned).toHaveLength(15)
    expect(unsigned.every(isAcbSyntheticFreeAgentId)).toBe(true)
    expect(new Set(rosterIds).size).toBe(rosterIds.length)
    expect(rosterIds).toHaveLength(Object.keys(world.players).length - 15)
    const season = world.seasons[world.currentSeasonId]!
    const games = Object.values(world.games)
    expect(games).toHaveLength(306)
    expect(new Set(games.map(game => game.id)).size).toBe(306)
    expect(new Set(games.map(game => game.date)).size).toBe(34)
    expect(games.every(game => game.date >= season.startDate && game.date <= season.endDate)).toBe(true)
    for (const team of Object.values(world.teams)) {
      const roster = getTeamRoster(world, team.id)
      expect(roster.length).toBeGreaterThanOrEqual(10)
      expect(getEligiblePlayersForCompetition(world, team.id, season.competitionId, season.id, world.currentDate)).toHaveLength(roster.length)
      expect(getTeamStaffAssignments(world, team.id).some(assignment => assignment.role === 'headCoach')).toBe(true)
      expect(getTeamFinancialSnapshot(world, team.id).remainingPlayerSalaryBudget).toBeGreaterThanOrEqual(0)
      expect(getTeamStaffPayroll(world, team.id).remainingBudget).toBeGreaterThanOrEqual(0)
      for (const player of roster) {
        const contracts = Object.values(world.contractsById).filter(contract => contract.playerId === player.id && getPlayerContractStatus(contract, world.currentDate) === 'active')
        expect(contracts).toHaveLength(1)
        expect(contracts[0]!.teamId).toBe(team.id)
      }
      const fixtures = games.filter(game => game.homeTeamId === team.id || game.awayTeamId === team.id)
      expect(fixtures).toHaveLength(34)
      expect(new Set(fixtures.map(game => game.date)).size).toBe(34)
      expect(fixtures.filter(game => game.homeTeamId === team.id)).toHaveLength(17)
    }
    expect(getNextUserGame(world)?.date).toBe(season.startDate)
    expect(repairRosterContractIntegrity(world).world).toBe(world)
  })

  it('preserves the complete Save V4 world after closing, loading and continuing', async () => {
    const initial = await createConfiguredGameAsync({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: 'rmb', userCoachCreation: coach })
    let file = ''
    const repository: GameSaveRepository = {
      save: async json => { file = json }, load: async () => file, getInfo: async () => ({ savedAt }),
    }
    await saveCurrentGame(initial, repository, savedAt)
    expect(JSON.parse(file).schemaVersion).toBe(4)
    const loaded = await loadSavedGame(repository)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(initial))
    expect(serializeGameWorldV4(loaded, savedAt)).toEqual(serializeGameWorldV4(initial, savedAt))
    expect(getNextUserGame(loaded)).toEqual(getNextUserGame(initial))
    const continued = advanceGameDay(loaded, () => 20260701)
    expect(continued.currentDate).toBe('2026-07-02')
    expect(projectPersistentWorldTruth(continued)).toEqual(projectPersistentWorldTruth(advanceGameDay(initial, () => 20260701)))
    await saveCurrentGame(continued, repository, savedAt)
    expect(projectPersistentWorldTruth(await loadSavedGame(repository))).toEqual(projectPersistentWorldTruth(continued))
    const resumed = await continueGameAsync(loaded, createInlineMatchRunner(), 7, () => 20260701)
    expect(resumed.daysAdvanced).toBeGreaterThan(0)
  }, 30_000)
})
