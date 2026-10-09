import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight, createPlace, type FacilityServiceability } from '@/domain/facilities'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { medicalFacilityContextForTeamAt } from '@/integration/facilitiesSporting'
import { resolveSportingOperation } from '@/integration/facilitiesSporting/SportingOperationResolver'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { buildMedicalWorkspaceModel } from '@/ui-ng/applications/medical/buildMedicalWorkspaceModel'
import { acceptMedicalRecommendation, progressMedicalAdvisories } from './MedicalAdvisory'
import { conductFitnessTest } from './FitnessTest'
import { progressRehabilitationSetbacks, setRehabilitationPlan } from './Rehabilitation'
import { reviewReturnToPlay } from './ReturnToPlayEngine'
import { progressAiMedicalLifecycle } from './AiMedicalLifecycle'

let baseline: GameWorld
beforeAll(() => {
  const base = deserializeGameWorldV4(serializeGameWorldV4(createNewGame(), '2026-10-09T00:00:00.000Z'))
  const team = getUserTeam(base)!
  const other = Object.values(base.teams).find((t) => t.coachId !== base.userCoachId)!
  const injury = createInjury({ id: injuryIdFromString('medical:m'), playerId: team.rosterPlayerIds[0]!, kind: 'kneeSprain', severity: 'serious', injuredOn: addDays(base.currentDate, -7), expectedReturnDate: addDays(base.currentDate, 20) })
  const aiInjury = createInjury({ ...injury, id: injuryIdFromString('medical:m-ai'), playerId: other.rosterPlayerIds[0]! })
  const staffId = staffPersonIdFromString('medical:m-doctor')
  const place = createPlace({ id: 'medical:m-place', kind: 'CAMPUS', name: 'Medical campus' })
  const facility = createFacility({ id: 'medical:m-facility', placeId: place.id, type: 'MEDICAL_CENTER', purposes: ['MEDICAL_TREATMENT'], status: 'ACTIVE', canonicalName: 'Medical center' })
  const component = createFacilityComponent({ id: 'medical:m-imaging', facilityId: facility.id, type: 'IMAGING_ROOM', status: 'ACTIVE' })
  baseline = updateGameWorld(base, {
    injuries: [injury, aiInjury], places: [...Object.values(base.placesById), place], facilities: [facility], facilityComponents: [component],
    facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'medical:m-condition', componentId: component.id, effectiveFrom: base.currentDate, serviceability: 'FULL', physicalCondition: 80 })],
    facilityUsageRights: [createFacilityUsageRight({ id: 'medical:m-right', facilityId: facility.id, teamId: team.id, purpose: 'MEDICAL', validFrom: base.currentDate })],
    staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Medical', lastName: 'Doctor' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } }],
    teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('medical:m-assignment'), staffPersonId: staffId, teamId: team.id, role: 'teamDoctor', assignedOn: base.currentDate }],
    responsibilities: [...Object.values(base.responsibilitiesById).filter((r) => r.id !== `responsibility:${team.id}:treatmentRecommendation`), { id: `responsibility:${team.id}:treatmentRecommendation` as never, teamId: team.id, kind: 'treatmentRecommendation', mode: 'advisory', holderStaffId: staffId }],
  })
  // Normalize legacy fixture Staff fields at the actual Save boundary before paired comparisons.
  baseline = deserializeGameWorldV4(serializeGameWorldV4(baseline, '2026-10-09T00:00:00.000Z'))
})

function service(world: GameWorld, value: FacilityServiceability) {
  return updateGameWorld(world, { facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById).map((record) => createFacilityComponentConditionRecord({ ...record, serviceability: value })) })
}
function withoutPhysical(world: GameWorld) {
  return Object.fromEntries(Object.entries(world).filter(([key]) => !key.startsWith('facility') && key !== 'facilitiesById' && key !== 'placesById'))
}
function imagingStatus(world: GameWorld) {
  return medicalFacilityContextForTeamAt(world, getUserTeam(world)!.id, world.currentDate).capabilities.find((capability) => capability.capability === 'MEDICAL_IMAGING')!.status
}
function assertClinicalEquivalence(a: GameWorld, b: GameWorld) {
  const injuryId = injuryIdFromString('medical:m')
  const actor = { kind: 'USER' as const, coachId: a.userCoachId }
  const rehabA = setRehabilitationPlan(a, { injuryId, mode: 'REST', actor }), rehabB = setRehabilitationPlan(b, { injuryId, mode: 'REST', actor })
  expect(rehabA.ok).toBe(true); expect(rehabB.ok).toBe(true)
  if (rehabA.ok && rehabB.ok) expect(withoutPhysical(rehabA.world)).toEqual(withoutPhysical(rehabB.world))
  expect(withoutPhysical(progressRehabilitationSetbacks(a))).toEqual(withoutPhysical(progressRehabilitationSetbacks(b)))
  const adviceA = progressMedicalAdvisories(a), adviceB = progressMedicalAdvisories(b)
  const outcome = Object.values(adviceA.delegationOutcomesById).find((o) => o.kind === 'treatmentRecommendation' && o.payload.injuryId === injuryId)!
  expect(outcome).toBeDefined(); expect(outcome.applied).toBe(false)
  expect(adviceA.injuriesById).toEqual(a.injuriesById)
  expect(withoutPhysical(adviceA)).toEqual(withoutPhysical(adviceB))
  const acceptedA = acceptMedicalRecommendation(adviceA, outcome.id), acceptedB = acceptMedicalRecommendation(adviceB, outcome.id)
  expect(acceptedA.ok).toBe(true); expect(acceptedB.ok).toBe(true)
  if (acceptedA.ok && acceptedB.ok) expect(withoutPhysical(acceptedA.world)).toEqual(withoutPhysical(acceptedB.world))
  const dueDate = a.injuriesById[injuryId]!.expectedReturnDate
  const dueA = updateGameWorld(a, { currentDate: dueDate }), dueB = updateGameWorld(b, { currentDate: dueDate })
  const testA = conductFitnessTest(dueA, { injuryId, actor }), testB = conductFitnessTest(dueB, { injuryId, actor })
  expect(testA.ok).toBe(true); expect(testB.ok).toBe(true)
  if (testA.ok && testB.ok) {
    expect(testA.record).toEqual(testB.record)
    expect(withoutPhysical(testA.world)).toEqual(withoutPhysical(testB.world))
    const clearA = reviewReturnToPlay(testA.world, { injuryId, decision: 'CLEAR_FOR_PLAY', actor })
    const clearB = reviewReturnToPlay(testB.world, { injuryId, decision: 'CLEAR_FOR_PLAY', actor })
    expect(clearA.ok).toBe(clearB.ok)
    if (clearA.ok && clearB.ok) expect(withoutPhysical(clearA.world)).toEqual(withoutPhysical(clearB.world))
    else if (!clearA.ok && !clearB.ok) expect(clearA.reason).toBe(clearB.reason)
  }
  const continuedA = reviewReturnToPlay(dueA, { injuryId, decision: 'CONTINUE_RECOVERY', actor }), continuedB = reviewReturnToPlay(dueB, { injuryId, decision: 'CONTINUE_RECOVERY', actor })
  expect(continuedA.ok).toBe(true); expect(continuedB.ok).toBe(true)
  if (continuedA.ok && continuedB.ok) expect(withoutPhysical(continuedA.world)).toEqual(withoutPhysical(continuedB.world))
  const aiA = progressAiMedicalLifecycle(a), aiB = progressAiMedicalLifecycle(b)
  expect(aiA.decisions.length).toBeGreaterThan(0)
  expect(aiA.decisions).toEqual(aiB.decisions)
  expect(withoutPhysical(aiA.world)).toEqual(withoutPhysical(aiB.world))
  expect(buildMedicalWorkspaceModel(a)).toEqual(buildMedicalWorkspaceModel(b))
}

describe('BS17D-M physical context is not a clinical procedure', () => {
  it.each(['LIMITED', 'OUT_OF_SERVICE'] as const)('changes CFI8 imaging to %s without changing clinical commands/results', (value) => {
    const changed = service(baseline, value)
    expect(imagingStatus(baseline)).toBe('AVAILABLE')
    expect(imagingStatus(changed)).toBe(value === 'LIMITED' ? 'LIMITED' : 'UNAVAILABLE')
    assertClinicalEquivalence(baseline, changed)
  })

  it('denies known equipment access without denying unrelated clinical operations', () => {
    const denied = updateGameWorld(baseline, { facilityUsageRights: [] })
    const resolution = resolveSportingOperation(denied, { teamId: getUserTeam(denied)!.id, date: denied.currentDate, operationId: 'physical-capability-audit', requirements: [{ capabilities: ['MEDICAL_IMAGING'] }] })
    expect(resolution.status).toBe('VERIFIED_UNAVAILABLE')
    expect(resolution.resources[0]!.reason).toBe('NO_ACCESS')
    assertClinicalEquivalence(baseline, denied)
  })

  it('preserves clinical continuity when physical information is absent', () => {
    const unknown = updateGameWorld(baseline, { places: Object.values(baseline.placesById).filter(place => place.id !== 'medical:m-place'), facilities: [], facilityComponents: [], facilityComponentConditionRecords: [], facilityUsageRights: [] })
    const resolution = resolveSportingOperation(unknown, { teamId: getUserTeam(unknown)!.id, date: unknown.currentDate, operationId: 'physical-capability-audit', requirements: [{ capabilities: ['MEDICAL_IMAGING'] }] })
    expect(resolution.status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
    assertClinicalEquivalence(baseline, unknown)
  })

  it('restores physical availability without inventing a clinical recovery effect', () => {
    const unavailable = service(baseline, 'OUT_OF_SERVICE'), restored = service(unavailable, 'FULL')
    expect(imagingStatus(unavailable)).toBe('UNAVAILABLE'); expect(imagingStatus(restored)).toBe('AVAILABLE')
    expect(withoutPhysical(restored)).toEqual(withoutPhysical(unavailable))
    assertClinicalEquivalence(unavailable, restored)
  })

  it('recognizes an entitled alternative as context, not as execution of a treatment', () => {
    const unavailable = service(baseline, 'OUT_OF_SERVICE')
    const component = createFacilityComponent({ ...Object.values(baseline.facilityComponentsById)[0]!, id: 'medical:m-alternative' })
    const alternative = updateGameWorld(unavailable, { facilityComponents: [...Object.values(unavailable.facilityComponentsById), component], facilityComponentConditionRecords: [...Object.values(unavailable.facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({ id: 'medical:m-alternative-condition', componentId: component.id, effectiveFrom: baseline.currentDate, serviceability: 'FULL', physicalCondition: 80 })] })
    expect(imagingStatus(alternative)).toBe('AVAILABLE')
    expect(alternative.injuriesById).toEqual(unavailable.injuriesById)
    assertClinicalEquivalence(unavailable, alternative)
  })

  it('round-trips physical and clinical facts and preserves productive Medical behavior after reload', () => {
    const unavailable = service(baseline, 'OUT_OF_SERVICE')
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(unavailable, '2026-10-09T00:00:00.000Z'))
    expect(imagingStatus(loaded)).toBe('UNAVAILABLE')
    expect(loaded.injuriesById).toEqual(unavailable.injuriesById)
    assertClinicalEquivalence(unavailable, loaded)
    const injuryId = injuryIdFromString('medical:m')
    const due = updateGameWorld(unavailable, { currentDate: unavailable.injuriesById[injuryId]!.expectedReturnDate })
    const tested = conductFitnessTest(due, { injuryId, actor: { kind: 'USER', coachId: due.userCoachId } })
    expect(tested.ok).toBe(true)
    if (tested.ok) {
      const reloadedResult = deserializeGameWorldV4(serializeGameWorldV4(tested.world, '2026-10-09T00:00:00.000Z'))
      expect(reloadedResult.injuriesById).toEqual(tested.world.injuriesById)
      const repeated = conductFitnessTest(reloadedResult, { injuryId, actor: { kind: 'USER', coachId: due.userCoachId } })
      // A failed test defers the review; a passed same-day test reuses the existing result.
      if (repeated.ok) expect(repeated.world.injuriesById).toEqual(reloadedResult.injuriesById)
      else expect(repeated.reason).toBe('TEST_NOT_DUE')
      expect(reloadedResult.injuriesById[injuryId]!.fitnessTests).toHaveLength(1)
    }
  })

  it('clears an eligible clinical review with no specialist equipment and does not change fatigue', () => {
    const unavailable = service(baseline, 'OUT_OF_SERVICE')
    const injury = createInjury({ id: injuryIdFromString('medical:m-minor'), playerId: getUserTeam(baseline)!.rosterPlayerIds[1]!, kind: 'ankleSprain', severity: 'minor', injuredOn: addDays(baseline.currentDate, -10), expectedReturnDate: baseline.currentDate })
    const a = updateGameWorld(baseline, { injuries: [...Object.values(baseline.injuriesById), injury] })
    const b = updateGameWorld(unavailable, { injuries: [...Object.values(unavailable.injuriesById), injury] })
    const actor = { kind: 'USER' as const, coachId: a.userCoachId }
    const clearA = reviewReturnToPlay(a, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor }), clearB = reviewReturnToPlay(b, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor })
    expect(clearA.ok).toBe(true); expect(clearB.ok).toBe(true)
    if (clearA.ok && clearB.ok) {
      expect(withoutPhysical(clearA.world)).toEqual(withoutPhysical(clearB.world))
      expect(clearB.world.injuriesById[injury.id]!.returnToPlay!.clearedOn).toBe(b.currentDate)
      expect(clearB.world.careerFatigueByPlayerId).toEqual(b.careerFatigueByPlayerId)
    }
  })
})
