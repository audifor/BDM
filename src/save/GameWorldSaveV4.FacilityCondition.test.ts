import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { componentConditionAt, componentServiceabilityAt, createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityConditionRecord, createPlace } from '@/domain/facilities'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2035-01-01T00:00:00.000Z'

/**
 * CFI4 introduces two new normalized GameWorld collections (`facilityComponentConditionRecordsById`,
 * `facilityConditionRecordsById`). This file adds only the persistence tests those two new
 * collections need, following CFI2S's certified Save V4 pattern exactly (per-collection parser
 * with `exactKeys`, canonical factory reconstruction, `hasOwnProperty`-gated backward
 * compatibility) — CFI2S/CFI3's own round-trip tests already fully cover every other Facilities
 * collection and are unaffected by this addition.
 */
describe('GameWorldSaveV4 — Condition, Standard & Serviceability (CFI4) persistence', () => {
  it('round-trips a FacilityComponentConditionRecord with a known condition, serviceability, technical standard and notes', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:condition-1', kind: 'CAMPUS', name: 'Condition Campus 1' })
    const facility = createFacility({ id: 'facility:condition-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Condition Center 1' })
    const court = createFacilityComponent({ id: 'component:condition-1', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:save-1', componentId: court.id, effectiveFrom: '2020-01-01', physicalCondition: 74, serviceability: 'FULL', technicalStandard: 'ADVANCED', notes: 'Resurfaced in 2020' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityComponentConditionRecordsById).toEqual(world.facilityComponentConditionRecordsById)
    expect(restored.facilityComponentConditionRecordsById[record.id]!.physicalCondition).toBe(74)
    expect(restored.facilityComponentConditionRecordsById[record.id]!.technicalStandard).toBe('ADVANCED')
  })

  it('round-trips a FacilityComponentConditionRecord with an unknown (null) physical condition and technical standard, never falsifying them to a default', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:condition-2', kind: 'CAMPUS', name: 'Condition Campus 2' })
    const facility = createFacility({ id: 'facility:condition-2', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Condition Center 2' })
    const court = createFacilityComponent({ id: 'component:condition-2', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:save-2', componentId: court.id, effectiveFrom: '2020-01-01', serviceability: 'FULL' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityComponentConditionRecordsById[record.id]!.physicalCondition).toBeNull()
    expect(restored.facilityComponentConditionRecordsById[record.id]!.technicalStandard).toBeNull()
    expect(restored.facilityComponentConditionRecordsById[record.id]!.notes).toBeNull()
  })

  it('round-trips historical condition periods, and componentConditionAt resolves identically before and after reload', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:condition-3', kind: 'CAMPUS', name: 'Condition Campus 3' })
    const facility = createFacility({ id: 'facility:condition-3', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Condition Center 3' })
    const court = createFacilityComponent({ id: 'component:condition-3', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const records = [
      createFacilityComponentConditionRecord({ id: 'condition:save-3-a', componentId: court.id, effectiveFrom: '2027-01-01', effectiveTo: '2028-12-31', physicalCondition: 90, serviceability: 'FULL' }),
      createFacilityComponentConditionRecord({ id: 'condition:save-3-b', componentId: court.id, effectiveFrom: '2029-01-01', physicalCondition: 61, serviceability: 'LIMITED' }),
    ]
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: records })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    for (const onDate of [parseGameDate('2027-06-01'), parseGameDate('2030-01-01')]) {
      expect(componentConditionAt(Object.values(restored.facilityComponentConditionRecordsById), court.id, onDate)).toEqual(
        componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, onDate),
      )
      expect(componentServiceabilityAt(Object.values(restored.facilityComponentConditionRecordsById), court.id, onDate)).toBe(
        componentServiceabilityAt(Object.values(world.facilityComponentConditionRecordsById), court.id, onDate),
      )
    }
  })

  it('round-trips a facility-level FacilityConditionRecord for a building-wide dimension', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:condition-4', kind: 'CITY', name: 'Condition City 4' })
    const facility = createFacility({ id: 'facility:condition-4', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Condition Arena 4' })
    const record = createFacilityConditionRecord({ id: 'facilitycondition:save-4', facilityId: facility.id, dimension: 'BUILDING_ENVELOPE', effectiveFrom: '2015-01-01', physicalCondition: 55, serviceability: 'LIMITED', notes: 'Roof leak under repair' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityConditionRecords: [record] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityConditionRecordsById).toEqual(world.facilityConditionRecordsById)
    expect(restored.facilityConditionRecordsById[record.id]!.dimension).toBe('BUILDING_ENVELOPE')
  })

  it('a pre-CFI4 V4 payload (missing both new collections entirely) still loads with empty, valid defaults', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:condition-5', kind: 'CITY', name: 'Condition City 5' })
    const facility = createFacility({ id: 'facility:condition-5', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Condition Arena 5' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility] })
    const saved = serializeGameWorldV4(world, savedAt)

    // Simulate a genuinely pre-CFI4 payload: strip the two new collections entirely.
    const legacyPayload = { ...saved, payload: { ...saved.payload } } as { schemaVersion: 4; savedAt: string; payload: Record<string, unknown> }
    delete legacyPayload.payload.facilityComponentConditionRecords
    delete legacyPayload.payload.facilityConditionRecords

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(legacyPayload)))
    expect(restored.facilityComponentConditionRecordsById).toEqual({})
    expect(restored.facilityConditionRecordsById).toEqual({})
  })
})
