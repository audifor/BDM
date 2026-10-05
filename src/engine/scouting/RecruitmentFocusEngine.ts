import { updateGameWorld, type GameWorld } from '@/domain/world'
import { endScoutingTerritoryAssignment } from './ScoutingTerritoryOperations'

/** Advances canonical duration and ends linked territory work at the lifecycle boundary. */
export function progressRecruitmentFocuses(world: GameWorld): GameWorld {
  let next = world
  for (const focus of Object.values(world.scoutingRecruitmentFocusesById).filter((item) => item.status === 'ACTIVE')) {
    if (focus.lastProcessedAt === world.currentDate) continue
    const daysActive = focus.daysActive + 1
    const limit = focus.duration === 'SHORT' ? 14 : focus.duration === 'MEDIUM' ? 42 : Number.POSITIVE_INFINITY
    const completed = daysActive >= limit
    next = updateGameWorld(next, { scoutingRecruitmentFocuses: Object.values(next.scoutingRecruitmentFocusesById).map((item) => item.id === focus.id ? { ...item, daysActive, lastProcessedAt: next.currentDate, ...(completed ? { status: 'COMPLETED', completedAt: next.currentDate } : {}) } : item) })
    if (completed) for (const operation of Object.values(next.scoutingTerritoryAssignmentsById).filter((item) => item.recruitmentFocusId === focus.id && item.status === 'ACTIVE')) next = endScoutingTerritoryAssignment(next, operation.id)
  }
  return next
}
