import { describe, expect, it } from 'vitest'
import { assertWorldDbCompetitionBundleV1 } from './CompetitionBundle'

function baseBundle(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: { competitionSeasonId: 'season:1', competitionId: 'competition:1', seasonId: '2026', editionNumber: null },
    entries: [],
    structureNodes: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {},
  }
}

describe('WorldDbCompetitionBundleV1 schedule extension', () => {
  it('keeps older v1 in-memory bundles valid when schedule rows are absent', () => {
    const value = baseBundle()
    expect(() => assertWorldDbCompetitionBundleV1(value)).not.toThrow()
  })

  it('accepts canonical schedule row arrays additively', () => {
    const value = {
      ...baseBundle(),
      scheduleBlocks: [{ competitionScheduleBlockId: 'block:1', blockType: 'ROUND', name: null, startDate: '2026-06-01', endDate: '2026-06-08' }],
      scheduleSessions: [{ competitionScheduleSessionId: 'session:1', competitionScheduleBlockId: 'block:1', name: 'QF', sessionOrder: 1 }],
      scheduleSlots: [{ competitionScheduleSlotId: 'slot:1', scheduleBlockId: 'block:1', scheduleSessionId: 'session:1', slotOrder: 1 }],
      scheduleSlotTimings: [{ competitionScheduleSlotTimingHistoryId: 'timing:1', competitionScheduleSlotId: 'slot:1', timingState: 'CONFIRMED', localDate: '2026-06-02', localTime: '19:00', timeZone: 'Europe/Madrid', validFrom: null, validTo: null }],
      fixtureScheduleAllocations: [{ competitionFixtureScheduleAllocationId: 'alloc:1', competitionFixtureId: 'fixture:1', competitionScheduleSlotId: 'slot:1', status: 'ACTIVE', validFrom: null, validTo: null }],
    }
    expect(() => assertWorldDbCompetitionBundleV1(value)).not.toThrow()
  })

  it('rejects malformed schedule collection shapes', () => {
    const value = { ...baseBundle(), scheduleSlots: {} }
    expect(() => assertWorldDbCompetitionBundleV1(value)).toThrow('schedule slots')
  })
})
