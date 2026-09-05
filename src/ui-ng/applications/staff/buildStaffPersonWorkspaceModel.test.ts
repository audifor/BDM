import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
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
})
