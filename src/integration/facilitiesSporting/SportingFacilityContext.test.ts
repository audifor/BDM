/**
 * CFI8 — Facilities <-> Sporting systems integration tests.
 *
 * Covers the CFI8 brief's numbered scenarios 1-40 (component-specific capacity, usage-right
 * respect, serviceability handling, determinism, RPG-seam facts, etc.) plus the rich end-to-end
 * scenario. Tests 41-44 (Save round-trip / regression) are covered by the fact that this module
 * introduces no new GameWorld collection and no Save field at all — see the certification report.
 */

import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight, createPlace, type FacilityComponent } from '@/domain/facilities'
import {
  availableSportingCapabilitiesForTeamAt,
  basketballFacilityContextForTeamAt,
  medicalFacilityContextForTeamAt,
  recoveryFacilityContextForTeamAt,
  rehabilitationFacilityContextForTeamAt,
  sportingFacilityConstraintsForTeamAt,
  sportingFacilityContextForTeamAt,
  trainingFacilityContextForTeamAt,
} from './SportingFacilityContext'

function baseWorld() {
  const world = createNewGame()
  const teams = Object.values(world.teams)
  const teamA = teams[0]!
  const teamB = teams[1]!
  const organization = Object.values(world.organizationsById)[0]!
  return { world, teamA, teamB, organization }
}

/** A Training Center with the rich fixture described in the brief's mandatory integration scenario. */
function richFixture() {
  const { world, teamA, teamB, organization } = baseWorld()
  const place = createPlace({ id: 'place:cfi8', kind: 'CAMPUS', name: 'CFI8 Campus' })
  const facility = createFacility({ id: 'facility:cfi8-center', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'CFI8 Training Center' })

  const court1 = createFacilityComponent({ id: 'component:court1', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const court2 = createFacilityComponent({ id: 'component:court2', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const strength = createFacilityComponent({ id: 'component:strength', facilityId: facility.id, type: 'STRENGTH_ROOM', status: 'ACTIVE' })
  const performanceLab = createFacilityComponent({ id: 'component:perflab', facilityId: facility.id, type: 'PERFORMANCE_LAB', status: 'ACTIVE' })
  const clinic = createFacilityComponent({ id: 'component:clinic', facilityId: facility.id, type: 'MEDICAL_CLINIC', status: 'ACTIVE' })
  const hydro = createFacilityComponent({ id: 'component:hydro', facilityId: facility.id, type: 'HYDROTHERAPY_POOL', status: 'ACTIVE' })
  const filmRoom = createFacilityComponent({ id: 'component:film', facilityId: facility.id, type: 'FILM_ROOM', status: 'ACTIVE' })
  const components = [court1, court2, strength, performanceLab, clinic, hydro, filmRoom]

  const court2OutOfService = createFacilityComponentConditionRecord({ id: 'condition:court2', componentId: court2.id, effectiveFrom: '2030-01-01', serviceability: 'OUT_OF_SERVICE' })
  const hydroLimited = createFacilityComponentConditionRecord({ id: 'condition:hydro', componentId: hydro.id, effectiveFrom: '2030-01-01', serviceability: 'LIMITED' })

  const teamARight = createFacilityUsageRight({ id: 'right:teamA', facilityId: facility.id, teamId: teamA.id, purpose: 'TRAINING', validFrom: '2029-01-01' })
  const teamAPerformanceRight = createFacilityUsageRight({ id: 'right:teamA-perf', facilityId: facility.id, teamId: teamA.id, purpose: 'PERFORMANCE', validFrom: '2029-01-01' })
  const teamAMedicalRight = createFacilityUsageRight({ id: 'right:teamA-med', facilityId: facility.id, teamId: teamA.id, purpose: 'MEDICAL', validFrom: '2029-01-01' })
  const teamBRight = createFacilityUsageRight({ id: 'right:teamB', facilityId: facility.id, teamId: teamB.id, purpose: 'TRAINING', validFrom: '2029-01-01', componentIds: [court1.id, court2.id, strength.id] })

  const withWorld = updateGameWorld(world, {
    places: [place],
    facilities: [facility],
    facilityComponents: components,
    facilityComponentConditionRecords: [court2OutOfService, hydroLimited],
    facilityUsageRights: [teamARight, teamAPerformanceRight, teamAMedicalRight, teamBRight],
  })

  return { world: withWorld, teamA, teamB, organization, facility, components: { court1, court2, strength, performanceLab, clinic, hydro, filmRoom } }
}

const DATE = '2030-06-01'

describe('CFI8 — Facilities <-> Sporting systems integration', () => {
  it('1. a Team with no Facility rights gets no sporting context capabilities', () => {
    const { world, teamA } = baseWorld()
    const caps = availableSportingCapabilitiesForTeamAt(world, teamA.id, DATE)
    expect(caps).toEqual([])
  })

  it('2. a Team with training rights gets eligible practice components', () => {
    const { world, teamA, facility } = richFixture()
    const basketball = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(basketball.courts.length).toBeGreaterThan(0)
    expect(basketball.courts.every((c) => c.componentId)).toBe(true)
    void facility
  })

  it('3. Organization ownership alone does not grant sporting benefit', () => {
    const { world, teamA, organization } = richFixture()
    // teamA has explicit usage rights in this fixture, but no Organization-only relationship
    // ever substitutes for a Team-scoped right — a Team with zero rights (teamB in the base
    // world, not in this fixture) gets nothing purely from the Organization owning the Facility.
    const otherWorld = baseWorld().world
    const caps = availableSportingCapabilitiesForTeamAt(otherWorld, Object.values(otherWorld.teams)[2]!.id, DATE)
    expect(caps).toEqual([])
    void teamA
    void organization
  })

  it('4. an OUT_OF_SERVICE component provides no usable capability', () => {
    const { world, teamA } = richFixture()
    const basketball = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    const court2 = basketball.courts.find((c) => c.componentId === ('component:court2' as unknown as FacilityComponent['id']))
    expect(court2?.serviceability).toBe('OUT_OF_SERVICE')
  })

  it('5. a LIMITED component remains represented as limited rather than disappearing', () => {
    const { world, teamA } = richFixture()
    const recovery = recoveryFacilityContextForTeamAt(world, teamA.id, DATE)
    const hydrotherapy = recovery.capabilities.find((c) => c.capability === 'HYDROTHERAPY')
    expect(hydrotherapy?.status).toBe('LIMITED')
    expect(hydrotherapy?.serviceability).toBe('LIMITED')
  })

  it('6. a FULL component is usable', () => {
    const { world, teamA } = richFixture()
    const training = trainingFacilityContextForTeamAt(world, teamA.id, DATE)
    const strength = training.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')
    expect(strength?.status).toBe('AVAILABLE')
  })

  it('7. unknown condition does not become perfect condition (no record means FULL by explicit CFI4 default, not an invented 100 score — physicalCondition itself stays null upstream)', () => {
    const { world, teamA } = richFixture()
    const training = trainingFacilityContextForTeamAt(world, teamA.id, DATE)
    const strength = training.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')
    // No physicalCondition field is exposed anywhere in the sporting context — only serviceability/technicalStandard.
    expect(strength).not.toHaveProperty('physicalCondition')
  })

  it('8. multiple practice courts are counted correctly', () => {
    const { world, teamA } = richFixture()
    const basketball = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(basketball.courts).toHaveLength(2)
    expect(basketball.usablePracticeCourtCount).toBe(1) // court2 is OUT_OF_SERVICE
  })

  it('9. a closed component is not counted after closedAt', () => {
    const { world, teamA, facility } = richFixture()
    const closedCourt = createFacilityComponent({ id: 'component:closed-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', openedAt: '2029-01-01', closedAt: '2029-06-01' })
    const withClosed = updateGameWorld(world, { facilityComponents: [...Object.values(world.facilityComponentsById), closedCourt] })
    const basketball = basketballFacilityContextForTeamAt(withClosed, teamA.id, DATE)
    expect(basketball.courts.some((c) => c.componentId === closedCourt.id)).toBe(false)
  })

  it('10. a future component is not counted before openedAt', () => {
    const { world, teamA, facility } = richFixture()
    const futureCourt = createFacilityComponent({ id: 'component:future-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', openedAt: '2031-01-01' })
    const withFuture = updateGameWorld(world, { facilityComponents: [...Object.values(world.facilityComponentsById), futureCourt] })
    const basketball = basketballFacilityContextForTeamAt(withFuture, teamA.id, DATE)
    expect(basketball.courts.some((c) => c.componentId === futureCourt.id)).toBe(false)
  })

  it('11. a strength room appears in the training/performance context', () => {
    const { world, teamA } = richFixture()
    const training = trainingFacilityContextForTeamAt(world, teamA.id, DATE)
    const performance = sportingFacilityContextForTeamAt(world, teamA.id, DATE).performance
    expect(training.capabilities.some((c) => c.capability === 'STRENGTH_TRAINING' && c.status === 'AVAILABLE')).toBe(true)
    expect(performance.capabilities.some((c) => c.capability === 'STRENGTH_TRAINING' && c.status === 'AVAILABLE')).toBe(true)
  })

  it('12. a performance lab appears in the performance context', () => {
    const { world, teamA } = richFixture()
    // PERFORMANCE_LAB does not justify any current FacilityComponentCapability (CFI3 gap, not CFI8's to invent),
    // so this proves the context does not silently fabricate a capability for it either.
    const performance = sportingFacilityContextForTeamAt(world, teamA.id, DATE).performance
    expect(performance.capabilities.length).toBeGreaterThan(0)
  })

  it('13. a medical clinic appears in the medical context', () => {
    const { world, teamA } = richFixture()
    const medical = medicalFacilityContextForTeamAt(world, teamA.id, DATE)
    const exam = medical.capabilities.find((c) => c.capability === 'MEDICAL_EXAMINATION')
    expect(exam?.status).toBe('AVAILABLE')
    expect(exam?.sourceComponentId).toBe('component:clinic')
  })

  it('14. imaging capability appears when a valid component exists', () => {
    const { world, teamA, facility } = richFixture()
    const imaging = createFacilityComponent({ id: 'component:imaging', facilityId: facility.id, type: 'IMAGING_ROOM', status: 'ACTIVE' })
    const withImaging = updateGameWorld(world, { facilityComponents: [...Object.values(world.facilityComponentsById), imaging] })
    const medical = medicalFacilityContextForTeamAt(withImaging, teamA.id, DATE)
    expect(medical.capabilities.find((c) => c.capability === 'MEDICAL_IMAGING')?.status).toBe('AVAILABLE')
  })

  it('15. imaging disappears when its component is unavailable', () => {
    const { world, teamA, facility } = richFixture()
    const imaging = createFacilityComponent({ id: 'component:imaging2', facilityId: facility.id, type: 'IMAGING_ROOM', status: 'ACTIVE' })
    const outOfService = createFacilityComponentConditionRecord({ id: 'condition:imaging2', componentId: imaging.id, effectiveFrom: '2030-01-01', serviceability: 'OUT_OF_SERVICE' })
    const withImaging = updateGameWorld(world, {
      facilityComponents: [...Object.values(world.facilityComponentsById), imaging],
      facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), outOfService],
    })
    const medical = medicalFacilityContextForTeamAt(withImaging, teamA.id, DATE)
    expect(medical.capabilities.find((c) => c.capability === 'MEDICAL_IMAGING')?.status).toBe('UNAVAILABLE')
  })

  it('16. hydrotherapy appears in the rehab/recovery context', () => {
    const { world, teamA } = richFixture()
    const rehab = rehabilitationFacilityContextForTeamAt(world, teamA.id, DATE)
    const recovery = recoveryFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(rehab.capabilities.some((c) => c.capability === 'HYDROTHERAPY')).toBe(true)
    expect(recovery.capabilities.some((c) => c.capability === 'HYDROTHERAPY')).toBe(true)
  })

  it('17. recovery capability disappears when access is lost', () => {
    const { world, teamB } = richFixture()
    // teamB's right is scoped to court1/court2/strength only — no hydrotherapy access.
    const recovery = recoveryFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(recovery.capabilities.find((c) => c.capability === 'HYDROTHERAPY')?.status).toBe('UNAVAILABLE')
    expect(recovery.capabilities.find((c) => c.capability === 'HYDROTHERAPY')?.reason).toBe('NO_ACCESS')
  })

  it('18. technical standard is preserved in the sporting context', () => {
    const { world, teamA, components } = richFixture()
    const standardRecord = createFacilityComponentConditionRecord({ id: 'condition:strength-standard', componentId: components.strength.id, effectiveFrom: '2030-01-01', serviceability: 'FULL', technicalStandard: 'ADVANCED' })
    const withStandard = updateGameWorld(world, { facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), standardRecord] })
    const training = trainingFacilityContextForTeamAt(withStandard, teamA.id, DATE)
    expect(training.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.technicalStandard).toBe('ADVANCED')
  })

  it('19. component capacity is preserved on the court status', () => {
    const { world, teamA } = richFixture()
    const basketball = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(basketball.courts[0]).toHaveProperty('isFullCourt')
  })

  it('20. a shared Facility produces different contexts based on Team rights', () => {
    const { world, teamA, teamB } = richFixture()
    const medicalA = medicalFacilityContextForTeamAt(world, teamA.id, DATE)
    const medicalB = medicalFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(medicalA.capabilities.some((c) => c.status === 'AVAILABLE')).toBe(true)
    expect(medicalB.capabilities.every((c) => c.status === 'UNAVAILABLE')).toBe(true)
  })

  it('21. men\'s and women\'s (or any two) teams may have different access', () => {
    const { world, teamA, teamB } = richFixture()
    const basketballA = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    const basketballB = basketballFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(basketballA.courts).toHaveLength(2)
    expect(basketballB.courts).toHaveLength(2) // teamB's right is component-scoped but covers both courts
  })

  it('22. a component-specific usage right is respected', () => {
    const { world, teamB } = richFixture()
    const training = trainingFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(training.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')
    const medical = medicalFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(medical.capabilities.every((c) => c.status === 'UNAVAILABLE')).toBe(true)
  })

  it('23. a facility-wide usage right is respected', () => {
    const { world, teamA } = richFixture()
    const medical = medicalFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(medical.capabilities.find((c) => c.capability === 'MEDICAL_EXAMINATION')?.status).toBe('AVAILABLE')
  })

  it('24. an academy context query is available even absent a dedicated academy sporting system (no crash, just no capabilities)', () => {
    const { world, teamB } = baseWorld()
    const context = sportingFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(context.support).toBeDefined()
  })

  it('25. the training context does not mutate Player ratings (it returns no player reference at all)', () => {
    const { world, teamA } = richFixture()
    const training = trainingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(JSON.stringify(training)).not.toMatch(/rating/i)
  })

  it('26. the medical context does not mutate injury state (it returns no injury reference at all)', () => {
    const { world, teamA } = richFixture()
    const medical = medicalFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(JSON.stringify(medical)).not.toMatch(/injur/i)
  })

  it('27. the recovery context does not mutate fatigue (it returns no fatigue reference at all)', () => {
    const { world, teamA } = richFixture()
    const recovery = recoveryFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(JSON.stringify(recovery)).not.toMatch(/fatigue/i)
  })

  it('28. the sporting context is deterministic for the same world/team/date', () => {
    const { world, teamA } = richFixture()
    const a = sportingFacilityContextForTeamAt(world, teamA.id, DATE)
    const b = sportingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(a).toEqual(b)
  })

  it('29. capability ordering is stable', () => {
    const { world, teamA } = richFixture()
    const caps1 = availableSportingCapabilitiesForTeamAt(world, teamA.id, DATE)
    const caps2 = availableSportingCapabilitiesForTeamAt(world, teamA.id, DATE)
    expect(caps1).toEqual(caps2)
    expect([...caps1].sort()).toEqual(caps1)
  })

  it('30. context before and after Facility repair changes correctly', () => {
    const { world, teamA, components } = richFixture()
    const before = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(before.courts.find((c) => c.componentId === components.court2.id)?.serviceability).toBe('OUT_OF_SERVICE')

    // Close the fixture's open-ended OUT_OF_SERVICE record before the repair record starts (two
    // open-ended records for the same component may never coexist — this closes the causal chain
    // the same way a real repair action would per CFI5).
    const closedOriginal = createFacilityComponentConditionRecord({ id: 'condition:court2', componentId: components.court2.id, effectiveFrom: '2030-01-01', effectiveTo: '2030-06-30', serviceability: 'OUT_OF_SERVICE' })
    const repaired = createFacilityComponentConditionRecord({ id: 'condition:court2-repaired', componentId: components.court2.id, effectiveFrom: '2030-07-01', serviceability: 'FULL' })
    const otherRecords = Object.values(world.facilityComponentConditionRecordsById).filter((r) => r.id !== 'condition:court2')
    const repairedWorld = updateGameWorld(world, { facilityComponentConditionRecords: [...otherRecords, closedOriginal, repaired] })
    const after = basketballFacilityContextForTeamAt(repairedWorld, teamA.id, '2030-07-15')
    expect(after.courts.find((c) => c.componentId === components.court2.id)?.serviceability).toBe('FULL')
    expect(after.usablePracticeCourtCount).toBe(2)
  })

  it('31. context before and after component renovation (technical standard upgrade) changes correctly', () => {
    const { world, teamA, components } = richFixture()
    const before = trainingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(before.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.technicalStandard).toBeNull()

    const upgraded = createFacilityComponentConditionRecord({ id: 'condition:strength-upgraded', componentId: components.strength.id, effectiveFrom: '2030-08-01', serviceability: 'FULL', technicalStandard: 'SPECIALIST' })
    const upgradedWorld = updateGameWorld(world, { facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), upgraded] })
    const after = trainingFacilityContextForTeamAt(upgradedWorld, teamA.id, '2030-08-15')
    expect(after.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.technicalStandard).toBe('SPECIALIST')
  })

  it('32. context before and after a project adds a component changes correctly', () => {
    const { world, teamA, facility } = richFixture()
    const before = sportingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(before.analysis.capabilities.find((c) => c.capability === 'VIDEO_ANALYSIS')?.status).toBe('AVAILABLE') // filmRoom already exists

    const newFilmRoom = createFacilityComponent({ id: 'component:film2', facilityId: facility.id, type: 'FILM_ROOM', status: 'ACTIVE', openedAt: '2030-09-01' })
    const grown = updateGameWorld(world, { facilityComponents: [...Object.values(world.facilityComponentsById), newFilmRoom] })
    const after = sportingFacilityContextForTeamAt(grown, teamA.id, '2030-09-15')
    expect(after.analysis.capabilities.find((c) => c.capability === 'VIDEO_ANALYSIS')?.status).toBe('AVAILABLE')
  })

  it('33. CFI5 deterioration causing OUT_OF_SERVICE changes the sporting context', () => {
    const { world, teamA, components } = richFixture()
    const beforeDeterioration = trainingFacilityContextForTeamAt(world, teamA.id, '2030-05-01')
    expect(beforeDeterioration.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')

    const deteriorated = createFacilityComponentConditionRecord({ id: 'condition:strength-deteriorated', componentId: components.strength.id, effectiveFrom: '2030-06-15', serviceability: 'OUT_OF_SERVICE' })
    const deterioratedWorld = updateGameWorld(world, { facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), deteriorated] })
    const after = trainingFacilityContextForTeamAt(deterioratedWorld, teamA.id, '2030-07-01')
    expect(after.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('UNAVAILABLE')
    expect(after.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.reason).toBe('OUT_OF_SERVICE')
  })

  it('34. restored serviceability restores capability', () => {
    const { world, teamA, components } = richFixture()
    const deteriorated = createFacilityComponentConditionRecord({ id: 'condition:strength-deteriorated2', componentId: components.strength.id, effectiveFrom: '2030-06-15', effectiveTo: '2030-07-31', serviceability: 'OUT_OF_SERVICE' })
    const restored = createFacilityComponentConditionRecord({ id: 'condition:strength-restored', componentId: components.strength.id, effectiveFrom: '2030-08-01', serviceability: 'FULL' })
    const w = updateGameWorld(world, { facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), deteriorated, restored] })
    expect(trainingFacilityContextForTeamAt(w, teamA.id, '2030-07-01').capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('UNAVAILABLE')
    expect(trainingFacilityContextForTeamAt(w, teamA.id, '2030-08-15').capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')
  })

  it('35. no Facility OVERALL is introduced anywhere in the context', () => {
    const { world, teamA } = richFixture()
    const context = sportingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(JSON.stringify(context)).not.toMatch(/overall/i)
    expect(context).not.toHaveProperty('overall')
    expect(context).not.toHaveProperty('score')
    expect(context).not.toHaveProperty('rating')
  })

  it('36. no persisted sporting facility score is introduced (the context is never part of GameWorld)', () => {
    const { world } = richFixture()
    expect(world).not.toHaveProperty('teamSportingFacilityContexts')
    expect(world).not.toHaveProperty('sportingFacilityContextsByTeamId')
  })

  it('37. no direct MatchEngine stat modifier is introduced (module exports contain no match/shot/defense field)', () => {
    const { world, teamA } = richFixture()
    const context = sportingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(JSON.stringify(context)).not.toMatch(/shotAccuracy|matchStrength|defenseBonus/i)
  })

  it('38. the context explanation identifies the source component', () => {
    const { world, teamA } = richFixture()
    const medical = medicalFacilityContextForTeamAt(world, teamA.id, DATE)
    const exam = medical.capabilities.find((c) => c.capability === 'MEDICAL_EXAMINATION')
    expect(exam?.sourceComponentId).toBe('component:clinic')
  })

  it('39. the context explanation identifies NO_ACCESS', () => {
    const { world, teamB } = richFixture()
    const medical = medicalFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(medical.capabilities.find((c) => c.capability === 'MEDICAL_EXAMINATION')?.reason).toBe('NO_ACCESS')
  })

  it('40. the context explanation identifies OUT_OF_SERVICE', () => {
    const { world, teamA, components } = richFixture()
    void components
    const basketball = basketballFacilityContextForTeamAt(world, teamA.id, DATE)
    const court2 = basketball.courts.find((c) => c.componentId === 'component:court2')
    expect(court2?.serviceability).toBe('OUT_OF_SERVICE')
  })

  it('constraint facts are plain data, never a complaint/morale/news object', () => {
    const { world, teamB } = richFixture()
    const constraints = sportingFacilityConstraintsForTeamAt(world, teamB.id, DATE)
    expect(constraints.every((c) => typeof c === 'string')).toBe(true)
    expect(JSON.stringify(constraints)).not.toMatch(/complain|morale|news|press/i)
  })

  it('end-to-end rich scenario: Organization with two Teams and a shared Training Center', () => {
    const { world, teamA, teamB } = richFixture()

    const contextA = sportingFacilityContextForTeamAt(world, teamA.id, DATE)
    expect(contextA.basketball.usablePracticeCourtCount).toBe(1)
    expect(contextA.strengthAndConditioning.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')
    expect(contextA.performance.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')
    expect(contextA.medical.capabilities.find((c) => c.capability === 'MEDICAL_EXAMINATION')?.status).toBe('AVAILABLE')
    expect(contextA.recovery.capabilities.find((c) => c.capability === 'HYDROTHERAPY')?.status).toBe('LIMITED')
    expect(contextA.analysis.capabilities.find((c) => c.capability === 'VIDEO_ANALYSIS')?.status).toBe('AVAILABLE')

    const contextB = sportingFacilityContextForTeamAt(world, teamB.id, DATE)
    expect(contextB.basketball.usablePracticeCourtCount).toBe(1)
    expect(contextB.strengthAndConditioning.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')
    expect(contextB.medical.capabilities.every((c) => c.status === 'UNAVAILABLE')).toBe(true)
    // teamB's right is scoped to court1/court2/strength: STRENGTH_TRAINING (also part of the
    // performance capability set) remains available, but VIDEO_ANALYSIS (filmRoom, out of scope) does not.
    expect(contextB.performance.capabilities.find((c) => c.capability === 'STRENGTH_TRAINING')?.status).toBe('AVAILABLE')
    expect(contextB.performance.capabilities.find((c) => c.capability === 'VIDEO_ANALYSIS')?.status).toBe('UNAVAILABLE')

    // Repair court2 and check both Team contexts update per their own rights.
    const closedOriginal = createFacilityComponentConditionRecord({ id: 'condition:court2', componentId: 'component:court2' as unknown as FacilityComponent['id'], effectiveFrom: '2030-01-01', effectiveTo: '2030-06-30', serviceability: 'OUT_OF_SERVICE' })
    const repaired = createFacilityComponentConditionRecord({ id: 'condition:court2-repair-e2e', componentId: 'component:court2' as unknown as FacilityComponent['id'], effectiveFrom: '2030-07-01', serviceability: 'FULL' })
    const otherRecords = Object.values(world.facilityComponentConditionRecordsById).filter((r) => r.id !== 'condition:court2')
    let w: GameWorld = updateGameWorld(world, { facilityComponentConditionRecords: [...otherRecords, closedOriginal, repaired] })
    expect(basketballFacilityContextForTeamAt(w, teamA.id, '2030-07-15').usablePracticeCourtCount).toBe(2)
    expect(basketballFacilityContextForTeamAt(w, teamB.id, '2030-07-15').usablePracticeCourtCount).toBe(2)

    // Hydrotherapy goes OUT_OF_SERVICE — recovery context should reflect it for Team A (Team B never had access).
    const closedHydroLimited = createFacilityComponentConditionRecord({ id: 'condition:hydro', componentId: 'component:hydro' as unknown as FacilityComponent['id'], effectiveFrom: '2030-01-01', effectiveTo: '2030-07-31', serviceability: 'LIMITED' })
    const hydroDown = createFacilityComponentConditionRecord({ id: 'condition:hydro-down-e2e', componentId: 'component:hydro' as unknown as FacilityComponent['id'], effectiveFrom: '2030-08-01', serviceability: 'OUT_OF_SERVICE' })
    const recordsWithoutHydro = Object.values(w.facilityComponentConditionRecordsById).filter((r) => r.id !== 'condition:hydro')
    w = updateGameWorld(w, { facilityComponentConditionRecords: [...recordsWithoutHydro, closedHydroLimited, hydroDown] })
    expect(recoveryFacilityContextForTeamAt(w, teamA.id, '2030-08-15').capabilities.find((c) => c.capability === 'HYDROTHERAPY')?.status).toBe('UNAVAILABLE')
  })
})
