import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { facilityDevelopmentProjectIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { buildClubFacilitiesWorkspaceModel } from './ClubFacilitiesReadModel'
import {
  cancelClubFacilityProject,
  completeClubFacilityProject,
  pauseClubFacilityProject,
  resumeClubFacilityProject,
  startClubFacilityProject,
} from './FacilityProjectCommands'
import { createFacilityClubScenario } from './testFixtures'

/**
 * MX0.6 — the club project command boundary must (a) only act on the club's own Organization's
 * projects, (b) apply exactly the canonical engine/integration command, and (c) report a canonical
 * precondition as a stable reason instead of throwing.
 */
describe('MX0.6 club facility project commands', () => {
  it('writes club-scoped reasons instead of throwing for foreign or unknown projects', () => {
    const scenario = createFacilityClubScenario()
    const unknown = facilityDevelopmentProjectIdFromString('project:does-not-exist')

    expect(startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.rivalProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_PROJECT'] })
    expect(pauseClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.rivalProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_PROJECT'] })
    expect(completeClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.rivalProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_PROJECT'] })
    expect(cancelClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.rivalProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_PROJECT'] })
    expect(startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: unknown })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_NOT_FOUND'] })
    expect(startClubFacilityProject(scenario.world, { teamId: 'unknown-team' as typeof scenario.teamId, projectId: scenario.scheduledProjectId })).toMatchObject({
      status: 'BLOCKED',
      reasons: ['UNKNOWN_TEAM'],
    })
  })

  it('starts a scheduled project through the canonical engine and records the actual start date', () => {
    const scenario = createFacilityClubScenario()
    const result = startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })

    expect(result.status).toBe('APPLIED')
    expect(result.world).not.toBe(scenario.world)
    expect(result.development).toMatchObject({ projectId: scenario.scheduledProjectId, previousStatus: 'SCHEDULED', newStatus: 'IN_PROGRESS' })
    const project = result.world.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!
    expect(project.status).toBe('IN_PROGRESS')
    expect(project.actualStartDate).toBe(scenario.asOf)
    expect(result.world.facilitiesById[scenario.trainingCenterId]!.status).toBe('ACTIVE')
  })

  it('starts a new-facility project by creating the canonical Facility in UNDER_CONSTRUCTION', () => {
    const scenario = createFacilityClubScenario()
    const result = startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.newFacilityProjectId })

    expect(result.status).toBe('APPLIED')
    const created = String(result.development!.createdFacilityIds[0])
    expect(created).toBe(`facility:${scenario.newFacilityProjectId}`)
    expect(result.world.facilitiesById[created as keyof typeof result.world.facilitiesById]!.status).toBe('UNDER_CONSTRUCTION')

    const model = buildClubFacilitiesWorkspaceModel(result.world, scenario.teamId)
    expect(model.facilities).toHaveLength(2)
    expect(model.facilities.some((facility) => String(facility.facilityId) === created)).toBe(true)
  })

  it('funds a start through CFI7 and exposes the canonical commitment facts', () => {
    const scenario = createFacilityClubScenario()
    const result = startClubFacilityProject(scenario.world, {
      teamId: scenario.teamId,
      projectId: scenario.scheduledProjectId,
      commitment: { currencyCode: 'EUR', minorUnits: 2_500_000 },
    })

    expect(result.status).toBe('APPLIED')
    expect(result.finance).toMatchObject({ physicalOutcome: 'PROJECT_STARTED', financialOutcome: 'FACILITY_EXPENDITURE_COMMITTED' })
    expect(result.finance!.createdCommitmentIds).toHaveLength(1)
    expect(result.finance!.createdBindingIds).toHaveLength(1)
    const commitmentId = result.finance!.createdCommitmentIds[0]!
    expect(result.world.financialCommitmentsById[commitmentId as keyof typeof result.world.financialCommitmentsById]!.amount).toMatchObject({ currencyCode: 'EUR', minorUnits: 2_500_000 })
    expect(result.world.facilityFinancialBindingsById[result.finance!.createdBindingIds[0]!]!.sourceId).toBe(scenario.scheduledProjectId)

    const model = buildClubFacilitiesWorkspaceModel(result.world, scenario.teamId)
    const project = model.projects.find((candidate) => candidate.projectId === scenario.scheduledProjectId)!
    expect(project.status).toBe('IN_PROGRESS')
    expect(project.money).toEqual([
      { currencyCode: 'EUR', committedMinorUnits: 2_500_000, recognizedMinorUnits: 0, paidMinorUnits: 0, outstandingCommitmentMinorUnits: 2_500_000 },
    ])
    // Canonical CFI7 semantics: committed capital that is not yet secured (recognized or drawn debt) is underfunded.
    expect(project.underfundedAsOfDate).toBe(true)
    expect(model.costs).toContainEqual({ projectId: scenario.scheduledProjectId, currencyCode: 'EUR', committedMinorUnits: 2_500_000, recognizedMinorUnits: 0, paidMinorUnits: 0, outstandingCommitmentMinorUnits: 2_500_000 })
  })

  it('is exactly-once: re-issuing the command on the resulting world blocks instead of duplicating money', () => {
    const scenario = createFacilityClubScenario()
    const first = startClubFacilityProject(scenario.world, {
      teamId: scenario.teamId,
      projectId: scenario.scheduledProjectId,
      commitment: { currencyCode: 'EUR', minorUnits: 2_500_000 },
    })
    const second = startClubFacilityProject(first.world, {
      teamId: scenario.teamId,
      projectId: scenario.scheduledProjectId,
      commitment: { currencyCode: 'EUR', minorUnits: 2_500_000 },
    })

    expect(second.status).toBe('BLOCKED')
    expect(second.reasons).toEqual(['PROJECT_NOT_STARTABLE'])
    expect(second.world).toBe(first.world)
    expect(Object.keys(second.world.financialCommitmentsById)).toEqual(Object.keys(first.world.financialCommitmentsById))
    expect(Object.keys(second.world.facilityFinancialBindingsById)).toEqual(Object.keys(first.world.facilityFinancialBindingsById))
  })

  it('refuses an unusable capital commitment without touching the world', () => {
    const scenario = createFacilityClubScenario()

    expect(startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId, commitment: { currencyCode: 'EUR', minorUnits: 0 } })).toMatchObject({ status: 'BLOCKED', reasons: ['INVALID_COMMITMENT_AMOUNT'] })
    expect(startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId, commitment: { currencyCode: 'EUR', minorUnits: -100 } })).toMatchObject({ status: 'BLOCKED', reasons: ['INVALID_COMMITMENT_AMOUNT'] })
    expect(startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId, commitment: { currencyCode: '   ', minorUnits: 100 } })).toMatchObject({ status: 'BLOCKED', reasons: ['COMMITMENT_CURRENCY_REQUIRED'] })
    expect(scenario.world.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!.status).toBe('SCHEDULED')
    expect(scenario.world.financialCommitmentsById).toEqual({})
  })

  it('runs the canonical pause/resume/complete lifecycle and applies the project scope on completion', () => {
    const scenario = createFacilityClubScenario()
    const started = startClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })

    expect(completeClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_NOT_IN_PROGRESS'] })
    const paused = pauseClubFacilityProject(started.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })
    expect(paused.status).toBe('APPLIED')
    expect(paused.world.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!.status).toBe('PAUSED')
    expect(pauseClubFacilityProject(paused.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_NOT_IN_PROGRESS'] })
    expect(resumeClubFacilityProject(started.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_NOT_PAUSED'] })

    const resumed = resumeClubFacilityProject(paused.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })
    expect(resumed.status).toBe('APPLIED')
    const completedAt = addDays(scenario.asOf, 90)
    const completed = completeClubFacilityProject(resumed.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId, completedAt })
    expect(completed.status).toBe('APPLIED')
    const project = completed.world.facilityDevelopmentProjectsById[scenario.scheduledProjectId]!
    expect(project.status).toBe('COMPLETED')
    expect(project.actualCompletionDate).toBe(completedAt)

    // Canonical consequence: the scope's component now exists at the facility, and it becomes part of
    // the facility's active anatomy once the world clock reaches the completion date.
    const added = Object.values(completed.world.facilityComponentsById).filter((component) => component.facilityId === scenario.trainingCenterId && component.type === 'HYDROTHERAPY_POOL')
    expect(added).toHaveLength(1)
    const advanced = updateGameWorld(completed.world, { currentDate: completedAt })
    const model = buildClubFacilitiesWorkspaceModel(advanced, scenario.teamId)
    expect(model.components.some((component) => component.type === 'HYDROTHERAPY_POOL')).toBe(true)
    const row = model.projects.find((candidate) => candidate.projectId === scenario.scheduledProjectId)!
    expect([...row.actions]).toEqual([])
    expect(completeClubFacilityProject(completed.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_ALREADY_TERMINAL'] })
    expect(startClubFacilityProject(completed.world, { teamId: scenario.teamId, projectId: scenario.scheduledProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_ALREADY_TERMINAL'] })
  })

  it('cancels a non-terminal project and refuses to cancel a finished one', () => {
    const scenario = createFacilityClubScenario()
    const cancelled = cancelClubFacilityProject(scenario.world, { teamId: scenario.teamId, projectId: scenario.inProgressProjectId, cancelledAt: addDays(scenario.asOf, 3) })

    expect(cancelled.status).toBe('APPLIED')
    const project = cancelled.world.facilityDevelopmentProjectsById[scenario.inProgressProjectId]!
    expect(project.status).toBe('CANCELLED')
    expect(project.cancelledAt).toBe(addDays(scenario.asOf, 3))
    expect(cancelClubFacilityProject(cancelled.world, { teamId: scenario.teamId, projectId: scenario.inProgressProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_ALREADY_TERMINAL'] })
    expect(pauseClubFacilityProject(cancelled.world, { teamId: scenario.teamId, projectId: scenario.inProgressProjectId })).toMatchObject({ status: 'BLOCKED', reasons: ['PROJECT_ALREADY_TERMINAL'] })
  })

  it('is deterministic: identical worlds produce identical command outcomes', () => {
    const first = createFacilityClubScenario()
    const second = createFacilityClubScenario()
    expect(second.world).toEqual(first.world)

    const a = startClubFacilityProject(first.world, { teamId: first.teamId, projectId: first.scheduledProjectId, commitment: { currencyCode: 'EUR', minorUnits: 750_000 } })
    const b = startClubFacilityProject(second.world, { teamId: second.teamId, projectId: second.scheduledProjectId, commitment: { currencyCode: 'EUR', minorUnits: 750_000 } })

    expect(a.status).toBe('APPLIED')
    expect(b.status).toBe('APPLIED')
    expect(a.finance).toEqual(b.finance)
    expect(a.world).toEqual(b.world)
  })
})
