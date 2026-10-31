import { expect, it } from 'vitest'
import programs from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import { validateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { createNcaaw2026FromCheckedInSources } from './Ncaaw2026RealSeason'

/** This is not a source-less toy simulation. CI runs it only after collecting
 * all 363 publicly listed NCAAW school schedules and all 56 primary-source
 * ASUN fixtures. No fabricated teams, opponents, dates or results. */
it.skipIf(process.env.BDM_NCAAW_REAL_ACCEPTANCE !== '1')(
  'creates full 363-school 32-conference real 2026-27 NCAAW sourced world and round trips Save V4',
  () => {
    const managedId = programs.genders.women.teams[0]!.id
    const seeded = createNcaaw2026FromCheckedInSources(202627, managedId)
    const world = seeded.world
    validateGameWorld(world)
    expect(Object.values(world.teams)).toHaveLength(363)
    expect(Object.values(world.players)).toHaveLength(363 * 7)
    expect(Object.values(world.coaches)).toHaveLength(363)
    expect(Object.values(world.conferencesById)).toHaveLength(32)
    expect(world.conferenceMemberships).toHaveLength(363)
    expect(Object.values(world.games).length).toBe(seeded.calendarCoverage.sourcedGames)
    expect(seeded.calendarCoverage.distinctProgramsWithGames).toBe(363)
    expect(seeded.calendarCoverage.officialAsunGames).toBe(56)
    expect(seeded.calendarCoverage.otherUnverifiedGames).toBeGreaterThan(0)
    expect(seeded.calendarCoverage.officialFullSeasonCertification).toBe(false)
    expect(Object.values(world.games).every(g => g.status === 'scheduled')).toBe(true)
    expect(Object.values(world.games).every(g => g.classification === 'conference' || g.classification === 'nonConference')).toBe(true)
    expect(Object.values(world.competitions)[0]?.rules.gameFormat.periodCount).toBe(4)
    const save = serializeGameWorldV4(world, '2026-10-31T10:00:00Z')
    const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save)))
    validateGameWorld(restored)
    expect(Object.keys(restored.teams)).toHaveLength(363)
    expect(Object.keys(restored.games)).toHaveLength(seeded.calendarCoverage.sourcedGames)
    expect(restored.conferenceMemberships).toEqual(world.conferenceMemberships)
  },
  240_000,
)
