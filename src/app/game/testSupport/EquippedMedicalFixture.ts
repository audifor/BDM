import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight, createPlace } from '@/domain/facilities'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { indicateEquippedRehabilitation, scheduleEquippedRehabilitation } from '@/engine/injury/EquippedRehabilitation'

export function equippedMedicalFixture() {
  const base = deserializeGameWorldV4(serializeGameWorldV4(createNewGame(), '2026-10-10T00:00:00.000Z'))
  const team = getUserTeam(base)!, date = addDays(base.currentDate, 1)
  const staffId = staffPersonIdFromString('m1:professional'), assignmentId = teamStaffAssignmentIdFromString('m1:assignment')
  const injury = createInjury({ id: injuryIdFromString('m1:injury'), playerId: team.rosterPlayerIds[0]!, kind: 'kneeSprain', severity: 'serious', injuredOn: addDays(base.currentDate, -3), expectedReturnDate: addDays(base.currentDate, 25) })
  const place = createPlace({ id: 'm1:place', kind: 'CAMPUS', name: 'Explicit test site' })
  const facility = createFacility({ id: 'm1:facility', placeId: place.id, type: 'MEDICAL_CENTER', purposes: ['MEDICAL_TREATMENT', 'TRAINING'], status: 'ACTIVE', canonicalName: 'Fixture facility' })
  const court = createFacilityComponent({ id: 'm1:court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', occupancySharing: 'EXCLUSIVE', specification: { kind: 'CAPACITY', amount: 20, unit: 'SIMULTANEOUS_PLAYERS' } })
  const component = createFacilityComponent({ id: 'm1:physio', parentComponentId: court.id, facilityId: facility.id, type: 'PHYSIO_ROOM', status: 'ACTIVE', occupancySharing: 'EXCLUSIVE', equipmentTags: ['fixture:equipped-rehab'], rehabilitationEquipmentEvidence: { sourceRef: 'fixture:explicit-material-observation', equipmentTags: ['fixture:equipped-rehab'], validFrom: base.currentDate, validTo: addDays(base.currentDate, 40), functionality: 'FUNCTIONAL' } })
  const world = updateGameWorld(base, {
    injuries: [injury], places: [...Object.values(base.placesById), place], facilities: [...Object.values(base.facilitiesById), facility], facilityComponents: [...Object.values(base.facilityComponentsById), court, component],
    facilityComponentConditionRecords: [court, component].map(item => createFacilityComponentConditionRecord({ id: `${item.id}:condition`, componentId: item.id, effectiveFrom: base.currentDate, serviceability: 'FULL', physicalCondition: 80 })),
    facilityUsageRights: [createFacilityUsageRight({ id: 'm1:right', facilityId: facility.id, teamId: team.id, purpose: 'MEDICAL', validFrom: base.currentDate }), createFacilityUsageRight({ id: 'm1:training-right', facilityId: facility.id, teamId: team.id, purpose: 'TRAINING', validFrom: base.currentDate })],
    staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Explicit', lastName: 'Fixture clinician' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map(key => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>, clinicalAuthorizations: [{ id: 'm1:authorization', assignmentId, operation: 'EQUIPPED_REHABILITATION_SESSION', actions: ['INDICATE', 'PERFORM'], eligibility: 'VERIFIED', credentialEvidenceRef: 'fixture:explicit-clinical-credential', validFrom: base.currentDate, validTo: addDays(base.currentDate, 40) }] } }],
    teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: assignmentId, staffPersonId: staffId, teamId: team.id, role: 'rehabilitationSpecialist', assignedOn: base.currentDate }],
  })
  const indication = { id: 'm1:act', injuryId: injury.id, prescribingStaffId: staffId, requiredEquipmentTags: ['fixture:equipped-rehab'] }
  const schedule = { actId: indication.id, interval: { date, startTime: '10:00', durationMinutes: 60 }, performingStaffId: staffId, componentId: component.id, requestId: 'explicit-slot', confirm: true }
  const indicated = indicateEquippedRehabilitation(world, indication)
  return { world, indicated, scheduled: scheduleEquippedRehabilitation(indicated, schedule), team, staffId, assignmentId, injury, component, court, facility, date, indication, schedule }
}
