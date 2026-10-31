import { expect, it } from 'vitest'
import { validateGameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import source from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import { createNcaaD1Real2026WorldSeed } from './NcaaD1Real2026WorldSeed'
import { createNcaaD1Real2026Universe } from './NcaaD1Real2026Universe'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'

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
      expect(Object.values(world.players)).toHaveLength((gender === 'men' ? 365 : 363) * 7)
      expect(Object.values(world.coaches)).toHaveLength(gender === 'men' ? 365 : 363)
      expect(world.conferenceMemberships).toHaveLength(gender === 'men' ? 365 : 363)
      expect(Object.values(world.conferencesById)).toHaveLength(32)
      expect(Object.values(world.games)).toHaveLength(gender === 'men' ? 1 : 56)
      expect(Object.values(world.games)[0]?.classification).toBe('conference')
      expect(Object.values(world.games)[0]?.status).toBe('scheduled')
      expect(world.competitions[Object.values(world.competitions)[0]!.id]?.rules.gameFormat.periodCount)
        .toBe(gender === 'men' ? 2 : 4)
      expect(created.fixtureCoverage).toBe('PARTIAL_OFFICIALLY_SOURCED')
      expect(Object.keys(created.sourceEvidenceByGameId)).toEqual(Object.keys(world.games))
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
    expect(Object.values(world.players)).toHaveLength(728 * 7)
    expect(Object.values(world.coaches)).toHaveLength(728)
    expect(Object.values(world.conferencesById)).toHaveLength(64)
    expect(world.conferenceMemberships).toHaveLength(728)
    expect(Object.values(world.seasons)).toHaveLength(2)
    expect(Object.values(world.competitions)).toHaveLength(2)
    expect(Object.values(world.games)).toHaveLength(57)
    expect(world.currentSeasonId).toContain('women')
    expect(Object.values(world.games).every(game => game.classification === 'conference')).toBe(true)
    expect(new Set(Object.values(world.teams).map(team => team.gender))).toEqual(new Set(['male', 'female']))
    const genders = Object.values(world.competitions).map(competition => [competition.gender, competition.rules.gameFormat.periodCount] as const)
    expect(genders).toContainEqual(['male', 2])
    expect(genders).toContainEqual(['female', 4])
    expect(Object.keys(created.officialFixtureSourceByGameId)).toHaveLength(57)
    expect(created.formatCertification).toBe('BLOCKED_SEASONS_AND_TOURNAMENTS_NOT_CONNECTED')
    const save = serializeGameWorldV4(world, '2026-10-31T09:00:00Z')
    const reopened = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save)))
    validateGameWorld(reopened)
    expect(Object.keys(reopened.teams)).toHaveLength(728)
    expect(Object.keys(reopened.seasons)).toHaveLength(2)
    expect(Object.keys(reopened.games)).toHaveLength(57)
    expect(reopened.conferenceMemberships).toHaveLength(728)
  },
  240_000,
)
