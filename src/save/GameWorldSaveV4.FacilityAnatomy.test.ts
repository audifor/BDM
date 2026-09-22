import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createFacility, createFacilityComponent, createPlace } from '@/domain/facilities'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2034-01-01T00:00:00.000Z'

/**
 * CFI3 added `parentComponentId`, `specification`, and `equipmentTags` to `FacilityComponent`.
 * This file adds only the persistence tests those new fields need — CFI2S already fully certified
 * round-tripping every Facilities collection including the pre-CFI3 `FacilityComponent` shape
 * (see `GameWorldSaveV4.Facilities.test.ts`), so this is a narrow, localized addition rather than
 * a repeated full persistence wave.
 */
describe('GameWorldSaveV4 — Facility Anatomy & Capabilities (CFI3) persistence', () => {
  it('round-trips a component hierarchy (parentComponentId) intact', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:anatomy-1', kind: 'CAMPUS', name: 'Anatomy Campus 1' })
    const facility = createFacility({ id: 'facility:anatomy-1', placeId: place.id, type: 'PERFORMANCE_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Performance Center Anatomy 1' })
    const parent = createFacilityComponent({ id: 'component:anatomy-1-parent', facilityId: facility.id, type: 'RECOVERY_ROOM', status: 'ACTIVE' })
    const child = createFacilityComponent({ id: 'component:anatomy-1-child', facilityId: facility.id, type: 'COLD_TUB', status: 'ACTIVE', parentComponentId: parent.id })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [parent, child] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityComponentsById).toEqual(world.facilityComponentsById)
    expect(restored.facilityComponentsById[child.id]!.parentComponentId).toBe(parent.id)
    expect(restored.facilityComponentsById[parent.id]!.parentComponentId).toBeNull()
  })

  it('round-trips a COURT specification with every field populated', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:anatomy-2', kind: 'CITY', name: 'Anatomy City 2' })
    const facility = createFacility({ id: 'facility:anatomy-2', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Anatomy Arena 2' })
    const court = createFacilityComponent({
      id: 'component:anatomy-2-court',
      facilityId: facility.id,
      type: 'MAIN_COURT',
      status: 'ACTIVE',
      specification: {
        kind: 'COURT',
        isFullCourt: true,
        isIndoor: true,
        lengthMeters: 28,
        widthMeters: 15,
        surface: 'HARDWOOD',
        basketCount: 2,
        competitionCapable: true,
        spectatorCapacity: 12000,
        hasCompetitionLighting: true,
        hasShotTrackingTechnology: true,
        hasVideoTrackingTechnology: false,
      },
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [court] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityComponentsById[court.id]!.specification).toEqual(court.specification)
  })

  it('round-trips a CAPACITY specification and a null specification side by side', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:anatomy-3', kind: 'CITY', name: 'Anatomy City 3' })
    const facility = createFacility({ id: 'facility:anatomy-3', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Anatomy Arena 3' })
    const lockerRoom = createFacilityComponent({ id: 'component:anatomy-3-locker', facilityId: facility.id, type: 'LOCKER_ROOM', status: 'ACTIVE', specification: { kind: 'CAPACITY', unit: 'LOCKERS', amount: 15 } })
    const bareOffice = createFacilityComponent({ id: 'component:anatomy-3-office', facilityId: facility.id, type: 'COACHES_OFFICE', status: 'ACTIVE' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [lockerRoom, bareOffice] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityComponentsById[lockerRoom.id]!.specification).toEqual({ kind: 'CAPACITY', unit: 'LOCKERS', amount: 15 })
    expect(restored.facilityComponentsById[bareOffice.id]!.specification).toBeNull()
  })

  it('round-trips equipmentTags, including a component with none', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:anatomy-4', kind: 'CITY', name: 'Anatomy City 4' })
    const facility = createFacility({ id: 'facility:anatomy-4', placeId: place.id, type: 'MEDICAL_CENTER', purposes: ['MEDICAL_TREATMENT'], status: 'ACTIVE', canonicalName: 'Anatomy Medical 4' })
    const imagingRoom = createFacilityComponent({ id: 'component:anatomy-4-imaging', facilityId: facility.id, type: 'IMAGING_ROOM', status: 'ACTIVE', equipmentTags: ['MRI', 'ULTRASOUND'] })
    const plainRoom = createFacilityComponent({ id: 'component:anatomy-4-plain', facilityId: facility.id, type: 'EXAMINATION_ROOM', status: 'ACTIVE' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [imagingRoom, plainRoom] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityComponentsById[imagingRoom.id]!.equipmentTags).toEqual(['MRI', 'ULTRASOUND'])
    expect(restored.facilityComponentsById[plainRoom.id]!.equipmentTags).toEqual([])
  })

  it('a pre-CFI3 V4 payload (component records without parentComponentId/specification/equipmentTags) still loads with correct defaults', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:anatomy-5', kind: 'CITY', name: 'Anatomy City 5' })
    const facility = createFacility({ id: 'facility:anatomy-5', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Anatomy Arena 5' })
    const component = createFacilityComponent({ id: 'component:anatomy-5', facilityId: facility.id, type: 'MAIN_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component] })
    const saved = serializeGameWorldV4(world, savedAt)

    // Simulate a genuinely pre-CFI3 payload: strip the three new fields entirely, not just null them.
    const legacyComponent = { ...saved.payload.facilityComponents[0]! } as Record<string, unknown>
    delete legacyComponent.parentComponentId
    delete legacyComponent.specification
    delete legacyComponent.equipmentTags
    const legacyPayload = { ...saved, payload: { ...saved.payload, facilityComponents: [legacyComponent] } }

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(legacyPayload)))
    expect(restored.facilityComponentsById[component.id]!.parentComponentId).toBeNull()
    expect(restored.facilityComponentsById[component.id]!.specification).toBeNull()
    expect(restored.facilityComponentsById[component.id]!.equipmentTags).toEqual([])
  })
})
