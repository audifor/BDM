import { getUserTeam } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'
import { getStaffDynamicsForTeam } from '@/ui/staffHumanStatePresentation'
import { getTeamStaffPresentation } from '@/ui/staffPresentation'
import { getStaffRecommendationsForTeam } from '@/ui/staffRecommendationPresentation'

import type { StaffWorkspaceModel } from '@/ui-ng/applications/staff/staffWorkspaceModel'

export function buildStaffWorkspaceModel(world: GameWorld): StaffWorkspaceModel | null {
  const team = getUserTeam(world)
  if (team === undefined) return null

  const staff = getTeamStaffPresentation(world, team.id)
  const openAdvisoryCount = getStaffRecommendationsForTeam(world, team.id).filter(
    (item) => item.status === 'PENDING' || item.status === 'INFORMATIONAL',
  ).length
  const needsAttentionCount = getStaffDynamicsForTeam(world, team.id).filter((item) => item.needsAttention).length

  return {
    teamId: team.id,
    teamName: team.name,
    staffCount: staff.length,
    openAdvisoryCount,
    needsAttentionCount,
    staff,
  }
}
