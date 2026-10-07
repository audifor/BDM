import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { createFacilityDevelopmentProject, type FacilityDevelopmentProjectStatus } from '@/domain/facilities'
import { updateGameWorld } from '@/domain/world'
import { buildClubFacilitiesWorkspaceModel, projectActionsFor, resolveClubFacilityAuthority } from './ClubFacilitiesReadModel'
import { createFacilityClubScenario } from './testFixtures'

/**
 * MX0.6 — the club facilities read boundary must be a pure projection of canonical Facilities truth:
 * same world, same answer; nothing persisted; unknown state reported as unknown rather than defaulted.
 */
describe('MX0.6 club facilities read boundary', () => {
  it('resolves club authority from canonical relationships only', () => {
    const scenario = createFacilityClubScenario()
    const authority = resolveClubFacilityAuthority(scenario.world, scenario.teamId)

    expect(authority.organizationId).toBe(scenario.organizationId)
    expect([...authority.facilityIds]).toEqual([scenario.trainingCenterId])
    expect([...authority.projectIds]).toEqual([
      scenario.scheduledProjectId,
      scenario.delayedProjectId,
      scenario.newFacilityProjectId,
      scenario.inProgressProjectId,
    ])
  })

  it('never leaks another organization’s facilities or projects into the club view', () => {
    const scenario = createFacilityClubScenario()
    const model = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)

    expect(model.facilities.map((facility) => facility.facilityId)).toEqual([scenario.trainingCenterId])
    expect(model.projects.some((project) => project.projectId === scenario.rivalProjectId)).toBe(false)
    expect(model.facilities.some((facility) => facility.facilityId === scenario.rivalFacilityId)).toBe(false)
    expect(model.organizationId).toBe(scenario.organizationId)
    expect(model.reportingCurrencyCode).toBe('EUR')
    expect(model.asOf).toBe(scenario.asOf)
  })

  it('projects facility anatomy, derived condition and honest unknown state', () => {
    const scenario = createFacilityClubScenario()
    const model = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)
    const facility = model.facilities[0]!

    expect(facility.name).toBe('MX0.6 Training Center')
    expect(facility.type).toBe('TRAINING_CENTER')
    expect(facility.status).toBe('ACTIVE')
    expect(facility.placeName).toBe('MX0.6 Training Campus')
    expect([...facility.accessKinds]).toEqual(['OWNED', 'USED'])
    expect(facility.purposes).toEqual(['TRAINING', 'ACADEMY_DEVELOPMENT'])
    expect(facility.activeComponentCount).toBe(4)
    expect(facility.knownConditionComponentCount).toBe(3)
    expect(facility.averageKnownCondition).toBeCloseTo(170 / 3, 4)
    expect(facility.worstKnownCondition).toBe(38)
    expect([...facility.limitedServiceComponentIds]).toEqual([scenario.physioComponentId, scenario.strengthComponentId])
    expect([...facility.outOfServiceComponentIds]).toEqual([])

    const unassessed = model.components.find((component) => component.componentId === 'component:mx06-office')!
    expect(unassessed.physicalCondition).toBeNull()
    // Canonical CFI4 policy: a component with no recorded condition was never recorded as impaired.
    expect(unassessed.serviceability).toBe('FULL')
  })

  it('reports maintenance needs, critical attention and recorded interventions', () => {
    const scenario = createFacilityClubScenario()
    const model = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)

    expect(model.needs).toHaveLength(2)
    expect(model.openNeeds.map((need) => need.needId)).toEqual(['need:mx06-physio-critical'])
    expect(model.openNeeds[0]!.severity).toBe('CRITICAL')
    expect(model.openNeeds[0]!.componentName).toBe('Physiotherapy Room')
    expect(model.criticalOpenNeeds.map((need) => need.needId)).toEqual(['need:mx06-physio-critical'])
    expect(model.maintenanceActions).toHaveLength(1)
    expect(model.maintenanceActions[0]!.outcome).toBe('PARTIAL')
    expect(model.maintenanceActions[0]!.resultingServiceability).toBe('LIMITED')
  })

  it('projects projects with canonical availability, phases, eligibility and delay', () => {
    const scenario = createFacilityClubScenario()
    const model = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)
    const byId = new Map(model.projects.map((project) => [project.projectId, project]))

    const scheduled = byId.get(scenario.scheduledProjectId)!
    expect(scheduled.status).toBe('SCHEDULED')
    expect(scheduled.eligibleToStart).toBe(true)
    expect([...scheduled.actions]).toEqual(['START', 'CANCEL'])
    expect(scheduled.scopeKind).toBe('ADD_COMPONENT')
    expect(scheduled.scopeSummary).toBe('Add 1 component(s)')
    expect(scheduled.money).toEqual([])
    expect(scheduled.underfundedAsOfDate).toBeNull()

    const inProgress = byId.get(scenario.inProgressProjectId)!
    expect(inProgress.eligibleToStart).toBe(false)
    expect([...inProgress.actions]).toEqual(['PAUSE', 'COMPLETE', 'CANCEL'])
    expect(inProgress.delayed).toBe(false)
    expect(inProgress.currentPhase?.name).toBe('Fit out')
    expect(inProgress.phases).toHaveLength(2)

    const delayed = byId.get(scenario.delayedProjectId)!
    expect(delayed.delayed).toBe(true)

    const planned = byId.get(scenario.newFacilityProjectId)!
    expect(planned.status).toBe('PLANNED')
    expect(planned.facilityId).toBeNull()
    expect(planned.facilityName).toBeNull()
    expect(planned.eligibleToStart).toBe(false)
    expect([...planned.actions]).toEqual(['START', 'CANCEL'])
    expect(planned.scopeSummary).toBe('New PERFORMANCE_CENTER · MX0.6 Performance Center · 1 planned component(s)')

    expect([...model.eligibleProjectIds]).toEqual([scenario.scheduledProjectId])
    expect([...model.activeProjectIds]).toEqual([
      scenario.scheduledProjectId,
      scenario.delayedProjectId,
      scenario.newFacilityProjectId,
      scenario.inProgressProjectId,
    ])
    expect(model.costs).toEqual([])
  })

  it('projects the canonical sporting effect context for the club', () => {
    const scenario = createFacilityClubScenario()
    const model = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)

    expect(model.sporting.teamId).toBe(scenario.teamId)
    const basketballTraining = model.sporting.basketball.capabilities.find((capability) => capability.capability === 'BASKETBALL_TRAINING')
    expect(basketballTraining?.status).toBe('AVAILABLE')
    const strengthTraining = model.sporting.strengthAndConditioning.capabilities.find((capability) => capability.capability === 'STRENGTH_TRAINING')
    expect(strengthTraining?.status).toBe('LIMITED')
  })

  it('is a pure projection: two builds of the same world are deep-equal', () => {
    const scenario = createFacilityClubScenario()
    const first = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)
    const second = buildClubFacilitiesWorkspaceModel(scenario.world, scenario.teamId)

    expect(second).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('rejects an unknown team instead of inventing an empty club', () => {
    const scenario = createFacilityClubScenario()
    expect(() => resolveClubFacilityAuthority(scenario.world, 'unknown-team' as typeof scenario.teamId)).toThrow(/Unknown team/)
    expect(() => buildClubFacilitiesWorkspaceModel(scenario.world, 'unknown-team' as typeof scenario.teamId)).toThrow(/Unknown team/)
  })
})

describe('MX0.6 project availability derives from the canonical transition graph', () => {
  const scope = { kind: 'ADD_COMPONENT' as const, components: [{ type: 'FILM_ROOM' as const }] }

  function project(status: FacilityDevelopmentProjectStatus) {
    const started = status === 'IN_PROGRESS' || status === 'PAUSED' || status === 'COMPLETED'
    return createFacilityDevelopmentProject({
      id: 'project:actions-probe',
      organizationId: 'organization:actions-probe',
      facilityId: 'facility:actions-probe',
      projectType: 'COMPONENT_ADDITION',
      status,
      scope,
      plannedStartDate: '2032-01-01',
      plannedCompletionDate: '2032-06-01',
      createdAt: '2031-12-01',
      ...(started ? { actualStartDate: '2032-01-01' } : {}),
      ...(status === 'COMPLETED' ? { actualCompletionDate: '2032-05-01' } : {}),
      ...(status === 'CANCELLED' ? { cancelledAt: '2032-02-01' } : {}),
    })
  }

  it('exposes exactly the transitions the canonical graph allows', () => {
    expect([...projectActionsFor(project('PLANNED'))]).toEqual(['START', 'CANCEL'])
    expect([...projectActionsFor(project('APPROVED'))]).toEqual(['START', 'CANCEL'])
    expect([...projectActionsFor(project('SCHEDULED'))]).toEqual(['START', 'CANCEL'])
    expect([...projectActionsFor(project('IN_PROGRESS'))]).toEqual(['PAUSE', 'COMPLETE', 'CANCEL'])
    expect([...projectActionsFor(project('PAUSED'))]).toEqual(['RESUME', 'CANCEL'])
    expect([...projectActionsFor(project('COMPLETED'))]).toEqual([])
    expect([...projectActionsFor(project('CANCELLED'))]).toEqual([])
  })

  it('keeps a paused project resumable and never exposes an approval command that does not exist', () => {
    const paused = projectActionsFor(project('PAUSED'))
    expect(paused).toContain('RESUME')
    expect(paused).not.toContain('START')
    expect(paused).not.toContain('PAUSE')
  })

  it('does not infer eligibility from today alone', () => {
    const scenario = createFacilityClubScenario()
    const future = createFacilityDevelopmentProject({
      id: 'project:mx06-future',
      organizationId: scenario.organizationId,
      facilityId: scenario.trainingCenterId,
      projectType: 'COMPONENT_ADDITION',
      status: 'SCHEDULED',
      scope,
      plannedStartDate: addDays(scenario.asOf, 30),
      plannedCompletionDate: addDays(scenario.asOf, 120),
      createdAt: scenario.asOf,
    })
    const world = updateGameWorld(scenario.world, {
      facilityDevelopmentProjects: [...Object.values(scenario.world.facilityDevelopmentProjectsById), future],
    })
    const model = buildClubFacilitiesWorkspaceModel(world, scenario.teamId)

    const row = model.projects.find((candidate) => candidate.projectId === future.id)!
    expect(row.eligibleToStart).toBe(false)
  })
})
