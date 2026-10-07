import { createNewGame } from '@/app/game'
import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import {
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityDevelopmentProject,
  createFacilityDevelopmentProjectPhase,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityOwnershipInterest,
  createFacilityUsageRight,
  createPlace,
} from '@/domain/facilities'
import {
  facilityComponentIdFromString,
  facilityDevelopmentProjectIdFromString,
  facilityIdFromString,
  facilityMaintenanceNeedIdFromString,
  type FacilityComponentId,
  type FacilityDevelopmentProjectId,
  type FacilityId,
  type OrganizationId,
  type TeamId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { createOrganizationFinancialProfile } from '@/domain/finance'

/**
 * MX0.6 fixture — a club Organization with canonical Facilities truth.
 *
 * The shipped prototype world contains **no** Facility at all (no facility generation authority
 * exists yet), so every Facilities product test must build its own canonical state through the same
 * domain factories the CFI milestones use. Nothing here bypasses a canonical creator or invents a
 * business rule the engine does not already implement: the fixture only asserts that the club's
 * facilities are what the club's Organization is canonically involved with.
 */
export interface FacilityClubScenario {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly organizationId: OrganizationId
  readonly rivalOrganizationId: OrganizationId
  readonly trainingCenterId: FacilityId
  readonly rivalFacilityId: FacilityId
  readonly courtComponentId: FacilityComponentId
  readonly strengthComponentId: FacilityComponentId
  readonly physioComponentId: FacilityComponentId
  readonly scheduledProjectId: FacilityDevelopmentProjectId
  readonly inProgressProjectId: FacilityDevelopmentProjectId
  readonly delayedProjectId: FacilityDevelopmentProjectId
  readonly newFacilityProjectId: FacilityDevelopmentProjectId
  readonly rivalProjectId: FacilityDevelopmentProjectId
  readonly asOf: GameDate
}

export function createFacilityClubScenario(): FacilityClubScenario {
  const base = createNewGame()
  const userTeam = getUserTeam(base)!
  const organizationId = userTeam.organizationId
  const asOf = base.currentDate
  // An existing generated club Organization plays the rival: Facility relationships must reference a
  // real Organization, and the world validates that.
  const rivalOrganizationId = Object.values(base.organizationsById).find((organization) => organization.id !== organizationId)!.id

  const campus = createPlace({ id: 'place:mx06-campus', kind: 'CAMPUS', name: 'MX0.6 Training Campus' })
  const rivalPlace = createPlace({ id: 'place:mx06-rival', kind: 'CITY', name: 'Rival City' })
  const trainingCenterId = facilityIdFromString('facility:mx06-training-center')
  const rivalFacilityId = facilityIdFromString('facility:mx06-rival-arena')

  const trainingCenter = createFacility({
    id: trainingCenterId,
    placeId: campus.id,
    type: 'TRAINING_CENTER',
    purposes: ['TRAINING', 'ACADEMY_DEVELOPMENT'],
    capabilities: [],
    status: 'ACTIVE',
    canonicalName: 'MX0.6 Training Center',
    physical: { openedOn: '2004-09-01', courtCount: 2 },
  })
  const rivalArena = createFacility({
    id: rivalFacilityId,
    placeId: rivalPlace.id,
    type: 'ARENA',
    purposes: ['MATCH_HOSTING'],
    capabilities: [],
    status: 'ACTIVE',
    canonicalName: 'MX0.6 Rival Arena',
  })

  const courtComponentId = facilityComponentIdFromString('component:mx06-court-1')
  const strengthComponentId = facilityComponentIdFromString('component:mx06-strength')
  const physioComponentId = facilityComponentIdFromString('component:mx06-physio')
  const officeComponentId = facilityComponentIdFromString('component:mx06-office')
  const components = [
    createFacilityComponent({ id: courtComponentId, facilityId: trainingCenterId, type: 'PRACTICE_COURT', name: 'Practice Court 1', status: 'ACTIVE', openedAt: '2004-09-01' }),
    createFacilityComponent({ id: strengthComponentId, facilityId: trainingCenterId, type: 'STRENGTH_ROOM', name: 'Strength Room', status: 'ACTIVE', openedAt: '2004-09-01' }),
    createFacilityComponent({ id: physioComponentId, facilityId: trainingCenterId, type: 'PHYSIO_ROOM', name: 'Physiotherapy Room', status: 'ACTIVE', openedAt: '2004-09-01' }),
    // Deliberately never assessed: a component with no condition record must read as "not recorded", never as 100.
    createFacilityComponent({ id: officeComponentId, facilityId: trainingCenterId, type: 'GENERAL_OFFICE', name: 'Back Office', status: 'ACTIVE', openedAt: '2004-09-01' }),
  ]

  const conditionRecords = [
    createFacilityComponentConditionRecord({ id: 'condition:mx06-court-1', componentId: courtComponentId, effectiveFrom: addDays(asOf, -120), serviceability: 'FULL', physicalCondition: 78, technicalStandard: 'ADVANCED' }),
    createFacilityComponentConditionRecord({ id: 'condition:mx06-strength', componentId: strengthComponentId, effectiveFrom: addDays(asOf, -120), serviceability: 'LIMITED', physicalCondition: 54 }),
    createFacilityComponentConditionRecord({ id: 'condition:mx06-physio', componentId: physioComponentId, effectiveFrom: addDays(asOf, -120), serviceability: 'SEVERELY_LIMITED', physicalCondition: 38 }),
  ]

  const needId = facilityMaintenanceNeedIdFromString('need:mx06-physio-critical')
  const resolvedNeedId = facilityMaintenanceNeedIdFromString('need:mx06-strength-routine')
  const needs = [
    // Open, critical: must surface as "attention" without inviting the product to invent a repair policy.
    createFacilityMaintenanceNeed({ id: needId, facilityId: trainingCenterId, componentId: physioComponentId, detectedAt: addDays(asOf, -45), type: 'EQUIPMENT', severity: 'CRITICAL', status: 'OPEN', source: 'CFI5 deterioration' }),
    createFacilityMaintenanceNeed({ id: resolvedNeedId, facilityId: trainingCenterId, componentId: strengthComponentId, detectedAt: addDays(asOf, -60), type: 'ROUTINE', severity: 'MINOR', status: 'COMPLETED', source: 'CFI5 deterioration', resolvedAt: addDays(asOf, -15) }),
  ]
  const maintenanceActions = [
    createFacilityMaintenanceAction({ id: 'action:mx06-strength-routine', needId: resolvedNeedId, facilityId: trainingCenterId, componentId: strengthComponentId, type: 'ROUTINE_MAINTENANCE', startedAt: addDays(asOf, -30), completedAt: addDays(asOf, -15), outcome: 'PARTIAL', resultingCondition: 54, resultingServiceability: 'LIMITED' }),
  ]

  const scheduledProjectId = facilityDevelopmentProjectIdFromString('project:mx06-add-hydrotherapy')
  const inProgressProjectId = facilityDevelopmentProjectIdFromString('project:mx06-renovate-strength')
  const newFacilityProjectId = facilityDevelopmentProjectIdFromString('project:mx06-new-performance-center')
  const delayedProjectId = facilityDevelopmentProjectIdFromString('project:mx06-delayed-replacement')
  const rivalProjectId = facilityDevelopmentProjectIdFromString('project:mx06-rival-project')

  const scheduledProject = createFacilityDevelopmentProject({
    id: scheduledProjectId,
    organizationId,
    facilityId: trainingCenterId,
    projectType: 'COMPONENT_ADDITION',
    status: 'SCHEDULED',
    scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL', name: 'Hydrotherapy Pool' }] },
    plannedStartDate: asOf,
    plannedCompletionDate: addDays(asOf, 120),
    createdAt: addDays(asOf, -40),
    reason: 'Recovery capacity',
  })
  const inProgressProject = createFacilityDevelopmentProject({
    id: inProgressProjectId,
    organizationId,
    facilityId: trainingCenterId,
    projectType: 'COMPONENT_RENOVATION',
    status: 'IN_PROGRESS',
    scope: { kind: 'RENOVATE_COMPONENT', componentId: strengthComponentId, resultingCondition: 88 },
    plannedStartDate: addDays(asOf, -30),
    actualStartDate: addDays(asOf, -30),
    plannedCompletionDate: addDays(asOf, 90),
    createdAt: addDays(asOf, -45),
  })
  const delayedProject = createFacilityDevelopmentProject({
    id: delayedProjectId,
    organizationId,
    facilityId: trainingCenterId,
    projectType: 'COMPONENT_REPLACEMENT',
    status: 'IN_PROGRESS',
    scope: { kind: 'REPLACE_COMPONENT', retiredComponentId: courtComponentId, replacement: { type: 'MAIN_COURT', name: 'Replacement Court' }, resultingCondition: 92 },
    plannedStartDate: addDays(asOf, -400),
    actualStartDate: addDays(asOf, -400),
    plannedCompletionDate: addDays(asOf, -20),
    createdAt: addDays(asOf, -410),
  })
  const newFacilityProject = createFacilityDevelopmentProject({
    id: newFacilityProjectId,
    organizationId,
    projectType: 'NEW_FACILITY',
    status: 'PLANNED',
    scope: { kind: 'CREATE_FACILITY', placeId: 'place:mx06-campus', facilityType: 'PERFORMANCE_CENTER', canonicalName: 'MX0.6 Performance Center', initialComponents: [{ type: 'PERFORMANCE_LAB', name: 'Performance Lab' }] },
    plannedStartDate: addDays(asOf, 200),
    plannedCompletionDate: addDays(asOf, 700),
    createdAt: addDays(asOf, -10),
  })
  const rivalProject = createFacilityDevelopmentProject({
    id: rivalProjectId,
    organizationId: rivalOrganizationId,
    facilityId: rivalFacilityId,
    projectType: 'COMPONENT_ADDITION',
    status: 'SCHEDULED',
    scope: { kind: 'ADD_COMPONENT', components: [{ type: 'VIP_BOX' }] },
    plannedStartDate: asOf,
    plannedCompletionDate: addDays(asOf, 120),
    createdAt: addDays(asOf, -40),
  })

  const phases = [
    createFacilityDevelopmentProjectPhase({ id: 'phase:mx06-renovate-1', projectId: inProgressProjectId, sequence: 1, name: 'Strip out', status: 'COMPLETED', plannedStart: addDays(asOf, -30), plannedCompletion: addDays(asOf, -14), actualStart: addDays(asOf, -30), actualCompletion: addDays(asOf, -14) }),
    createFacilityDevelopmentProjectPhase({ id: 'phase:mx06-renovate-2', projectId: inProgressProjectId, sequence: 2, name: 'Fit out', status: 'IN_PROGRESS', plannedStart: addDays(asOf, -13), plannedCompletion: addDays(asOf, 90), actualStart: addDays(asOf, -13) }),
  ]

  const world = updateGameWorld(base, {
    places: [campus, rivalPlace],
    facilities: [trainingCenter, rivalArena],
    facilityComponents: components,
    facilityComponentConditionRecords: conditionRecords,
    facilityMaintenanceNeeds: needs,
    facilityMaintenanceActions: maintenanceActions,
    facilityDevelopmentProjects: [scheduledProject, inProgressProject, delayedProject, newFacilityProject, rivalProject],
    facilityDevelopmentProjectPhases: phases,
    facilityOwnershipInterests: [
      createFacilityOwnershipInterest({ id: 'ownership:mx06-club', facilityId: trainingCenterId, owner: { kind: 'ORGANIZATION', organizationId }, ownershipPercentage: 100, validFrom: '2004-09-01' }),
      createFacilityOwnershipInterest({ id: 'ownership:mx06-rival', facilityId: rivalFacilityId, owner: { kind: 'ORGANIZATION', organizationId: rivalOrganizationId }, ownershipPercentage: 100, validFrom: '2004-09-01' }),
    ],
    facilityUsageRights: [
      createFacilityUsageRight({ id: 'usage:mx06-club-training', facilityId: trainingCenterId, componentIds: null, organizationId, teamId: userTeam.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', priority: 'PRIMARY', validFrom: '2004-09-01' }),
    ],
    organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 7 })],
  })

  return Object.freeze({
    world,
    teamId: userTeam.id,
    organizationId,
    rivalOrganizationId,
    trainingCenterId,
    rivalFacilityId,
    courtComponentId,
    strengthComponentId,
    physioComponentId,
    scheduledProjectId,
    inProgressProjectId,
    delayedProjectId,
    newFacilityProjectId,
    rivalProjectId,
    asOf: parseGameDate(asOf),
  })
}
