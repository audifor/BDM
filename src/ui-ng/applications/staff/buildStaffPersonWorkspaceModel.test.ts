import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld } from '@/domain/world'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_PROFESSIONAL_ATTRIBUTE_LABELS } from '@/ui/staffPresentation'

import { buildStaffPersonWorkspaceModel } from '@/ui-ng/applications/staff/buildStaffPersonWorkspaceModel'

describe('buildStaffPersonWorkspaceModel', () => {
  it('returns null when the staff person does not exist', () => {
    const world = createNewGame()
    expect(buildStaffPersonWorkspaceModel(world, 'staff:missing' as never)).toBeNull()
  })

  it('projects identity and professional attributes from the live staff person', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const person = world.staffPeopleById[assignment.staffPersonId]!
    const model = buildStaffPersonWorkspaceModel(world, assignment.staffPersonId)

    expect(model).not.toBeNull()
    expect(model?.identity.firstName).toBe(person.identity.firstName)
    expect(model?.identity.lastName).toBe(person.identity.lastName)
    expect(model?.identity.teamName).toBe(team.name)
    expect(model?.attributes.map((row) => row.id)).toEqual([...STAFF_PROFESSIONAL_ATTRIBUTE_KEYS])
    expect(model?.attributes.map((row) => row.label)).toEqual(
      STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key]),
    )
    expect(model?.attributes.map((row) => row.value)).toEqual(
      STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => person.professional.attributes[key]),
    )
    expect(model?.evaluations.some((item) => item.current && item.role === assignment.role)).toBe(true)
  })

  it('derives recent Training impact from immutable completed-session evidence', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const assignment = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const session = createScheduledTrainingSession({
      id: 'recent-staff-impact', teamId: team.id, date: base.currentDate, startTime: '09:00', durationMinutes: 60,
      scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'completed',
      execution: {
        completedOn: base.currentDate, moduleName: 'Three-Point Shooting', plannedModuleName: 'Three-Point Shooting',
        category: 'shooting', effectiveIntensity: 'normal', executingStaffPersonIds: [assignment.staffPersonId],
        executingStaffRoles: [{ staffId: assignment.staffPersonId, roleId: assignment.role }], executionQualityMultiplier: 1.04,
        participants: [], cohesionDelta: 0,
      },
    })
    const world = updateGameWorld(base, { scheduledTrainingSessionsById: { ...base.scheduledTrainingSessionsById, [session.id]: session } })
    const model = buildStaffPersonWorkspaceModel(world, assignment.staffPersonId)!
    expect(model.recentImpact.trainingSessions).toBe(1)
    expect(model.recentImpact.entries[0]).toMatchObject({ activity: 'Training session · Three-Point Shooting', roleLabel: 'ASSISTANT COACH', result: 'VERY GOOD contribution' })
  })
})
