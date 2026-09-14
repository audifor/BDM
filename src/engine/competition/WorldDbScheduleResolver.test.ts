import { describe, expect, it } from 'vitest'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { listWorldDbFixturesScheduledOnLocalDateV1, resolveWorldDbFixtureSchedulesAtV1 } from './WorldDbScheduleResolver'

const baseBundle: WorldDbCompetitionBundleV1 = Object.freeze({
  schemaVersion: 1,
  source: Object.freeze({ databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' }),
  competitionSeason: Object.freeze({ competitionSeasonId: 'season:1', competitionId: 'competition:1', seasonId: '2026', editionNumber: null }),
  entries: Object.freeze([]),
  structureNodes: Object.freeze([]),
  structureEdges: Object.freeze([]),
  structureEntryAssignments: Object.freeze([]),
  fixtures: Object.freeze([
    Object.freeze({ competitionFixtureId: 'fixture:1', structureNodeId: null, matchdayId: null, fixtureOrder: 1 }),
    Object.freeze({ competitionFixtureId: 'fixture:2', structureNodeId: null, matchdayId: null, fixtureOrder: 2 }),
  ]),
  fixtureSides: Object.freeze([]),
  scheduleBlocks: Object.freeze([
    Object.freeze({ competitionScheduleBlockId: 'block:1', blockType: 'PLAYOFF', name: 'Playoffs', startDate: '2026-06-01', endDate: '2026-06-30' }),
  ]),
  scheduleSessions: Object.freeze([
    Object.freeze({ competitionScheduleSessionId: 'session:1', competitionScheduleBlockId: 'block:1', name: 'Quarterfinals', sessionOrder: 1 }),
  ]),
  scheduleSlots: Object.freeze([
    Object.freeze({ competitionScheduleSlotId: 'slot:old', scheduleBlockId: 'block:1', scheduleSessionId: 'session:1', slotOrder: 1 }),
    Object.freeze({ competitionScheduleSlotId: 'slot:new', scheduleBlockId: 'block:1', scheduleSessionId: 'session:1', slotOrder: 2 }),
    Object.freeze({ competitionScheduleSlotId: 'slot:2', scheduleBlockId: 'block:1', scheduleSessionId: 'session:1', slotOrder: 3 }),
  ]),
  scheduleSlotTimings: Object.freeze([
    Object.freeze({ competitionScheduleSlotTimingHistoryId: 'timing:old', competitionScheduleSlotId: 'slot:old', timingState: 'CONFIRMED', localDate: '2026-06-02', localTime: '19:00', timeZone: 'Europe/Madrid', validFrom: '2026-05-01T00:00:00Z', validTo: '2026-05-20T00:00:00Z' }),
    Object.freeze({ competitionScheduleSlotTimingHistoryId: 'timing:new', competitionScheduleSlotId: 'slot:new', timingState: 'CONFIRMED', localDate: '2026-06-04', localTime: '20:30', timeZone: 'Europe/Madrid', validFrom: '2026-05-20T00:00:00Z', validTo: null }),
    Object.freeze({ competitionScheduleSlotTimingHistoryId: 'timing:2', competitionScheduleSlotId: 'slot:2', timingState: 'CONFIRMED', localDate: '2026-06-04', localTime: '18:00', timeZone: 'Europe/Madrid', validFrom: null, validTo: null }),
  ]),
  fixtureScheduleAllocations: Object.freeze([
    Object.freeze({ competitionFixtureScheduleAllocationId: 'allocation:old', competitionFixtureId: 'fixture:1', competitionScheduleSlotId: 'slot:old', status: 'SUPERSEDED', validFrom: '2026-05-01T00:00:00Z', validTo: '2026-05-20T00:00:00Z' }),
    Object.freeze({ competitionFixtureScheduleAllocationId: 'allocation:new', competitionFixtureId: 'fixture:1', competitionScheduleSlotId: 'slot:new', status: 'ACTIVE', validFrom: '2026-05-20T00:00:00Z', validTo: null }),
    Object.freeze({ competitionFixtureScheduleAllocationId: 'allocation:2', competitionFixtureId: 'fixture:2', competitionScheduleSlotId: 'slot:2', status: 'ACTIVE', validFrom: null, validTo: null }),
  ]),
  rulePayloads: Object.freeze({}),
})

describe('WorldDbScheduleResolver', () => {
  it('resolves historical and current allocation/timing rows by validity interval without interpreting statuses', () => {
    const before = resolveWorldDbFixtureSchedulesAtV1(baseBundle, '2026-05-10T12:00:00Z')
    expect(before['fixture:1']).toMatchObject({
      allocationId: 'allocation:old',
      allocationStatus: 'SUPERSEDED',
      competitionScheduleSlotId: 'slot:old',
      timing: { timingHistoryId: 'timing:old', timingState: 'CONFIRMED', localDate: '2026-06-02' },
    })

    const after = resolveWorldDbFixtureSchedulesAtV1(baseBundle, '2026-05-25T12:00:00Z')
    expect(after['fixture:1']).toMatchObject({
      allocationId: 'allocation:new',
      allocationStatus: 'ACTIVE',
      competitionScheduleSlotId: 'slot:new',
      timing: { timingHistoryId: 'timing:new', localDate: '2026-06-04', localTime: '20:30' },
    })
  })

  it('lists a local date deterministically by local time, slot order and fixture id', () => {
    const resolved = resolveWorldDbFixtureSchedulesAtV1(baseBundle, '2026-05-25T12:00:00Z')
    expect(listWorldDbFixturesScheduledOnLocalDateV1(resolved, '2026-06-04').map((row) => row.competitionFixtureId)).toEqual([
      'fixture:2',
      'fixture:1',
    ])
  })

  it('returns null for an unscheduled fixture and permits an allocated slot without active timing', () => {
    const bundle: WorldDbCompetitionBundleV1 = {
      ...baseBundle,
      fixtureScheduleAllocations: Object.freeze([]),
      scheduleSlotTimings: Object.freeze([]),
    }
    const resolved = resolveWorldDbFixtureSchedulesAtV1(bundle, '2026-05-25T12:00:00Z')
    expect(resolved['fixture:1']).toBeNull()
    expect(resolved['fixture:2']).toBeNull()

    const allocated: WorldDbCompetitionBundleV1 = {
      ...bundle,
      fixtureScheduleAllocations: Object.freeze([
        Object.freeze({ competitionFixtureScheduleAllocationId: 'allocation:x', competitionFixtureId: 'fixture:1', competitionScheduleSlotId: 'slot:new', status: 'PENDING', validFrom: null, validTo: null }),
      ]),
    }
    expect(resolveWorldDbFixtureSchedulesAtV1(allocated, '2026-05-25T12:00:00Z')['fixture:1']?.timing).toBeNull()
  })

  it('rejects overlapping active histories and broken references instead of choosing implicitly', () => {
    const overlapping: WorldDbCompetitionBundleV1 = {
      ...baseBundle,
      fixtureScheduleAllocations: Object.freeze([
        ...(baseBundle.fixtureScheduleAllocations ?? []),
        Object.freeze({ competitionFixtureScheduleAllocationId: 'allocation:conflict', competitionFixtureId: 'fixture:1', competitionScheduleSlotId: 'slot:old', status: 'ACTIVE', validFrom: '2026-05-21T00:00:00Z', validTo: null }),
      ]),
    }
    expect(() => resolveWorldDbFixtureSchedulesAtV1(overlapping, '2026-05-25T12:00:00Z')).toThrow('multiple active schedule allocations')

    const broken: WorldDbCompetitionBundleV1 = {
      ...baseBundle,
      fixtureScheduleAllocations: Object.freeze([
        Object.freeze({ competitionFixtureScheduleAllocationId: 'allocation:broken', competitionFixtureId: 'fixture:1', competitionScheduleSlotId: 'slot:missing', status: 'ACTIVE', validFrom: null, validTo: null }),
      ]),
    }
    expect(() => resolveWorldDbFixtureSchedulesAtV1(broken, '2026-05-25T12:00:00Z')).toThrow('unknown schedule slot')
  })
})
