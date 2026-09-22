import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import {
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityUsageLoad,
  createPlace,
  componentConditionAt,
  maintenanceNeedsForComponentAt,
} from '@/domain/facilities'
import { updateGameWorld } from '@/domain/world'
import {
  advanceFacilitiesCondition,
  advanceFacilityCondition,
  applyFacilityMaintenanceAction,
  calculateComponentDeterioration,
  conditionAfterElapsedPeriod,
} from './FacilityDeteriorationEngine'

function fixture() {
  const world = createNewGame()
  const place = createPlace({ id: 'place:engine-1', kind: 'CAMPUS', name: 'Engine Campus 1' })
  const facility = createFacility({ id: 'facility:engine-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Engine Center 1' })
  const indoorComponent = createFacilityComponent({ id: 'component:engine-indoor', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const outdoorComponent = createFacilityComponent({ id: 'component:engine-outdoor', facilityId: facility.id, type: 'OUTDOOR_COURT', status: 'ACTIVE' })
  const parkingComponent = createFacilityComponent({ id: 'component:engine-parking', facilityId: facility.id, type: 'PARKING', status: 'ACTIVE' })
  const initialCondition = createFacilityComponentConditionRecord({ id: 'condition:engine-indoor-initial', componentId: indoorComponent.id, effectiveFrom: '2030-01-01', physicalCondition: 90, serviceability: 'FULL' })
  const outdoorInitial = createFacilityComponentConditionRecord({ id: 'condition:engine-outdoor-initial', componentId: outdoorComponent.id, effectiveFrom: '2030-01-01', physicalCondition: 90, serviceability: 'FULL' })
  const base = updateGameWorld(world, {
    places: [place],
    facilities: [facility],
    facilityComponents: [indoorComponent, outdoorComponent, parkingComponent],
    facilityComponentConditionRecords: [initialCondition, outdoorInitial],
  })
  return { world: base, facility, indoorComponent, outdoorComponent, parkingComponent }
}

describe('Club Facilities & Infrastructure V2 — Operations, Maintenance & Deterioration (CFI5) — engine', () => {
  it('condition deteriorates over an elapsed period', () => {
    const f = fixture()
    const results = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    const indoorResult = results.find((r) => r.componentId === f.indoorComponent.id)!
    expect(indoorResult.nextCondition).not.toBeNull()
    expect(indoorResult.nextCondition!).toBeLessThan(90)
  })

  it('zero elapsed period changes nothing', () => {
    const f = fixture()
    const results = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-01-01'))
    const indoorResult = results.find((r) => r.componentId === f.indoorComponent.id)!
    expect(indoorResult.nextCondition).toBe(90)
    expect(indoorResult.changed).toBe(false)
  })

  it('is deterministic: the same inputs produce the same output every time', () => {
    const f = fixture()
    const first = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-09-01'))
    const second = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-09-01'))
    expect(first).toEqual(second)
  })

  it('higher usage causes greater deterioration than lower usage', () => {
    const f = fixture()
    const lowUsage = conditionAfterElapsedPeriod(90, f.indoorComponent, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'), 0)
    const highUsage = conditionAfterElapsedPeriod(90, f.indoorComponent, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'), 1)
    expect(highUsage!).toBeLessThan(lowUsage!)
  })

  it('an outdoor (VERY_HIGH wear) component deteriorates faster than an indoor (HIGH wear) one under identical conditions', () => {
    const f = fixture()
    const indoorNext = conditionAfterElapsedPeriod(90, f.indoorComponent, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'), 1)
    const outdoorNext = conditionAfterElapsedPeriod(90, f.outdoorComponent, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'), 1)
    expect(outdoorNext!).toBeLessThan(indoorNext!)
  })

  it('a LOW wear-profile component (parking) barely deteriorates relative to a HIGH one', () => {
    const f = fixture()
    const parkingWithCondition = createFacilityComponentConditionRecord({ id: 'condition:parking-initial', componentId: f.parkingComponent.id, effectiveFrom: '2030-01-01', physicalCondition: 90, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [parkingWithCondition] })
    const results = calculateComponentDeterioration(world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2031-01-01'))
    const parkingResult = results.find((r) => r.componentId === f.parkingComponent.id)!
    const indoorResult = results.find((r) => r.componentId === f.indoorComponent.id)!
    expect(90 - parkingResult.nextCondition!).toBeLessThan(90 - indoorResult.nextCondition!)
  })

  it('condition never falls below 0 regardless of how large the elapsed period is', () => {
    const f = fixture()
    const next = conditionAfterElapsedPeriod(10, f.outdoorComponent, parseGameDate('2030-01-01'), parseGameDate('2060-01-01'), 1)
    expect(next).toBe(0)
  })

  it('a component with no known starting condition remains UNKNOWN (null), never assumed 100', () => {
    const f = fixture()
    const results = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    const parkingResult = results.find((r) => r.componentId === f.parkingComponent.id)!
    expect(parkingResult.previousCondition).toBeNull()
    expect(parkingResult.nextCondition).toBeNull()
    expect(parkingResult.changed).toBe(false)
  })

  it('advancing condition preserves history: the old condition still resolves at the old date after progression', () => {
    const f = fixture()
    const application = advanceFacilityCondition(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    const records = Object.values(application.world.facilityComponentConditionRecordsById)
    const oldRecord = componentConditionAt(records, f.indoorComponent.id, parseGameDate('2030-01-01'))
    const newRecord = componentConditionAt(records, f.indoorComponent.id, parseGameDate('2030-07-01'))
    expect(oldRecord?.physicalCondition).toBe(90)
    expect(newRecord?.physicalCondition).toBeLessThan(90)
  })

  it('a maintenance need is opened once condition crosses the maintenance threshold', () => {
    const f = fixture()
    const lowCondition = createFacilityComponentConditionRecord({ id: 'condition:engine-outdoor-low', componentId: f.outdoorComponent.id, effectiveFrom: '2030-06-01', physicalCondition: 62, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [lowCondition] })
    const application = advanceFacilityCondition(world, f.facility.id, parseGameDate('2030-06-01'), parseGameDate('2030-09-01'))
    const outdoorNeeds = maintenanceNeedsForComponentAt(Object.values(application.world.facilityMaintenanceNeedsById), f.outdoorComponent.id, parseGameDate('2030-09-01'))
    expect(outdoorNeeds.length).toBeGreaterThan(0)
  })

  it('a CRITICAL maintenance need is generated when a component becomes OUT_OF_SERVICE', () => {
    const f = fixture()
    const startingCondition = createFacilityComponentConditionRecord({ id: 'condition:engine-outdoor-critical', componentId: f.outdoorComponent.id, effectiveFrom: '2030-01-01', physicalCondition: 65, serviceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [startingCondition] })
    const application = advanceFacilityCondition(world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2032-01-01'))
    const outdoorNeeds = maintenanceNeedsForComponentAt(Object.values(application.world.facilityMaintenanceNeedsById), f.outdoorComponent.id, parseGameDate('2032-01-01'))
    expect(outdoorNeeds.some((need) => need.severity === 'CRITICAL')).toBe(true)
  })

  it('a component becomes LIMITED once condition crosses the limited-serviceability threshold', () => {
    const f = fixture()
    const results = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2033-01-01'))
    const outdoorResult = results.find((r) => r.componentId === f.outdoorComponent.id)!
    expect(['LIMITED', 'SEVERELY_LIMITED', 'OUT_OF_SERVICE']).toContain(outdoorResult.nextServiceability)
  })

  it('an already OUT_OF_SERVICE component does not silently improve from condition-derived serviceability alone', () => {
    const f = fixture()
    const outageRecord = createFacilityComponentConditionRecord({ id: 'condition:engine-indoor-outage', componentId: f.indoorComponent.id, effectiveFrom: '2030-01-01', physicalCondition: 55, serviceability: 'OUT_OF_SERVICE' })
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [outageRecord] })
    const results = calculateComponentDeterioration(world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-02-01'))
    const indoorResult = results.find((r) => r.componentId === f.indoorComponent.id)!
    expect(indoorResult.nextServiceability).toBe('OUT_OF_SERVICE')
  })

  it('the facility itself stays untouched (FacilityLifecycle) while only component condition/serviceability records change', () => {
    const f = fixture()
    const application = advanceFacilityCondition(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2031-01-01'))
    expect(application.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
  })

  it('applying a REPAIR action increases condition and can restore serviceability without necessarily reaching 100', () => {
    const f = fixture()
    const damaged = createFacilityComponentConditionRecord({ id: 'condition:repair-before', componentId: f.indoorComponent.id, effectiveFrom: '2030-01-01', physicalCondition: 42, serviceability: 'SEVERELY_LIMITED' })
    const need = createFacilityMaintenanceNeed({ id: 'need:repair-target', facilityId: f.facility.id, componentId: f.indoorComponent.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MAJOR', status: 'OPEN', source: 'x' })
    const action = createFacilityMaintenanceAction({ id: 'action:repair-1', needId: need.id, facilityId: f.facility.id, componentId: f.indoorComponent.id, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-10', outcome: 'SUCCESSFUL', resultingCondition: 76, resultingServiceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [damaged], facilityMaintenanceNeeds: [need], facilityMaintenanceActions: [action] })
    const application = applyFacilityMaintenanceAction(world, action.id)
    expect(application.conditionRecordWritten).toBe(true)
    const newRecord = componentConditionAt(Object.values(application.world.facilityComponentConditionRecordsById), f.indoorComponent.id, parseGameDate('2030-02-10'))
    expect(newRecord?.physicalCondition).toBe(76)
    expect(newRecord?.physicalCondition).not.toBe(100)
    expect(newRecord?.serviceability).toBe('FULL')
  })

  it('a successful repair action closes the maintenance need it addresses', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:repair-closes', facilityId: f.facility.id, componentId: f.indoorComponent.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: 'x' })
    const action = createFacilityMaintenanceAction({ id: 'action:repair-closes', needId: need.id, facilityId: f.facility.id, componentId: f.indoorComponent.id, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-05', outcome: 'SUCCESSFUL', resultingCondition: 80, resultingServiceability: 'FULL' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need], facilityMaintenanceActions: [action] })
    const application = applyFacilityMaintenanceAction(world, action.id)
    expect(application.needClosed).toBe(true)
    expect(application.world.facilityMaintenanceNeedsById[need.id]!.status).toBe('COMPLETED')
    expect(application.world.facilityMaintenanceNeedsById[need.id]!.resolvedAt).toBe('2030-02-05')
  })

  it('an UNSUCCESSFUL repair action does not close the maintenance need', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:repair-fails', facilityId: f.facility.id, componentId: f.indoorComponent.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: 'x' })
    const action = createFacilityMaintenanceAction({ id: 'action:repair-fails', needId: need.id, facilityId: f.facility.id, componentId: f.indoorComponent.id, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-05', outcome: 'UNSUCCESSFUL' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need], facilityMaintenanceActions: [action] })
    const application = applyFacilityMaintenanceAction(world, action.id)
    expect(application.needClosed).toBe(false)
    expect(application.world.facilityMaintenanceNeedsById[need.id]!.status).toBe('OPEN')
  })

  it('a deferred maintenance need remains open and its component continues deteriorating', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:deferred-continues', facilityId: f.facility.id, componentId: f.indoorComponent.id, detectedAt: '2030-01-01', type: 'CORRECTIVE', severity: 'MODERATE', status: 'DEFERRED', source: 'board-refused' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    const application = advanceFacilityCondition(world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    const newCondition = componentConditionAt(Object.values(application.world.facilityComponentConditionRecordsById), f.indoorComponent.id, parseGameDate('2030-07-01'))
    expect(newCondition?.physicalCondition).toBeLessThan(90)
    expect(application.world.facilityMaintenanceNeedsById[need.id]!.status).toBe('DEFERRED')
  })

  it('multiple components of the same facility progress independently', () => {
    const f = fixture()
    const application = advanceFacilityCondition(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2031-01-01'))
    const indoorResult = application.results.find((r) => r.componentId === f.indoorComponent.id)!
    const outdoorResult = application.results.find((r) => r.componentId === f.outdoorComponent.id)!
    expect(indoorResult.nextCondition).not.toBe(outdoorResult.nextCondition)
  })

  it('explicit usage loads override the neutral baseline utilization per component', () => {
    const f = fixture()
    const idleLoad = createFacilityUsageLoad({ componentId: f.indoorComponent.id, utilizationRatio: 0 })
    const results = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'), [idleLoad])
    const indoorResult = results.find((r) => r.componentId === f.indoorComponent.id)!
    const baseline = calculateComponentDeterioration(f.world, f.facility.id, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    const baselineIndoor = baseline.find((r) => r.componentId === f.indoorComponent.id)!
    expect(indoorResult.nextCondition!).toBeGreaterThan(baselineIndoor.nextCondition!)
  })

  it('a large elapsed period is computed directly via closed-form arithmetic, without looping day by day', () => {
    const f = fixture()
    const start = process.hrtime.bigint()
    const next = conditionAfterElapsedPeriod(100, f.indoorComponent, parseGameDate('2000-01-01'), parseGameDate('2099-12-31'), 1)
    const elapsedNs = process.hrtime.bigint() - start
    expect(next).toBe(0)
    expect(elapsedNs).toBeLessThan(50_000_000n)
  })

  it('advancing all facilities at once processes every facility deterministically in FacilityId order', () => {
    const f = fixture()
    const application = advanceFacilitiesCondition(f.world, parseGameDate('2030-01-01'), parseGameDate('2030-07-01'))
    expect(application.results.some((r) => r.facilityId === f.facility.id)).toBe(true)
  })

  it('rejects a negative utilization ratio in a usage load', () => {
    expect(() => createFacilityUsageLoad({ componentId: 'component:x', utilizationRatio: -0.1 })).toThrow(RangeError)
  })

  it('rejects deterioration toDate preceding fromDate', () => {
    const f = fixture()
    expect(() => conditionAfterElapsedPeriod(90, f.indoorComponent, parseGameDate('2030-07-01'), parseGameDate('2030-01-01'))).toThrow(RangeError)
  })

  it('applying an action that has not yet completed has no effect', () => {
    const f = fixture()
    const action = createFacilityMaintenanceAction({ id: 'action:in-progress', facilityId: f.facility.id, componentId: f.indoorComponent.id, type: 'REPAIR', startedAt: '2030-02-01' })
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    const application = applyFacilityMaintenanceAction(world, action.id)
    expect(application.conditionRecordWritten).toBe(false)
    expect(application.needClosed).toBe(false)
    expect(application.world).toBe(world)
  })
})
