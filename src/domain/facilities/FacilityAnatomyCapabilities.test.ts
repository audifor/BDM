import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, GameWorldValidationError } from '@/domain/world'
import {
  capabilitiesOfFacility,
  childComponentsOf,
  componentsOfFacility,
  componentsOfFacilityByCategory,
  courtsOfFacility,
  createFacility,
  createFacilityComponent,
  createFacilityUsageRight,
  createPlace,
  facilitiesWithCapability,
  facilityHasCapability,
  medicalComponentsOfFacility,
  practiceCourtsOfFacility,
  recoveryComponentsOfFacility,
  rootComponentsOfFacility,
  trainingComponentsOfFacility,
  usableComponentsForTeamAt,
} from './index'

function fixture() {
  const world = createNewGame()
  const teams = Object.values(world.teams)
  const teamA = teams[0]!
  const teamB = teams.find((team) => team.id !== teamA.id)!
  return { world, teamA, teamB }
}

describe('Club Facilities & Infrastructure V2 — Anatomy & Capabilities (CFI3)', () => {
  it('1. arena with a single identifiable main court', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:1', kind: 'CITY', name: 'City 1' })
    const arena = createFacility({ id: 'facility:1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena 1' })
    const mainCourt = createFacilityComponent({ id: 'component:1-main', facilityId: arena.id, type: 'MAIN_COURT', status: 'ACTIVE', specification: { kind: 'COURT', isFullCourt: true, isIndoor: true, competitionCapable: true } })
    const world = updateGameWorld(f.world, { places: [place], facilities: [arena], facilityComponents: [mainCourt] })
    const onDate = parseGameDate('2030-01-01')
    expect(courtsOfFacility(Object.values(world.facilityComponentsById), arena.id, onDate).map((c) => c.id)).toEqual([mainCourt.id])
    expect(facilityHasCapability(Object.values(world.facilityComponentsById), arena.id, 'BASKETBALL_FULL_COURT', onDate)).toBe(true)
  })

  it('2. training center with multiple practice courts', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:2', kind: 'CAMPUS', name: 'Campus 2' })
    const trainingCenter = createFacility({ id: 'facility:2', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Training Center 2' })
    const courtA = createFacilityComponent({ id: 'component:2-a', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const courtB = createFacilityComponent({ id: 'component:2-b', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [trainingCenter], facilityComponents: [courtA, courtB] })
    const onDate = parseGameDate('2030-01-01')
    expect(practiceCourtsOfFacility(Object.values(world.facilityComponentsById), trainingCenter.id, onDate)).toHaveLength(2)
  })

  it('3. individually identifiable courts each carry distinct component-scoped usage rights', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:3', kind: 'CAMPUS', name: 'Campus 3' })
    const trainingCenter = createFacility({ id: 'facility:3', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Training Center 3' })
    const courtA = createFacilityComponent({ id: 'component:3-a', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const courtB = createFacilityComponent({ id: 'component:3-b', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [trainingCenter],
      facilityComponents: [courtA, courtB],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:3-a', facilityId: trainingCenter.id, componentIds: [courtA.id], teamId: f.teamA.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:3-b', facilityId: trainingCenter.id, componentIds: [courtB.id], teamId: f.teamB.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamA.id, onDate)).toEqual([courtA.id])
    expect(usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamB.id, onDate)).toEqual([courtB.id])
  })

  it('4. component hierarchy: Performance Center -> Recovery Area -> Cold Tub', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:4', kind: 'CAMPUS', name: 'Campus 4' })
    const facility = createFacility({ id: 'facility:4', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Performance Center 4' })
    const performanceArea = createFacilityComponent({ id: 'component:4-perf', facilityId: facility.id, type: 'PERFORMANCE_LAB', status: 'ACTIVE' })
    const recoveryArea = createFacilityComponent({ id: 'component:4-recovery', facilityId: facility.id, type: 'RECOVERY_ROOM', status: 'ACTIVE', parentComponentId: performanceArea.id })
    const coldTub = createFacilityComponent({ id: 'component:4-coldtub', facilityId: facility.id, type: 'COLD_TUB', status: 'ACTIVE', parentComponentId: recoveryArea.id })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [performanceArea, recoveryArea, coldTub] })
    const onDate = parseGameDate('2030-01-01')
    expect(rootComponentsOfFacility(Object.values(world.facilityComponentsById), facility.id, onDate).map((c) => c.id)).toEqual([performanceArea.id])
    expect(childComponentsOf(Object.values(world.facilityComponentsById), performanceArea.id, onDate).map((c) => c.id)).toEqual([recoveryArea.id])
    expect(childComponentsOf(Object.values(world.facilityComponentsById), recoveryArea.id, onDate).map((c) => c.id)).toEqual([coldTub.id])
  })

  it('5. invalid cross-facility parent is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:5', kind: 'CITY', name: 'City 5' })
    const facilityOne = createFacility({ id: 'facility:5-one', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena 5-1' })
    const facilityTwo = createFacility({ id: 'facility:5-two', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena 5-2' })
    const parentInFacilityTwo = createFacilityComponent({ id: 'component:5-parent', facilityId: facilityTwo.id, type: 'RECOVERY_ROOM', status: 'ACTIVE' })
    const childInFacilityOne = createFacilityComponent({ id: 'component:5-child', facilityId: facilityOne.id, type: 'COLD_TUB', status: 'ACTIVE', parentComponentId: parentInFacilityTwo.id })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [facilityOne, facilityTwo],
      facilityComponents: [parentInFacilityTwo, childInFacilityOne],
    })).toThrow(GameWorldValidationError)
  })

  it('6. component hierarchy cycle is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:6', kind: 'CITY', name: 'City 6' })
    const facility = createFacility({ id: 'facility:6', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena 6' })
    // A -> B -> A: build both components first, then patch the cycle in via raw object spread
    // since createFacilityComponent alone cannot express a forward reference to a not-yet-existing id.
    const componentA = createFacilityComponent({ id: 'component:6-a', facilityId: facility.id, type: 'RECOVERY_ROOM', status: 'ACTIVE' })
    const componentB = createFacilityComponent({ id: 'component:6-b', facilityId: facility.id, type: 'COLD_TUB', status: 'ACTIVE', parentComponentId: componentA.id })
    const cyclicA = { ...componentA, parentComponentId: componentB.id }
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [cyclicA, componentB],
    })).toThrow(GameWorldValidationError)
  })

  it('7. medical suite: clinic, examination, imaging and rehabilitation components', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:7', kind: 'CAMPUS', name: 'Campus 7' })
    const medicalCenter = createFacility({ id: 'facility:7', placeId: place.id, type: 'MEDICAL_CENTER', purposes: ['MEDICAL_TREATMENT'], status: 'ACTIVE', canonicalName: 'Medical Center 7' })
    const components = [
      createFacilityComponent({ id: 'component:7-clinic', facilityId: medicalCenter.id, type: 'MEDICAL_CLINIC', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:7-exam', facilityId: medicalCenter.id, type: 'EXAMINATION_ROOM', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:7-imaging', facilityId: medicalCenter.id, type: 'IMAGING_ROOM', status: 'ACTIVE', equipmentTags: ['MRI'] }),
      createFacilityComponent({ id: 'component:7-rehab', facilityId: medicalCenter.id, type: 'REHABILITATION_ROOM', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [medicalCenter], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    expect(medicalComponentsOfFacility(Object.values(world.facilityComponentsById), medicalCenter.id, onDate)).toHaveLength(4)
    expect(facilityHasCapability(Object.values(world.facilityComponentsById), medicalCenter.id, 'MEDICAL_IMAGING', onDate)).toBe(true)
    expect(facilityHasCapability(Object.values(world.facilityComponentsById), medicalCenter.id, 'PHYSIOTHERAPY', onDate)).toBe(true)
    expect(world.facilityComponentsById[components[2]!.id]!.equipmentTags).toEqual(['MRI'])
  })

  it('8. recovery suite: hydrotherapy, cold tub, sauna and cryotherapy coexist independently', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:8', kind: 'CAMPUS', name: 'Campus 8' })
    const facility = createFacility({ id: 'facility:8', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Performance Center 8' })
    const components = [
      createFacilityComponent({ id: 'component:8-pool', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:8-cold', facilityId: facility.id, type: 'COLD_TUB', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:8-sauna', facilityId: facility.id, type: 'SAUNA', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:8-cryo', facilityId: facility.id, type: 'CRYOTHERAPY_ROOM', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    expect(recoveryComponentsOfFacility(Object.values(world.facilityComponentsById), facility.id, onDate)).toHaveLength(4)
    const capabilities = capabilitiesOfFacility(Object.values(world.facilityComponentsById), facility.id, onDate)
    expect(capabilities).toContain('HYDROTHERAPY')
    expect(capabilities).toContain('CRYOTHERAPY')
  })

  it('9. performance center groups training and performance-lab components under one root', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:9', kind: 'CAMPUS', name: 'Campus 9' })
    const facility = createFacility({ id: 'facility:9', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Performance Center 9' })
    const components = [
      createFacilityComponent({ id: 'component:9-strength', facilityId: facility.id, type: 'STRENGTH_ROOM', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:9-biomech', facilityId: facility.id, type: 'BIOMECHANICS_LAB', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:9-sprint', facilityId: facility.id, type: 'SPRINT_AREA', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    expect(trainingComponentsOfFacility(Object.values(world.facilityComponentsById), facility.id, onDate).map((c) => c.type).sort()).toEqual(['SPRINT_AREA', 'STRENGTH_ROOM'])
    expect(componentsOfFacilityByCategory(Object.values(world.facilityComponentsById), facility.id, 'PERFORMANCE', onDate).map((c) => c.type)).toEqual(['BIOMECHANICS_LAB'])
    expect(facilityHasCapability(Object.values(world.facilityComponentsById), facility.id, 'STRENGTH_TRAINING', onDate)).toBe(true)
  })

  it('10. academy components (court, gym, classroom) inside an Academy Center Facility', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:10', kind: 'CAMPUS', name: 'Campus 10' })
    const academy = createFacility({ id: 'facility:10', placeId: place.id, type: 'ACADEMY_CENTER', purposes: ['ACADEMY_DEVELOPMENT'], status: 'ACTIVE', canonicalName: 'Academy Center 10' })
    const components = [
      createFacilityComponent({ id: 'component:10-court', facilityId: academy.id, type: 'ACADEMY_COURT', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:10-gym', facilityId: academy.id, type: 'ACADEMY_GYM', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:10-classroom', facilityId: academy.id, type: 'CLASSROOM', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [academy], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    expect(componentsOfFacility(Object.values(world.facilityComponentsById), academy.id, onDate)).toHaveLength(3)
    expect(courtsOfFacility(Object.values(world.facilityComponentsById), academy.id, onDate).map((c) => c.type)).toEqual(['ACADEMY_COURT'])
  })

  it('11. residential components (dormitory, common area) support an NCAA/academy scenario', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:11', kind: 'CAMPUS', name: 'Campus 11' })
    const dormitory = createFacility({ id: 'facility:11', placeId: place.id, type: 'DORMITORY', purposes: ['LODGING'], status: 'ACTIVE', canonicalName: 'Dormitory 11' })
    const components = [
      createFacilityComponent({ id: 'component:11-room', facilityId: dormitory.id, type: 'PLAYER_ROOM', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'BEDS', amount: 2 } }),
      createFacilityComponent({ id: 'component:11-common', facilityId: dormitory.id, type: 'COMMON_AREA', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [dormitory], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    expect(facilityHasCapability(Object.values(world.facilityComponentsById), dormitory.id, 'PLAYER_RESIDENTIAL', onDate)).toBe(true)
    const room = world.facilityComponentsById[components[0]!.id]!
    expect(room.specification).toEqual({ kind: 'CAPACITY', unit: 'BEDS', amount: 2 })
  })

  it('12. arena spectator components (seating bowl, VIP box, accessible seating)', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:12', kind: 'CITY', name: 'City 12' })
    const arena = createFacility({ id: 'facility:12', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena 12' })
    const components = [
      createFacilityComponent({ id: 'component:12-bowl', facilityId: arena.id, type: 'SEATING_BOWL', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'SPECTATORS', amount: 15000 } }),
      createFacilityComponent({ id: 'component:12-vip', facilityId: arena.id, type: 'VIP_BOX', status: 'ACTIVE', quantity: 20 }),
      createFacilityComponent({ id: 'component:12-accessible', facilityId: arena.id, type: 'ACCESSIBLE_SEATING_AREA', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [arena], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    expect(componentsOfFacilityByCategory(Object.values(world.facilityComponentsById), arena.id, 'SPECTATOR', onDate)).toHaveLength(3)
  })

  it('13. component-specific capacity uses the correct unit semantics per component kind', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:13', kind: 'CITY', name: 'City 13' })
    const facility = createFacility({ id: 'facility:13', placeId: place.id, type: 'MULTI_SPORT_COMPLEX', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Complex 13' })
    const lockerRoom = createFacilityComponent({ id: 'component:13-locker', facilityId: facility.id, type: 'LOCKER_ROOM', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'LOCKERS', amount: 18 } })
    const treatmentRoom = createFacilityComponent({ id: 'component:13-treatment', facilityId: facility.id, type: 'TREATMENT_ROOM', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'TREATMENT_STATIONS', amount: 4 } })
    const meetingRoom = createFacilityComponent({ id: 'component:13-meeting', facilityId: facility.id, type: 'MEETING_ROOM', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'SEATS', amount: 25 } })
    const parking = createFacilityComponent({ id: 'component:13-parking', facilityId: facility.id, type: 'PARKING', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'PARKING_SPACES', amount: 500 } })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [lockerRoom, treatmentRoom, meetingRoom, parking] })
    expect(world.facilityComponentsById[lockerRoom.id]!.specification).toEqual({ kind: 'CAPACITY', unit: 'LOCKERS', amount: 18 })
    expect(world.facilityComponentsById[treatmentRoom.id]!.specification).toEqual({ kind: 'CAPACITY', unit: 'TREATMENT_STATIONS', amount: 4 })
    expect(world.facilityComponentsById[meetingRoom.id]!.specification).toEqual({ kind: 'CAPACITY', unit: 'SEATS', amount: 25 })
    expect(world.facilityComponentsById[parking.id]!.specification).toEqual({ kind: 'CAPACITY', unit: 'PARKING_SPACES', amount: 500 })
  })

  it('14. capability derivation from a component matches the expected mapping', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:14', kind: 'CITY', name: 'City 14' })
    const facility = createFacility({ id: 'facility:14', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Arena 14' })
    const pressRoom = createFacilityComponent({ id: 'component:14-press', facilityId: facility.id, type: 'PRESS_CONFERENCE_ROOM', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [pressRoom] })
    const onDate = parseGameDate('2030-01-01')
    expect(facilitiesWithCapability(Object.values(world.facilityComponentsById), 'PRESS_CONFERENCE', onDate)).toEqual([facility.id])
  })

  it('15. missing capability: a facility with no matching component reports the capability absent, not falsely present', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:15', kind: 'CITY', name: 'City 15' })
    const facility = createFacility({ id: 'facility:15', placeId: place.id, type: 'STORAGE', purposes: ['STORAGE'], status: 'ACTIVE', canonicalName: 'Storage 15' })
    const storageRoom = createFacilityComponent({ id: 'component:15-storage', facilityId: facility.id, type: 'STORAGE', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: [storageRoom] })
    const onDate = parseGameDate('2030-01-01')
    expect(facilityHasCapability(Object.values(world.facilityComponentsById), facility.id, 'MEDICAL_IMAGING', onDate)).toBe(false)
    expect(capabilitiesOfFacility(Object.values(world.facilityComponentsById), facility.id, onDate)).toEqual([])
  })

  it('16. multiple capabilities derive simultaneously from a rich multi-component facility', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:16', kind: 'CAMPUS', name: 'Campus 16' })
    const facility = createFacility({ id: 'facility:16', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING', 'MEDICAL_TREATMENT'], status: 'ACTIVE', canonicalName: 'Rich Center 16' })
    const components = [
      createFacilityComponent({ id: 'component:16-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:16-weight', facilityId: facility.id, type: 'WEIGHT_ROOM', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:16-physio', facilityId: facility.id, type: 'PHYSIO_ROOM', status: 'ACTIVE' }),
      createFacilityComponent({ id: 'component:16-film', facilityId: facility.id, type: 'FILM_ROOM', status: 'ACTIVE' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityComponents: components })
    const onDate = parseGameDate('2030-01-01')
    const capabilities = capabilitiesOfFacility(Object.values(world.facilityComponentsById), facility.id, onDate)
    expect(capabilities).toEqual(['BASKETBALL_TRAINING', 'PHYSIOTHERAPY', 'STRENGTH_TRAINING', 'VIDEO_ANALYSIS'].sort())
  })

  it('17. component-scoped usage integration: whole-facility right resolves every active component, scoped right resolves only its own', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:17', kind: 'CAMPUS', name: 'Campus 17' })
    const facility = createFacility({ id: 'facility:17', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 17' })
    const courtA = createFacilityComponent({ id: 'component:17-a', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const courtB = createFacilityComponent({ id: 'component:17-b', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [courtA, courtB],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:17-whole', facilityId: facility.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' })],
    })
    const onDate = parseGameDate('2030-01-01')
    expect([...usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamA.id, onDate)].sort()).toEqual([courtA.id, courtB.id].sort())
  })

  it('18. usable components for a team reflect only components that are currently ACTIVE', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:18', kind: 'CAMPUS', name: 'Campus 18' })
    const facility = createFacility({ id: 'facility:18', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Center 18' })
    const activeCourt = createFacilityComponent({ id: 'component:18-active', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const closedCourt = createFacilityComponent({ id: 'component:18-closed', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'CLOSED', openedAt: '2015-01-01', closedAt: '2024-01-01' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityComponents: [activeCourt, closedCourt],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:18-whole', facilityId: facility.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2010-01-01' })],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamA.id, onDate)).toEqual([activeCourt.id])
  })

  it('rejects an invalid court specification (negative dimensions)', () => {
    expect(() => createFacilityComponent({
      id: 'component:invalid-court',
      facilityId: 'facility:x',
      type: 'MAIN_COURT',
      status: 'ACTIVE',
      specification: { kind: 'COURT', isFullCourt: true, isIndoor: true, lengthMeters: -28 },
    })).toThrow(RangeError)
  })

  it('rejects a malformed component specification discriminated union', () => {
    expect(() => createFacilityComponent({
      id: 'component:invalid-spec',
      facilityId: 'facility:x',
      type: 'MAIN_COURT',
      status: 'ACTIVE',
      specification: { kind: 'NOT_REAL' } as never,
    })).toThrow(TypeError)
  })

  it('rejects negative capacity specification amounts', () => {
    expect(() => createFacilityComponent({
      id: 'component:invalid-capacity',
      facilityId: 'facility:x',
      type: 'PARKING',
      status: 'ACTIVE',
      specification: { kind: 'CAPACITY', unit: 'PARKING_SPACES', amount: -5 },
    })).toThrow(RangeError)
  })
})
