import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { RecruitingCycle, RecruitingActionRecord } from '@/domain/recruiting'
import type { GameWorld } from '@/domain/world'
import { calculateStaffWorkload, updateGameWorld } from '@/domain/world'

export interface RecruitingStaffActors {
  readonly headCoachId?: string
  readonly headCoachStaffId?: StaffPersonId
  readonly recruiterId?: StaffPersonId
}

export function recruitingStaffActors(world: GameWorld, teamId: TeamId): RecruitingStaffActors {
  const assignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === teamId)
  const headCoachId = world.teams[teamId]?.coachId
  const headCoachStaffId = headCoachId === undefined ? undefined : world.coaches[headCoachId as keyof typeof world.coaches]?.staffProfileId
  const recruiterId = assignments.find((assignment) => assignment.role === 'recruitingCoordinator' || assignment.role === 'positionalRecruiter')?.staffPersonId
    ?? assignments.find((assignment) => assignment.role === 'assistantCoach' || assignment.role === 'associateCoach')?.staffPersonId
    ?? headCoachStaffId
  return { headCoachId, headCoachStaffId, recruiterId }
}

/** Shared capacity gate for offer, promise and negotiation actions using the canonical Staff V2 workload and Recruiting action ledger. */
export function recruitingStaffActionBlock(world: GameWorld, cycle: RecruitingCycle, teamId: TeamId, staffId: StaffPersonId | undefined, cost = 1): string | undefined {
  if (staffId === undefined || world.staffPeopleById[staffId] === undefined || !Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === teamId && assignment.staffPersonId === staffId)) return 'RECRUITING_STAFF_REQUIRED'
  if (world.ecosystems[cycle.ecosystemId]?.kind !== 'ncaaLike') return undefined
  const workload = calculateStaffWorkload(world, staffId)
  if (workload.overloaded || workload.totalCapacityUsed + cost > workload.capacityLimit) return 'STAFF_WORKLOAD_CAPACITY_EXHAUSTED'
  const dailyUsed = Object.values(world.recruitingActionHistoryById)
    .filter((item) => (item.staffPersonId === staffId || item.staffPersonIds?.includes(staffId)) && item.date === world.currentDate)
    .reduce((sum, item) => sum + item.cost, 0)
  if (dailyUsed + cost > (cycle.rules.staffDailyCapacity ?? 6)) return 'STAFF_RECRUITING_CAPACITY_EXHAUSTED'
  return undefined
}

export function recordRecruitingStaffAction(world: GameWorld, record: RecruitingActionRecord): GameWorld {
  if (world.recruitingActionHistoryById[record.id] !== undefined) return world
  return updateGameWorld(world, { recruitingActionHistory: [...Object.values(world.recruitingActionHistoryById), record] })
}
