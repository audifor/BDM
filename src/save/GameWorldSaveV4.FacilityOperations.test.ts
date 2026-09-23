import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import {
  createFacility,
  createFacilityComponent,
  createFacilityInspection,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityOperationalIncident,
  createPlace,
} from '@/domain/facilities'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2035-01-01T00:00:00.000Z'

/**
 * CFI5 introduces four new normalized GameWorld collections
 * (`facilityMaintenanceNeedsById`, `facilityMaintenanceActionsById`, `facilityInspectionsById`,
 * `facilityOperationalIncidentsById`). This file adds only the persistence tests those four new
 * collections need, following the exact CFI2S/CFI4 Save V4 pattern (per-collection parser with
 * `exactKeys`, canonical factory reconstruction, `hasOwnProperty`-gated backward compatibility) —
 * every prior Facilities collection's round-trip is already covered elsewhere and is unaffected.
 * Deliberately NOT persisted: readiness summaries, deterioration calculations — those remain
 * query-time only (see `FacilityQueries.ts`/`FacilityDeteriorationEngine.ts`).
 */
describe('GameWorldSaveV4 — Operations, Maintenance & Deterioration (CFI5) persistence', () => {
  it('round-trips a FacilityMaintenanceNeed, including its optional componentId and resolvedAt', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-1', kind: 'CAMPUS', name: 'Ops Save Campus 1' })
    const facility = createFacility({ id: 'facility:ops-save-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 1' })
    const component = createFacilityComponent({ id: 'component:ops-save-1', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const need = createFacilityMaintenanceNeed({ id: 'need:save-1', facilityId: facility.id, componentId: component.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'COMPLETED', source: 'inspection:save-1', resolvedAt: '2030-03-01' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityMaintenanceNeeds: [need] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityMaintenanceNeedsById).toEqual(world.facilityMaintenanceNeedsById)
    expect(restored.facilityMaintenanceNeedsById[need.id]!.status).toBe('COMPLETED')
    expect(restored.facilityMaintenanceNeedsById[need.id]!.resolvedAt).toBe('2030-03-01')
  })

  it('round-trips a facility-level FacilityMaintenanceNeed with a null componentId', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-2', kind: 'CITY', name: 'Ops Save City 2' })
    const facility = createFacility({ id: 'facility:ops-save-2', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Ops Save Arena 2' })
    const need = createFacilityMaintenanceNeed({ id: 'need:save-2', facilityId: facility.id, detectedAt: '2030-01-01', type: 'STRUCTURAL', severity: 'MAJOR', status: 'OPEN', source: 'incident:save-2' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityMaintenanceNeeds: [need] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityMaintenanceNeedsById[need.id]!.componentId).toBeNull()
  })

  it('round-trips a FacilityMaintenanceAction with a resultingCondition/resultingServiceability effect', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-3', kind: 'CAMPUS', name: 'Ops Save Campus 3' })
    const facility = createFacility({ id: 'facility:ops-save-3', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 3' })
    const component = createFacilityComponent({ id: 'component:ops-save-3', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const need = createFacilityMaintenanceNeed({ id: 'need:save-3', facilityId: facility.id, componentId: component.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: 'x' })
    const action = createFacilityMaintenanceAction({ id: 'action:save-3', needId: need.id, facilityId: facility.id, componentId: component.id, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-10', outcome: 'SUCCESSFUL', resultingCondition: 76, resultingServiceability: 'FULL' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityMaintenanceNeeds: [need], facilityMaintenanceActions: [action] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityMaintenanceActionsById).toEqual(world.facilityMaintenanceActionsById)
    expect(restored.facilityMaintenanceActionsById[action.id]!.resultingCondition).toBe(76)
    expect(restored.facilityMaintenanceActionsById[action.id]!.resultingServiceability).toBe('FULL')
  })

  it('round-trips a FacilityMaintenanceAction still in progress (null completedAt/outcome/resultingCondition)', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-4', kind: 'CAMPUS', name: 'Ops Save Campus 4' })
    const facility = createFacility({ id: 'facility:ops-save-4', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 4' })
    const action = createFacilityMaintenanceAction({ id: 'action:save-4', facilityId: facility.id, type: 'ROUTINE_MAINTENANCE', startedAt: '2030-02-01' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityMaintenanceActions: [action] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityMaintenanceActionsById[action.id]!.completedAt).toBeNull()
    expect(restored.facilityMaintenanceActionsById[action.id]!.outcome).toBeNull()
    expect(restored.facilityMaintenanceActionsById[action.id]!.resultingCondition).toBeNull()
  })

  it('round-trips a FacilityInspection that identified a maintenance need, preserving the cross-reference', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-5', kind: 'CAMPUS', name: 'Ops Save Campus 5' })
    const facility = createFacility({ id: 'facility:ops-save-5', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 5' })
    const component = createFacilityComponent({ id: 'component:ops-save-5', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const need = createFacilityMaintenanceNeed({ id: 'need:save-5', facilityId: facility.id, componentId: component.id, detectedAt: '2030-01-01', type: 'SURFACE', severity: 'MODERATE', status: 'OPEN', source: 'inspection:save-5' })
    const inspection = createFacilityInspection({ id: 'inspection:save-5', facilityId: facility.id, componentId: component.id, inspectedAt: '2030-01-01', finding: 'MAINTENANCE_NEED_IDENTIFIED', observedCondition: 55, producedNeedId: need.id })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityMaintenanceNeeds: [need], facilityInspections: [inspection] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityInspectionsById).toEqual(world.facilityInspectionsById)
    expect(restored.facilityInspectionsById[inspection.id]!.producedNeedId).toBe(need.id)
  })

  it('round-trips a FacilityInspection with NO_ISSUE and no cross-reference', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-6', kind: 'CAMPUS', name: 'Ops Save Campus 6' })
    const facility = createFacility({ id: 'facility:ops-save-6', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 6' })
    const inspection = createFacilityInspection({ id: 'inspection:save-6', facilityId: facility.id, inspectedAt: '2030-01-01', finding: 'NO_ISSUE' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityInspections: [inspection] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityInspectionsById[inspection.id]!.finding).toBe('NO_ISSUE')
    expect(restored.facilityInspectionsById[inspection.id]!.producedNeedId).toBeNull()
  })

  it('round-trips a FacilityOperationalIncident affecting a component and its serviceability effect', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-7', kind: 'CAMPUS', name: 'Ops Save Campus 7' })
    const facility = createFacility({ id: 'facility:ops-save-7', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 7' })
    const component = createFacilityComponent({ id: 'component:ops-save-7', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const need = createFacilityMaintenanceNeed({ id: 'need:save-7', facilityId: facility.id, componentId: component.id, detectedAt: '2030-03-10', type: 'STRUCTURAL', severity: 'MAJOR', status: 'OPEN', source: 'incident:save-7' })
    const incident = createFacilityOperationalIncident({ id: 'incident:save-7', facilityId: facility.id, componentId: component.id, category: 'PLUMBING', occurredAt: '2030-03-10', resultingServiceability: 'OUT_OF_SERVICE', producedNeedId: need.id })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityMaintenanceNeeds: [need], facilityOperationalIncidents: [incident] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityOperationalIncidentsById).toEqual(world.facilityOperationalIncidentsById)
    expect(restored.facilityOperationalIncidentsById[incident.id]!.resultingServiceability).toBe('OUT_OF_SERVICE')
  })

  it('a pre-CFI5 V4 payload (missing all four new collections entirely) still loads with empty, valid defaults', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-8', kind: 'CITY', name: 'Ops Save City 8' })
    const facility = createFacility({ id: 'facility:ops-save-8', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Ops Save Arena 8' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility] })
    const saved = serializeGameWorldV4(world, savedAt)

    // Simulate a genuinely pre-CFI5 payload: strip the four new collections entirely.
    const legacyPayload = { ...saved, payload: { ...saved.payload } } as { schemaVersion: 4; savedAt: string; payload: Record<string, unknown> }
    delete legacyPayload.payload.facilityMaintenanceNeeds
    delete legacyPayload.payload.facilityMaintenanceActions
    delete legacyPayload.payload.facilityInspections
    delete legacyPayload.payload.facilityOperationalIncidents

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(legacyPayload)))
    expect(restored.facilityMaintenanceNeedsById).toEqual({})
    expect(restored.facilityMaintenanceActionsById).toEqual({})
    expect(restored.facilityInspectionsById).toEqual({})
    expect(restored.facilityOperationalIncidentsById).toEqual({})
  })

  it('a reloaded world reproduces identical deterioration progression to the pre-save world for the same period', async () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:ops-save-9', kind: 'CAMPUS', name: 'Ops Save Campus 9' })
    const facility = createFacility({ id: 'facility:ops-save-9', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Save Center 9' })
    const component = createFacilityComponent({ id: 'component:ops-save-9', facilityId: facility.id, type: 'OUTDOOR_COURT', status: 'ACTIVE' })
    const { createFacilityComponentConditionRecord } = await import('@/domain/facilities')
    const conditionRecord = createFacilityComponentConditionRecord({ id: 'condition:ops-save-9', componentId: component.id, effectiveFrom: '2030-01-01', physicalCondition: 90, serviceability: 'FULL' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityComponentConditionRecords: [conditionRecord] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    const { calculateComponentDeterioration } = await import('@/engine/facilities')
    const { parseGameDate } = await import('@/domain/date')
    const originalResults = calculateComponentDeterioration(world, facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    const restoredResults = calculateComponentDeterioration(restored, facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    expect(restoredResults).toEqual(originalResults)
  })
})
