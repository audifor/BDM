import { expect, it } from 'vitest'
import { validateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import official from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import { projectNcaaD1Real2026Fixtures, type NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'
import { createNcaaD1Real2026WorldSeed } from './NcaaD1Real2026WorldSeed'

it.each(['men', 'women'] as const)(
  'keeps all 56 official ASUN %s games and generates remaining D1 fixtures without mixing gender',
  gender => {
    const snapshot = buildNcaaD1Real2026ConferenceSnapshot(gender)
    const fixtures = (official.fixtures as NcaaD1Real2026FixtureSource[]).filter(item => item.gender === gender)
    expect(fixtures).toHaveLength(56)
    const asun = snapshot.conferences.find(c => c.name === 'Atlantic Sun Conference')!
    const policy = {
      seed: 202627, nonConferenceRounds: 2,
      conferenceGamesPerTeam: Object.fromEntries(snapshot.conferences.map(c => [c.id, c.id === asun.id ? 14 : 2])),
    }
    const created = createNcaaD1Real2026WorldSeed({
      gender, seed: 202627, managedProgramId: String(snapshot.teams[0]!.id),
      sourcedFixtures: fixtures, generatedSchedule: policy,
    })
    expect(created.fixtureCoverage).toBe('OFFICIAL_COMPLETE_CONFERENCES_PLUS_GENERATED_GAPS')
    expect(Object.keys(created.world.teams)).toHaveLength(gender === 'men' ? 365 : 363)
    const projected = projectNcaaD1Real2026Fixtures(gender, fixtures)
    expect(Object.keys(created.sourceEvidenceByGameId)).toHaveLength(56)
    for (const game of projected.games) {
      expect(created.world.games[game.id]).toEqual(game)
      expect(created.sourceEvidenceByGameId[game.id]).toBeDefined()
    }
    const teamConf = new Map(snapshot.memberships.map(item => [item.teamId, item.conferenceId]))
    const conferenceGames = Object.values(created.world.games).filter(g => g.classification === 'conference')
    const actualCounts = new Map(snapshot.teams.map(t => [t.id, 0]))
    for (const game of conferenceGames) {
      expect(teamConf.get(game.homeTeamId)).toEqual(teamConf.get(game.awayTeamId))
      actualCounts.set(game.homeTeamId, actualCounts.get(game.homeTeamId)! + 1)
      actualCounts.set(game.awayTeamId, actualCounts.get(game.awayTeamId)! + 1)
      expect(created.world.teams[game.homeTeamId]!.gender).toBe(gender === 'men' ? 'male' : 'female')
      expect(created.world.teams[game.awayTeamId]!.gender).toBe(gender === 'men' ? 'male' : 'female')
    }
    for (const team of snapshot.teams) {
      expect(actualCounts.get(team.id)).toBe(team.conferenceId === asun.id ? 14 : 2)
    }
    validateGameWorld(created.world)
    const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(created.world, '2026-11-01T00:00:00Z'))))
    expect(Object.keys(reopened.games)).toHaveLength(Object.keys(created.world.games).length)
    for (const game of projected.games) expect(reopened.games[game.id]).toEqual(game)
    expect(reopened.seasons[snapshot.seasonId]!.ncaaSchedulePolicy).toEqual(policy)
  },
  240_000,
)
