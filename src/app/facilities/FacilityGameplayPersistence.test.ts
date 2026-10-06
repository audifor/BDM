import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { advanceFacilityCondition } from '@/engine/facilities'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

import { buildClubFacilitiesWorkspaceModel } from './ClubFacilitiesReadModel'
import { pauseClubFacilityProject, startClubFacilityProject } from './FacilityProjectCommands'
import { createFacilityClubScenario } from './testFixtures'

/**
 * MX0.6 — a facility project played through the product layer must survive a save/load round-trip
 * with no derived state: the workspace is rebuilt from the reloaded world and must be identical,
 * and the canonical exactly-once guarantee must still hold after reloading.
 */
describe('MX0.6 facility gameplay persistence', () => {
  it('round-trips a funded project start and keeps the workspace identical', () => {
    const scenario = createFacilityClubScenario()
    const started = startClubFacilityProject(scenario.world, {
      teamId: scenario.teamId,
      projectId: scenario.scheduledProjectId,
      startedAt: scenario.asOf,
      commitment: { currencyCode: 'EUR', minorUnits: 3_000_000 },
    })
    expect(started.status).toBe('APPLIED')
    const before = buildClubFacilitiesWorkspaceModel(started.world, scenario.teamId)

    const saved = serializeGameWorldV4(started.world, '2032-10-01T00:00:00.000Z')
    const restored = deserializeGameWorldV4(saved)

    expect(restored.facilitiesById).toEqual(started.world.facilitiesById)
    expect(restored.facilityComponentsById).toEqual(started.world.facilityComponentsById)
    expect(restored.facilityComponentConditionRecordsById).toEqual(started.world.facilityComponentConditionRecordsById)
    expect(restored.facilityUsageRightsById).toEqual(started.world.facilityUsageRightsById)
    expect(restored.facilityOwnershipInterestsById).toEqual(started.world.facilityOwnershipInterestsById)
    expect(restored.facilityMaintenanceNeedsById).toEqual(started.world.facilityMaintenanceNeedsById)
    expect(restored.facilityMaintenanceActionsById).toEqual(started.world.facilityMaintenanceActionsById)
    expect(restored.facilityDevelopmentProjectsById).toEqual(started.world.facilityDevelopmentProjectsById)
    expect(restored.facilityDevelopmentProjectPhasesById).toEqual(started.world.facilityDevelopmentProjectPhasesById)
    expect(restored.facilityFinancialBindingsById).toEqual(started.world.facilityFinancialBindingsById)
    expect(restored.financialCommitmentsById).toEqual(started.world.financialCommitmentsById)
    expect(restored.organizationFinancialProfilesById).toEqual(started.world.organizationFinancialProfilesById)

    expect(buildClubFacilitiesWorkspaceModel(restored, scenario.teamId)).toEqual(before)
  })

  it('keeps the exactly-once guarantee and further commands available after reloading', () => {
    const scenario = createFacilityClubScenario()
    const started = startClubFacilityProject(scenario.world, {
      teamId: scenario.teamId,
      projectId: scenario.scheduledProjectId,
      commitment: { currencyCode: 'EUR', minorUnits: 1_200_000 },
    })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(started.world, '2032-10-01T00:00:00.000Z'))

    // Re-issuing the funded start on the reloaded world must block, not duplicate commitments.
    const repeated = startClubFacilityProject(restored, {
      teamId: scenario.teamId,
      projectId: scenario.scheduledProjectId,
      commitment: { currencyCode: 'EUR', minorUnits: 1_200_000 },
    })
    expect(repeated.status).toBe('BLOCKED')
    expect(Object.keys(repeated.world.financialCommitmentsById)).toEqual(Object.keys(restored.financialCommitmentsById))

    const paused = pauseClubFacilityProject(restored, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })
    expect(paused.status).toBe('APPLIED')
    expect(paused.world.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!.status).toBe('PAUSED')

    const reloadedAgain = deserializeGameWorldV4(serializeGameWorldV4(paused.world, '2032-10-05T00:00:00.000Z'))
    expect(reloadedAgain.facilityDevelopmentProjectsById).toEqual(paused.world.facilityDevelopmentProjectsById)
  })

  it('round-trips facility condition recorded by the canonical deterioration engine', () => {
    const scenario = createFacilityClubScenario()
    const advanced = advanceFacilityCondition(scenario.world, scenario.trainingCenterId, scenario.asOf, addDays(scenario.asOf, 400))

    expect(Object.keys(advanced.world.facilityComponentConditionRecordsById).length).toBeGreaterThan(3)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(advanced.world, '2032-10-01T00:00:00.000Z'))
    expect(restored.facilityComponentConditionRecordsById).toEqual(advanced.world.facilityComponentConditionRecordsById)
    expect(restored.facilityMaintenanceNeedsById).toEqual(advanced.world.facilityMaintenanceNeedsById)
  })

  it('leaves the shipped prototype universe producing an honest empty club view', () => {
    // The shipped prototype world contains no Facility at all today: the product must say so rather
    // than show a fabricated page, and this suite pins that truth until generation exists.
    const pristine = createNewGame()
    const team = getUserTeam(pristine)!
    const model = buildClubFacilitiesWorkspaceModel(pristine, team.id)

    expect(model.facilities).toEqual([])
    expect(model.components).toEqual([])
    expect(model.needs).toEqual([])
    expect(model.maintenanceActions).toEqual([])
    expect(model.projects).toEqual([])
    expect(model.costs).toEqual([])
    expect(model.organizationId).toBe(team.organizationId)
  })
})
