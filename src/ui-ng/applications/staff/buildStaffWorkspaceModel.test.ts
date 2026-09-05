import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getStaffDynamicsForTeam } from '@/ui/staffHumanStatePresentation'
import { getTeamStaffPresentation } from '@/ui/staffPresentation'
import { getStaffRecommendationsForTeam } from '@/ui/staffRecommendationPresentation'

import { buildStaffWorkspaceModel } from '@/ui-ng/applications/staff/buildStaffWorkspaceModel'

describe('buildStaffWorkspaceModel', () => {
  it('returns null when the user coach has no team', () => {
    const world = createNewGame()
    expect(buildStaffWorkspaceModel({ ...world, userCoachId: 'coach:unassigned' as typeof world.userCoachId })).toBeNull()
  })

  it('projects live team staff from canonical presentation without inventing identities', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const canonical = getTeamStaffPresentation(world, team.id)
    const model = buildStaffWorkspaceModel(world)

    expect(model).not.toBeNull()
    expect(model?.teamId).toBe(team.id)
    expect(model?.teamName).toBe(team.name)
    expect(model?.staff).toEqual(canonical)
    expect(model?.staffCount).toBe(canonical.length)
    expect(model?.staff.map((item) => item.name)).toEqual(
      canonical.map((item) => {
        const person = world.staffPeopleById[item.staffPersonId]!
        return `${person.identity.firstName} ${person.identity.lastName}`
      }),
    )
  })

  it('counts open advisory and attention signals from the same presentation surfaces as StaffScreen', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const model = buildStaffWorkspaceModel(world)!

    expect(model.openAdvisoryCount).toBe(
      getStaffRecommendationsForTeam(world, team.id).filter((item) => item.status === 'PENDING' || item.status === 'INFORMATIONAL').length,
    )
    expect(model.needsAttentionCount).toBe(getStaffDynamicsForTeam(world, team.id).filter((item) => item.needsAttention).length)
  })
})
