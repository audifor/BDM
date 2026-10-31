import { expect, it } from 'vitest'
import { validateGameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import source from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'
import { createNcaaD1Real2026WorldSeed } from './NcaaD1Real2026WorldSeed'
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
      expect(Object.values(world.games)).toHaveLength(1)
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
