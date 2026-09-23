import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, GameWorldValidationError } from '@/domain/world'
import {
  availableComponentsForTeamAt,
  componentConditionAt,
  componentServiceabilityAt,
  componentsBelowConditionAt,
  componentsOutOfServiceAt,
  componentsWithLimitedServiceAt,
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityConditionRecord,
  createFacilityUsageRight,
  createPlace,
  facilityConditionSummaryAt,
  facilityHasUsableCapabilityAt,
  usableCapabilitiesOfFacilityAt,
  usableComponentsForTeamAt,
} from './index'

function fixture() {
  const world = createNewGame()
  const teams = Object.values(world.teams)
  const teamA = teams[0]!
  return { world, teamA }
}

describe('Club Facilities & Infrastructure V2 — Condition, Standard & Serviceability (CFI4)', () => {
  it('1. component with a known physical condition resolves it', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:1', kind: 'CITY', name: 'City 1' })
    const facility = createFacility({ id: 'facility:1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 1' })
    const court = createFacilityComponent({ id: 'component:1', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:1', componentId: court.id, effectiveFrom: '2020-01-01', physicalCondition: 74, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })
    const onDate = parseGameDate('2030-01-01')
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, onDate)?.physicalCondition).toBe(74)
  })

  it('2. component with unknown condition never falsifies precision', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:2', kind: 'CITY', name: 'City 2' })
    const facility = createFacility({ id: 'facility:2', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 2' })
    const court = createFacilityComponent({ id: 'component:2', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court] })
    const onDate = parseGameDate('2030-01-01')
    // No record exists at all: componentConditionAt returns undefined, never a falsified 100.
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, onDate)).toBeUndefined()
    // A record can also explicitly record an unknown physicalCondition while still stating serviceability.
    const record = createFacilityConditionRecordForComponent(court.id)
    const worldWithRecord = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })
    expect(componentConditionAt(Object.values(worldWithRecord.facilityComponentConditionRecordsById), court.id, onDate)?.physicalCondition).toBeNull()
  })

  it('3. historical condition resolution returns the correct period for a past date', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:3', kind: 'CITY', name: 'City 3' })
    const facility = createFacility({ id: 'facility:3', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 3' })
    const court = createFacilityComponent({ id: 'component:3', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const records = [
      createFacilityComponentConditionRecord({ id: 'condition:3-a', componentId: court.id, effectiveFrom: '2027-01-01', effectiveTo: '2028-12-31', physicalCondition: 90, serviceability: 'FULL' }),
      createFacilityComponentConditionRecord({ id: 'condition:3-b', componentId: court.id, effectiveFrom: '2029-01-01', effectiveTo: '2030-01-31', physicalCondition: 74, serviceability: 'FULL' }),
      createFacilityComponentConditionRecord({ id: 'condition:3-c', componentId: court.id, effectiveFrom: '2030-02-01', effectiveTo: '2030-03-31', physicalCondition: 61, serviceability: 'LIMITED' }),
      createFacilityComponentConditionRecord({ id: 'condition:3-d', componentId: court.id, effectiveFrom: '2030-04-01', physicalCondition: 78, serviceability: 'FULL' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: records })
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2027-06-01'))?.physicalCondition).toBe(90)
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2029-06-01'))?.physicalCondition).toBe(74)
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2030-02-15'))?.serviceability).toBe('LIMITED')
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2030-06-01'))?.physicalCondition).toBe(78)
  })

  it('4. open-ended state resolves for any future date', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:4', kind: 'CITY', name: 'City 4' })
    const facility = createFacility({ id: 'facility:4', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 4' })
    const court = createFacilityComponent({ id: 'component:4', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:4', componentId: court.id, effectiveFrom: '2020-01-01', physicalCondition: 85, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2099-01-01'))?.physicalCondition).toBe(85)
  })

  it('5. invalid condition below 0 is rejected', () => {
    expect(() => createFacilityComponentConditionRecord({ id: 'condition:invalid-low', componentId: 'component:x', effectiveFrom: '2020-01-01', physicalCondition: -1, serviceability: 'FULL' })).toThrow(RangeError)
  })

  it('6. invalid condition above 100 is rejected', () => {
    expect(() => createFacilityComponentConditionRecord({ id: 'condition:invalid-high', componentId: 'component:x', effectiveFrom: '2020-01-01', physicalCondition: 101, serviceability: 'FULL' })).toThrow(RangeError)
  })

  it('7. invalid temporal range is rejected', () => {
    expect(() => createFacilityComponentConditionRecord({ id: 'condition:invalid-range', componentId: 'component:x', effectiveFrom: '2025-01-01', effectiveTo: '2024-01-01', serviceability: 'FULL' })).toThrow(RangeError)
  })

  it('8. incompatible overlapping condition records for the same component are rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:8', kind: 'CITY', name: 'City 8' })
    const facility = createFacility({ id: 'facility:8', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 8' })
    const court = createFacilityComponent({ id: 'component:8', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [court],
      facilityComponentConditionRecords: [
        createFacilityComponentConditionRecord({ id: 'condition:8-a', componentId: court.id, effectiveFrom: '2020-01-01', serviceability: 'FULL' }),
        createFacilityComponentConditionRecord({ id: 'condition:8-b', componentId: court.id, effectiveFrom: '2021-01-01', serviceability: 'LIMITED' }),
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('9. FULL serviceability', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:9', kind: 'CITY', name: 'City 9' })
    const facility = createFacility({ id: 'facility:9', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 9' })
    const court = createFacilityComponent({ id: 'component:9', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:9', componentId: court.id, effectiveFrom: '2020-01-01', physicalCondition: 62, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })
    // A relatively low condition can still be FULL serviceability -- condition != serviceability.
    expect(componentServiceabilityAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2030-01-01'))).toBe('FULL')
  })

  it('10. LIMITED serviceability', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:10', kind: 'CITY', name: 'City 10' })
    const facility = createFacility({ id: 'facility:10', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 10' })
    const court = createFacilityComponent({ id: 'component:10', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:10', componentId: court.id, effectiveFrom: '2020-01-01', physicalCondition: 80, serviceability: 'LIMITED' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court], facilityComponentConditionRecords: [record] })
    // A relatively high condition can still be LIMITED serviceability.
    expect(componentServiceabilityAt(Object.values(world.facilityComponentConditionRecordsById), court.id, parseGameDate('2030-01-01'))).toBe('LIMITED')
    expect(componentsWithLimitedServiceAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), parseGameDate('2030-01-01'))).toEqual([court.id])
  })

  it('11. OUT_OF_SERVICE component', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:11', kind: 'CAMPUS', name: 'Campus 11' })
    const facility = createFacility({ id: 'facility:11', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 11' })
    const pool = createFacilityComponent({ id: 'component:11', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:11', componentId: pool.id, effectiveFrom: '2030-01-01', serviceability: 'OUT_OF_SERVICE', notes: 'Pump failure' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [pool], facilityComponentConditionRecords: [record] })
    const onDate = parseGameDate('2030-06-01')
    expect(componentsOutOfServiceAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), onDate)).toEqual([pool.id])
  })

  it('12. facility remains ACTIVE while one component is unavailable', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:12', kind: 'CAMPUS', name: 'Campus 12' })
    const facility = createFacility({ id: 'facility:12', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 12' })
    const court = createFacilityComponent({ id: 'component:12-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const pool = createFacilityComponent({ id: 'component:12-pool', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:12', componentId: pool.id, effectiveFrom: '2030-01-01', serviceability: 'OUT_OF_SERVICE' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [court, pool], facilityComponentConditionRecords: [record] })
    expect(world.facilitiesById[facility.id]!.status).toBe('ACTIVE')
    expect(componentsOutOfServiceAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), parseGameDate('2030-06-01'))).toEqual([pool.id])
  })

  it('13. capability physically exists but is currently unavailable', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:13', kind: 'CAMPUS', name: 'Campus 13' })
    const facility = createFacility({ id: 'facility:13', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 13' })
    const pool = createFacilityComponent({ id: 'component:13', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' })
    const record = createFacilityComponentConditionRecord({ id: 'condition:13', componentId: pool.id, effectiveFrom: '2030-01-01', serviceability: 'OUT_OF_SERVICE' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [pool], facilityComponentConditionRecords: [record] })
    const onDate = parseGameDate('2030-06-01')
    // CFI3's physical-presence query still reports the capability exists.
    expect(componentsOutOfServiceAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), onDate)).toEqual([pool.id])
    expect(facilityHasUsableCapabilityAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), facility.id, 'HYDROTHERAPY', onDate)).toBe(false)
  })

  it('14. usable capability returns after a state change (repair)', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:14', kind: 'CAMPUS', name: 'Campus 14' })
    const facility = createFacility({ id: 'facility:14', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 14' })
    const pool = createFacilityComponent({ id: 'component:14', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' })
    const records = [
      createFacilityComponentConditionRecord({ id: 'condition:14-a', componentId: pool.id, effectiveFrom: '2030-01-01', effectiveTo: '2030-03-31', serviceability: 'OUT_OF_SERVICE' }),
      createFacilityComponentConditionRecord({ id: 'condition:14-b', componentId: pool.id, effectiveFrom: '2030-04-01', physicalCondition: 88, serviceability: 'FULL' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [pool], facilityComponentConditionRecords: records })
    expect(facilityHasUsableCapabilityAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), facility.id, 'HYDROTHERAPY', parseGameDate('2030-02-01'))).toBe(false)
    expect(facilityHasUsableCapabilityAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), facility.id, 'HYDROTHERAPY', parseGameDate('2030-06-01'))).toBe(true)
  })

  it('15. team has access but the component is unavailable', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:15', kind: 'CAMPUS', name: 'Campus 15' })
    const facility = createFacility({ id: 'facility:15', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 15' })
    const court = createFacilityComponent({ id: 'component:15', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [court],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:15', facilityId: facility.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' })],
      facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'condition:15', componentId: court.id, effectiveFrom: '2030-01-01', serviceability: 'OUT_OF_SERVICE' })],
    })
    const onDate = parseGameDate('2030-06-01')
    // Access (CFI2/CFI3) says the team may use it; CFI4 availability says it currently cannot.
    expect(usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamA.id, onDate)).toEqual([court.id])
    expect(availableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), f.teamA.id, onDate)).toEqual([])
  })

  it('16. team has access and the component is available', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:16', kind: 'CAMPUS', name: 'Campus 16' })
    const facility = createFacility({ id: 'facility:16', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 16' })
    const court = createFacilityComponent({ id: 'component:16', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [court],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:16', facilityId: facility.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' })],
      facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'condition:16', componentId: court.id, effectiveFrom: '2020-01-01', physicalCondition: 90, serviceability: 'FULL' })],
    })
    const onDate = parseGameDate('2030-06-01')
    expect(availableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), f.teamA.id, onDate)).toEqual([court.id])
  })

  it('17. facility condition summary aggregates without treating the aggregate as world truth', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:17', kind: 'CAMPUS', name: 'Campus 17' })
    const facility = createFacility({ id: 'facility:17', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 17' })
    const courtA = createFacilityComponent({ id: 'component:17-a', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const courtB = createFacilityComponent({ id: 'component:17-b', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const medical = createFacilityComponent({ id: 'component:17-medical', facilityId: facility.id, type: 'MEDICAL_ROOM', status: 'ACTIVE' })
    const pool = createFacilityComponent({ id: 'component:17-pool', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [courtA, courtB, medical, pool],
      facilityComponentConditionRecords: [
        createFacilityComponentConditionRecord({ id: 'condition:17-a', componentId: courtA.id, effectiveFrom: '2020-01-01', physicalCondition: 90, serviceability: 'FULL' }),
        createFacilityComponentConditionRecord({ id: 'condition:17-b', componentId: courtB.id, effectiveFrom: '2020-01-01', physicalCondition: 40, serviceability: 'LIMITED' }),
        createFacilityComponentConditionRecord({ id: 'condition:17-pool', componentId: pool.id, effectiveFrom: '2020-01-01', serviceability: 'OUT_OF_SERVICE' }),
      ],
    })
    const summary = facilityConditionSummaryAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), facility.id, parseGameDate('2030-01-01'))
    expect(summary.componentCount).toBe(4)
    expect(summary.knownConditionComponentCount).toBe(2)
    expect(summary.outOfServiceComponentIds).toEqual([pool.id])
    expect(summary.limitedServiceComponentIds).toEqual([courtB.id])
    expect(summary.worstKnownCondition).toBe(40)
    expect(summary.averageKnownCondition).toBe(65)
  })

  it('18. multiple components with different conditions resolve independently', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:18', kind: 'CAMPUS', name: 'Campus 18' })
    const facility = createFacility({ id: 'facility:18', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 18' })
    const courtA = createFacilityComponent({ id: 'component:18-a', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const courtB = createFacilityComponent({ id: 'component:18-b', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [courtA, courtB],
      facilityComponentConditionRecords: [
        createFacilityComponentConditionRecord({ id: 'condition:18-a', componentId: courtA.id, effectiveFrom: '2020-01-01', physicalCondition: 95, serviceability: 'FULL' }),
        createFacilityComponentConditionRecord({ id: 'condition:18-b', componentId: courtB.id, effectiveFrom: '2020-01-01', physicalCondition: 35, serviceability: 'FULL' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(componentsBelowConditionAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), 50, onDate)).toEqual([courtB.id])
  })

  it('19. technical standard is independent of physical condition', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:19', kind: 'CAMPUS', name: 'Campus 19' })
    const facility = createFacility({ id: 'facility:19', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 19' })
    const basicGym = createFacilityComponent({ id: 'component:19-gym', facilityId: facility.id, type: 'GYM', status: 'ACTIVE' })
    const eliteLab = createFacilityComponent({ id: 'component:19-lab', facilityId: facility.id, type: 'PERFORMANCE_LAB', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [basicGym, eliteLab],
      facilityComponentConditionRecords: [
        // Old basic gym, perfectly maintained.
        createFacilityComponentConditionRecord({ id: 'condition:19-gym', componentId: basicGym.id, effectiveFrom: '2020-01-01', physicalCondition: 95, serviceability: 'FULL', technicalStandard: 'BASIC' }),
        // Elite lab, badly degraded.
        createFacilityComponentConditionRecord({ id: 'condition:19-lab', componentId: eliteLab.id, effectiveFrom: '2020-01-01', physicalCondition: 42, serviceability: 'FULL', technicalStandard: 'SPECIALIST' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    const gymRecord = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), basicGym.id, onDate)!
    const labRecord = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), eliteLab.id, onDate)!
    expect(gymRecord.technicalStandard).toBe('BASIC')
    expect(gymRecord.physicalCondition).toBe(95)
    expect(labRecord.technicalStandard).toBe('SPECIALIST')
    expect(labRecord.physicalCondition).toBe(42)
  })

  it('rejects a component condition record referencing a missing component', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:missing', kind: 'CITY', name: 'City Missing' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'condition:missing', componentId: 'component:does-not-exist', effectiveFrom: '2020-01-01', serviceability: 'FULL' })],
    })).toThrow(GameWorldValidationError)
  })

  it('rejects a facility-level condition record referencing a missing facility', () => {
    const f = fixture()
    expect(() => updateGameWorld(f.world, {
      facilityConditionRecords: [createFacilityConditionRecord({ id: 'facilitycondition:missing', facilityId: 'facility:does-not-exist', dimension: 'STRUCTURAL_INTEGRITY', effectiveFrom: '2020-01-01', serviceability: 'FULL' })],
    })).toThrow(GameWorldValidationError)
  })

  it('facility-level condition record represents a building-wide dimension distinct from any component', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:facility-level', kind: 'CITY', name: 'City Facility Level' })
    const facility = createFacility({ id: 'facility:facility-level', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena Facility Level' })
    const record = createFacilityConditionRecord({ id: 'facilitycondition:1', facilityId: facility.id, dimension: 'STRUCTURAL_INTEGRITY', effectiveFrom: '2020-01-01', physicalCondition: 88, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityConditionRecords: [record] })
    const records = Object.values(world.facilityConditionRecordsById)
    expect(records).toHaveLength(1)
    expect(records[0]!.dimension).toBe('STRUCTURAL_INTEGRITY')
  })

  it('rejects duplicate active facility-level condition records for the same dimension', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:facility-dup', kind: 'CITY', name: 'City Facility Dup' })
    const facility = createFacility({ id: 'facility:facility-dup', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena Facility Dup' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityConditionRecords: [
        createFacilityConditionRecord({ id: 'facilitycondition:dup-a', facilityId: facility.id, dimension: 'UTILITIES', effectiveFrom: '2020-01-01', serviceability: 'FULL' }),
        createFacilityConditionRecord({ id: 'facilitycondition:dup-b', facilityId: facility.id, dimension: 'UTILITIES', effectiveFrom: '2021-01-01', serviceability: 'LIMITED' }),
      ],
    })).toThrow(GameWorldValidationError)
  })
})

function createFacilityConditionRecordForComponent(componentId: string) {
  return createFacilityComponentConditionRecord({ id: 'condition:explicit-unknown', componentId, effectiveFrom: '2020-01-01', serviceability: 'FULL' })
}
