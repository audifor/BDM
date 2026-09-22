import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, GameWorldValidationError } from '@/domain/world'
import {
  componentOperationalReadinessAt,
  componentsRequiringMaintenanceAt,
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityInspection,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityOperationalIncident,
  createPlace,
  criticalMaintenanceNeedsAt,
  facilityOperationalReadinessAt,
  inspectionsForFacility,
  latestInspectionForComponentAt,
  maintenanceActionsForFacility,
  maintenanceHistoryForComponent,
  maintenanceNeedsForComponentAt,
  maintenanceNeedsForFacilityAt,
  openMaintenanceNeedsAt,
} from './index'

function fixture() {
  const world = createNewGame()
  const place = createPlace({ id: 'place:ops-1', kind: 'CAMPUS', name: 'Ops Campus 1' })
  const facility = createFacility({ id: 'facility:ops-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Ops Center 1' })
  const component = createFacilityComponent({ id: 'component:ops-1', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const base = updateGameWorld(world, { places: [place], facilities: [facility], facilityComponents: [component] })
  return { world: base, facility, component }
}

describe('Club Facilities & Infrastructure V2 — Operations, Maintenance & Deterioration (CFI5) — domain', () => {
  it('opens a maintenance need with a type/severity/status and resolves it later', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:1', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: 'inspection:1' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    expect(openMaintenanceNeedsAt(Object.values(world.facilityMaintenanceNeedsById), parseGameDate('2030-06-01'))).toHaveLength(1)
  })

  it('rejects a maintenance need with a completed status but no resolvedAt', () => {
    expect(() => createFacilityMaintenanceNeed({ id: 'need:invalid', facilityId: 'facility:x', detectedAt: '2030-01-01', type: 'ROUTINE', severity: 'MINOR', status: 'COMPLETED', source: 'x' })).toThrow(RangeError)
  })

  it('rejects a maintenance need with resolvedAt before detectedAt', () => {
    expect(() => createFacilityMaintenanceNeed({ id: 'need:invalid-2', facilityId: 'facility:x', detectedAt: '2030-01-10', type: 'ROUTINE', severity: 'MINOR', status: 'COMPLETED', source: 'x', resolvedAt: '2030-01-01' })).toThrow(RangeError)
  })

  it('critical maintenance needs query returns only CRITICAL severity, open needs', () => {
    const f = fixture()
    const needs = [
      createFacilityMaintenanceNeed({ id: 'need:minor', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'ROUTINE', severity: 'MINOR', status: 'OPEN', source: 'x' }),
      createFacilityMaintenanceNeed({ id: 'need:critical', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'SAFETY', severity: 'CRITICAL', status: 'OPEN', source: 'x' }),
      createFacilityMaintenanceNeed({ id: 'need:critical-closed', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'SAFETY', severity: 'CRITICAL', status: 'COMPLETED', source: 'x', resolvedAt: '2030-02-01' }),
    ]
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: needs })
    expect(criticalMaintenanceNeedsAt(Object.values(world.facilityMaintenanceNeedsById), parseGameDate('2030-06-01')).map((n) => n.id)).toEqual(['need:critical'])
  })

  it('deferred maintenance need remains open (not terminal)', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:deferred', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MAJOR', status: 'DEFERRED', source: 'board-decision' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    expect(openMaintenanceNeedsAt(Object.values(world.facilityMaintenanceNeedsById), parseGameDate('2030-06-01')).map((n) => n.id)).toEqual(['need:deferred'])
  })

  it('a maintenance action references its need and records outcome/resulting state', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:action-1', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: 'x' })
    const action = createFacilityMaintenanceAction({ id: 'action:1', needId: need.id, facilityId: f.facility.id, componentId: f.component.id, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-05', outcome: 'SUCCESSFUL', resultingCondition: 76, resultingServiceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need], facilityMaintenanceActions: [action] })
    expect(maintenanceActionsForFacility(Object.values(world.facilityMaintenanceActionsById), f.facility.id)).toHaveLength(1)
    expect(maintenanceHistoryForComponent(Object.values(world.facilityMaintenanceActionsById), f.component.id)[0]!.resultingCondition).toBe(76)
  })

  it('repair does not necessarily restore condition to 100', () => {
    const action = createFacilityMaintenanceAction({ id: 'action:partial', facilityId: 'facility:x', componentId: 'component:x', type: 'REPAIR', startedAt: '2030-01-01', completedAt: '2030-01-02', outcome: 'SUCCESSFUL', resultingCondition: 76 })
    expect(action.resultingCondition).toBe(76)
    expect(action.resultingCondition).not.toBe(100)
  })

  it('rejects a maintenance action with an outcome before it has completed', () => {
    expect(() => createFacilityMaintenanceAction({ id: 'action:invalid', facilityId: 'facility:x', type: 'REPAIR', startedAt: '2030-01-01', outcome: 'SUCCESSFUL' })).toThrow(RangeError)
  })

  it('rejects a maintenance action referencing a need from a different facility', () => {
    const f = fixture()
    const otherPlace = createPlace({ id: 'place:ops-other', kind: 'CITY', name: 'Other City' })
    const otherFacility = createFacility({ id: 'facility:ops-other', placeId: otherPlace.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Other Arena' })
    const need = createFacilityMaintenanceNeed({ id: 'need:cross', facilityId: otherFacility.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MINOR', status: 'OPEN', source: 'x' })
    const action = createFacilityMaintenanceAction({ id: 'action:cross', needId: need.id, facilityId: f.facility.id, type: 'REPAIR', startedAt: '2030-01-02' })
    expect(() => updateGameWorld(f.world, {
      places: [otherPlace],
      facilities: [otherFacility],
      facilityMaintenanceNeeds: [need],
      facilityMaintenanceActions: [action],
    })).toThrow(GameWorldValidationError)
  })

  it('an inspection with no issue records NO_ISSUE and no produced need', () => {
    const f = fixture()
    const inspection = createFacilityInspection({ id: 'inspection:no-issue', facilityId: f.facility.id, componentId: f.component.id, inspectedAt: '2030-01-01', finding: 'NO_ISSUE', observedCondition: 88 })
    const world = updateGameWorld(f.world, { facilityInspections: [inspection] })
    expect(inspectionsForFacility(Object.values(world.facilityInspectionsById), f.facility.id)).toHaveLength(1)
    expect(latestInspectionForComponentAt(Object.values(world.facilityInspectionsById), f.component.id, parseGameDate('2030-06-01'))?.finding).toBe('NO_ISSUE')
  })

  it('an inspection identifies an issue and cross-references the maintenance need it produced', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:from-inspection', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'SURFACE', severity: 'MODERATE', status: 'OPEN', source: 'inspection:issue' })
    const inspection = createFacilityInspection({ id: 'inspection:issue', facilityId: f.facility.id, componentId: f.component.id, inspectedAt: '2030-01-01', finding: 'MAINTENANCE_NEED_IDENTIFIED', observedCondition: 55, producedNeedId: need.id })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need], facilityInspections: [inspection] })
    expect(world.facilityInspectionsById[inspection.id]!.producedNeedId).toBe(need.id)
  })

  it('rejects an inspection claiming MAINTENANCE_NEED_IDENTIFIED without a producedNeedId', () => {
    expect(() => createFacilityInspection({ id: 'inspection:invalid', facilityId: 'facility:x', inspectedAt: '2030-01-01', finding: 'MAINTENANCE_NEED_IDENTIFIED' })).toThrow(RangeError)
  })

  it('an operational incident affects a component, opens a need, and alters serviceability', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:from-incident', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-03-10', type: 'STRUCTURAL', severity: 'MAJOR', status: 'OPEN', source: 'incident:plumbing' })
    const incident = createFacilityOperationalIncident({ id: 'incident:plumbing', facilityId: f.facility.id, componentId: f.component.id, category: 'PLUMBING', occurredAt: '2030-03-10', resultingServiceability: 'OUT_OF_SERVICE', producedNeedId: need.id })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need], facilityOperationalIncidents: [incident] })
    expect(world.facilityOperationalIncidentsById[incident.id]!.resultingServiceability).toBe('OUT_OF_SERVICE')
    expect(maintenanceNeedsForComponentAt(Object.values(world.facilityMaintenanceNeedsById), f.component.id, parseGameDate('2030-06-01'))).toHaveLength(1)
  })

  it('facility remains ACTIVE while a component is out of service due to an outage window, without touching FacilityLifecycle', () => {
    const f = fixture()
    const outageRecord = createFacilityComponentConditionRecord({ id: 'condition:outage', componentId: f.component.id, effectiveFrom: '2029-02-10', effectiveTo: '2029-02-17', serviceability: 'OUT_OF_SERVICE' })
    const restoredRecord = createFacilityComponentConditionRecord({ id: 'condition:restored', componentId: f.component.id, effectiveFrom: '2029-02-18', serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [outageRecord, restoredRecord] })
    expect(world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
  })

  it('facility operational readiness breaks down active/limited/unavailable components and maintenance needs as an explanatory structure, not an overall number', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:readiness', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'SAFETY', severity: 'CRITICAL', status: 'OPEN', source: 'x' })
    const conditionRecord = createFacilityComponentConditionRecord({ id: 'condition:readiness', componentId: f.component.id, effectiveFrom: '2030-01-01', serviceability: 'LIMITED' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need], facilityComponentConditionRecords: [conditionRecord] })
    const readiness = facilityOperationalReadinessAt(Object.values(world.facilityComponentsById), Object.values(world.facilityComponentConditionRecordsById), Object.values(world.facilityMaintenanceNeedsById), f.facility.id, parseGameDate('2030-06-01'))
    expect(readiness.limitedComponentIds).toEqual([f.component.id])
    expect(readiness.unavailableComponentIds).toEqual([])
    expect(readiness.criticalMaintenanceNeeds).toHaveLength(1)
    expect(componentsRequiringMaintenanceAt(Object.values(world.facilityComponentsById), Object.values(world.facilityMaintenanceNeedsById), parseGameDate('2030-06-01'))).toEqual([f.component.id])
  })

  it('component operational readiness matches the facility-wide breakdown for the same component', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:component-readiness', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-01', type: 'SAFETY', severity: 'CRITICAL', status: 'OPEN', source: 'x' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    const readiness = componentOperationalReadinessAt(Object.values(world.facilityComponentConditionRecordsById), Object.values(world.facilityMaintenanceNeedsById), f.component.id, parseGameDate('2030-06-01'))
    expect(readiness.criticalMaintenanceNeeds).toHaveLength(1)
    expect(readiness.serviceability).toBe('FULL')
  })

  it('maintenance need query rejects invalid component reference at the GameWorld boundary', () => {
    const f = fixture()
    expect(() => updateGameWorld(f.world, {
      facilityMaintenanceNeeds: [createFacilityMaintenanceNeed({ id: 'need:bad-component', facilityId: f.facility.id, componentId: 'component:does-not-exist', detectedAt: '2030-01-01', type: 'ROUTINE', severity: 'MINOR', status: 'OPEN', source: 'x' })],
    })).toThrow(GameWorldValidationError)
  })

  it('rejects a maintenance action referencing an unknown need', () => {
    const f = fixture()
    expect(() => updateGameWorld(f.world, {
      facilityMaintenanceActions: [createFacilityMaintenanceAction({ id: 'action:unknown-need', needId: 'need:does-not-exist', facilityId: f.facility.id, type: 'REPAIR', startedAt: '2030-01-01' })],
    })).toThrow(GameWorldValidationError)
  })

  it('rejects duplicate maintenance need IDs', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:dup', facilityId: f.facility.id, detectedAt: '2030-01-01', type: 'ROUTINE', severity: 'MINOR', status: 'OPEN', source: 'x' })
    expect(() => updateGameWorld(f.world, { facilityMaintenanceNeeds: [need, need] })).toThrow(GameWorldValidationError)
  })
})
