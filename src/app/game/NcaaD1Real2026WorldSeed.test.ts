import { expect, it } from 'vitest'
import { validateGameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import source from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import { createNcaaD1Real2026WorldSeed } from './NcaaD1Real2026WorldSeed'
import { createNcaaD1Real2026Universe } from './NcaaD1Real2026Universe'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import { simulateAndApplyGame } from './matchResolution'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'

it.skipIf(process.env.BDM_NCAA_GENERATED_ACCEPTANCE !== '1')(
  'plays and saves a real match in each full NCAA world with generated test schedules',
  () => {
    for (const gender of ['men', 'women'] as const) {
      const snapshot = buildNcaaD1Real2026ConferenceSnapshot(gender)
      // Minimal test policy, deliberately not presented as an official competition format.
      const generatedSchedule = { seed: 202627, nonConferenceRounds: 2, conferenceGamesPerTeam: Object.fromEntries(snapshot.conferences.map(c => [c.id, 2])) }
      const started = performance.now()
      const created = createNcaaD1Real2026WorldSeed({ gender, seed: 202627, managedProgramId: String(snapshot.teams[0]!.id), generatedSchedule })
      const createdAt = performance.now()
      expect(created.fixtureCoverage).toBe('GENERATED_FROM_EXPLICIT_CONFERENCE_RULES')
      expect(Object.keys(created.sourceEvidenceByGameId)).toHaveLength(0)
      expect(Object.keys(created.world.teams)).toHaveLength(gender === 'men' ? 365 : 363)
      expect(Object.keys(created.world.players)).toHaveLength(snapshot.teams.length * 12)
      validateGameWorld(created.world)
      const validatedAt = performance.now()
      const game = Object.values(created.world.games)[0]!
      expect(Object.values(created.world.playerEnrollmentsById).filter(e => e.status === 'active')).toHaveLength(snapshot.teams.length * 12)
      expect(Object.keys(created.world.academicProfilesById)).toHaveLength(snapshot.teams.length * 12)
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        expect(getAvailablePlayersForCompetition(created.world, teamId, game.competitionId, game.seasonId, game.date)).toHaveLength(12)
        expect(created.world.teams[teamId]!.rosterPlayerIds.every(id => created.world.players[id]!.gender === (gender === 'men' ? 'male' : 'female'))).toBe(true)
      }
      const played = simulateAndApplyGame(created.world, game, 123)
      const playedAt = performance.now()
      expect(played.games[game.id]?.status).toBe('completed')
      expect(played.matchStatLogsByGameId[game.id]).toBeDefined()
      const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(played, '2026-10-31T09:00:00Z'))))
      expect(reopened.games[game.id]?.status).toBe('completed')
      expect(Object.keys(reopened.games)).toHaveLength(Object.keys(played.games).length)
      expect(reopened.seasons[game.seasonId]?.ncaaSchedulePolicy).toEqual(generatedSchedule)
      process.stdout.write(`NCAA ${gender} ms: create=${Math.round(createdAt-started)} validate=${Math.round(validatedAt-createdAt)} match=${Math.round(playedAt-validatedAt)} save+load=${Math.round(performance.now()-playedAt)}\n`)
    }
  },
  240_000,
)

it.skipIf(process.env.BDM_NCAA_GENERATED_ACCEPTANCE !== '1')(
  'plays both categories in a shared NCAA world without crossing their teams',
  () => {
    const men = buildNcaaD1Real2026ConferenceSnapshot('men')
    const women = buildNcaaD1Real2026ConferenceSnapshot('women')
    const policy = (snapshot: typeof men) => ({ seed: 202627, nonConferenceRounds: 2, conferenceGamesPerTeam: Object.fromEntries(snapshot.conferences.map(c => [c.id, 2])) })
    const created = createNcaaD1Real2026Universe({ seed: 202627, managedGender: 'women', managedProgramId: String(women.teams[0]!.id), generatedSchedules: { men: policy(men), women: policy(women) } })
    let world = created.world
    expect(Object.keys(world.teams)).toHaveLength(728)
    for (const gender of ['male', 'female'] as const) {
      const game = Object.values(world.games).find(g => world.teams[g.homeTeamId]!.gender === gender)!
      expect(world.teams[game.awayTeamId]!.gender).toBe(gender)
      expect(getAvailablePlayersForCompetition(world, game.homeTeamId, game.competitionId, game.seasonId, game.date)).toHaveLength(12)
      world = simulateAndApplyGame(world, game, 123)
      expect(world.games[game.id]?.status).toBe('completed')
      expect(world.matchStatLogsByGameId[game.id]).toBeDefined()
    }
    const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-31T09:00:00Z'))))
    expect(Object.values(reopened.games).filter(g => g.status === 'completed')).toHaveLength(2)
  },
  240_000,
)

/** Explicit full-scale acceptance on the developer's runner.
 * npm run typecheck always checks this code; normal CI does NOT certify the
 * 365/363-person worlds or claim full real NCAA sporting execution.
 *
 * BDM_NCAA_REAL_NATIVE_ACCEPTANCE=1 npx vitest run src/app/game/NcaaD1Real2026WorldSeed.test.ts --maxWorkers=1
 */
it.skipIf(process.env.BDM_NCAA_REAL_NATIVE_ACCEPTANCE !== '1')(
  'constructs both full-size 2026-27 NCAA male/female worlds with actual schools, official fixtures and Save V4',
  () => {
    const fixtures = source.fixtures as NcaaD1Real2026FixtureSource[]
    for (const gender of ['men', 'women'] as const) {
      const scheduled = fixtures.filter(f => f.gender === gender)
      const created = createNcaaD1Real2026WorldSeed({
        gender, seed: 202627, managedProgramId: scheduled[0]!.homeProgramId,
        sourcedFixtures: scheduled,
      })
      const world = created.world
      validateGameWorld(world)
      expect(Object.values(world.teams)).toHaveLength(gender === 'men' ? 365 : 363)
      expect(Object.values(world.players)).toHaveLength((gender === 'men' ? 365 : 363) * 12)
      expect(Object.values(world.coaches)).toHaveLength(gender === 'men' ? 365 : 363)
      expect(world.conferenceMemberships).toHaveLength(gender === 'men' ? 365 : 363)
      expect(Object.values(world.conferencesById)).toHaveLength(32)
      expect(Object.values(world.games)).toHaveLength(56)
      expect(Object.values(world.games)[0]?.classification).toBe('conference')
      expect(Object.values(world.games)[0]?.status).toBe('scheduled')
      expect(world.competitions[Object.values(world.competitions)[0]!.id]?.rules.gameFormat.periodCount)
        .toBe(gender === 'men' ? 2 : 4)
      expect(created.fixtureCoverage).toBe('PARTIAL_OFFICIALLY_SOURCED')
      expect(Object.keys(created.sourceEvidenceByGameId).sort()).toEqual(Object.keys(world.games).sort())
      expect(Object.values(created.sourceEvidenceByGameId)[0]?.url).toContain('asunsports.org')
      const save = serializeGameWorldV4(world, '2026-10-31T09:00:00Z')
      const roundtripped = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save)))
      validateGameWorld(roundtripped)
      expect(Object.keys(roundtripped.teams).length).toBe(Object.keys(world.teams).length)
      expect(Object.keys(roundtripped.games)).toEqual(Object.keys(world.games))
      expect(roundtripped.conferenceMemberships).toEqual(world.conferenceMemberships)
    }
  },
  180_000,
)

it.skipIf(process.env.BDM_NCAA_REAL_NATIVE_ACCEPTANCE !== '1')(
  'rejects 2018 PBM program identities and mixed gender during 2026-27 NCAA world construction',
  () => {
    const fixture = source.fixtures[0]! as NcaaD1Real2026FixtureSource
    const config = { gender: 'men' as const, seed: 202627, managedProgramId: fixture.homeProgramId, sourcedFixtures: [fixture] }
    expect(() => createNcaaD1Real2026WorldSeed({ ...config, managedProgramId: 'pbm:DYN_equipe:353' }))
      .toThrow(/current program/)
  },
  180_000,
)

it.skipIf(process.env.BDM_NCAA_REAL_NATIVE_ACCEPTANCE !== '1')(
  'keeps both real 2026-27 NCAA categories in one native GameWorld with separate seasons and Save V4',
  () => {
    const fixtures = source.fixtures as NcaaD1Real2026FixtureSource[]
    const managed = fixtures.find(fixture => fixture.gender === 'women')!.homeProgramId
    const created = createNcaaD1Real2026Universe({
      seed: 202627,
      managedGender: 'women',
      managedProgramId: managed,
      sourcedFixtures: fixtures,
    })
    const world = created.world
    validateGameWorld(world)
    expect(Object.values(world.teams)).toHaveLength(728)
    expect(Object.values(world.players)).toHaveLength(728 * 12)
    expect(Object.values(world.coaches)).toHaveLength(728)
    expect(Object.values(world.conferencesById)).toHaveLength(64)
    expect(world.conferenceMemberships).toHaveLength(728)
    expect(Object.values(world.seasons)).toHaveLength(2)
    expect(Object.values(world.competitions)).toHaveLength(2)
    expect(Object.values(world.games)).toHaveLength(112)
    expect(world.currentSeasonId).toContain('women')
    expect(Object.values(world.games).every(game => game.classification === 'conference')).toBe(true)
    expect(new Set(Object.values(world.teams).map(team => team.gender))).toEqual(new Set(['male', 'female']))
    const genders = Object.values(world.competitions).map(competition => [competition.gender, competition.rules.gameFormat.periodCount] as const)
    expect(genders).toContainEqual(['male', 2])
    expect(genders).toContainEqual(['female', 4])
    expect(Object.keys(created.officialFixtureSourceByGameId)).toHaveLength(112)
    expect(created.formatCertification).toBe('BLOCKED_SEASONS_AND_TOURNAMENTS_NOT_CONNECTED')
    const save = serializeGameWorldV4(world, '2026-10-31T09:00:00Z')
    const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save)))
    validateGameWorld(reopened)
    expect(Object.keys(reopened.teams)).toHaveLength(728)
    expect(Object.keys(reopened.seasons)).toHaveLength(2)
    expect(Object.keys(reopened.games)).toHaveLength(112)
    expect(reopened.conferenceMemberships).toHaveLength(728)
  },
  240_000,
)
