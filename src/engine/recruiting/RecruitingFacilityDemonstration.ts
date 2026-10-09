import type { TeamId } from '@/domain/ids'
import type { RecruitingFacilityDemonstration, RecruitingFacilitySelection } from '@/domain/recruiting'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { resolveSportingOperation } from '@/integration/facilitiesSporting/SportingOperationResolver'

/** Showing the selected capability executes no Training, treatment or recruiting bonus. */
export function attemptRecruitingFacilityDemonstration(world: GameWorld, teamId: TeamId, selection: RecruitingFacilitySelection): RecruitingFacilityDemonstration['attempts'][number] {
  const physical = resolveSportingOperation(world, {
    teamId, date: world.currentDate, operationId: 'RECRUITING_FACILITY_DEMONSTRATION',
    requirements: [{ capabilities: [selection.capability], ...(selection.capability === 'BASKETBALL_FULL_COURT' ? { fullCourt: true } : {}) }],
    ...(selection.componentId === undefined ? {} : { componentId: selection.componentId }),
  })
  return {
    ...(selection.componentId === undefined ? {} : { selectedComponentId: selection.componentId }),
    result: physical.status === 'VERIFIED_AVAILABLE' || physical.status === 'VERIFIED_LIMITED' ? 'COMPLETED' : 'NOT_EXECUTED',
    physical,
  }
}

/** Explicit retry of one existing same-day visit activity; never another visit or Calendar task. */
export function retryRecruitingFacilityDemonstration(world: GameWorld, visitId: string, teamId: TeamId, selection: RecruitingFacilitySelection): { ok: true; value: GameWorld } | { ok: false; reason: string } {
  const visit = world.recruitingVisitsById[visitId]
  if (visit === undefined || visit.programTeamId !== teamId || visit.legalStatus !== 'allowed' || visit.date !== world.currentDate) return { ok: false, reason: 'VISIT_ACTIVITY_NOT_ACTIVE' }
  const demonstration = visit.facilityDemonstration
  if (demonstration === undefined || demonstration.capability !== selection.capability) return { ok: false, reason: 'VISIT_ACTIVITY_NOT_SELECTED' }
  const previous = demonstration.attempts.at(-1)
  if (previous?.result === 'COMPLETED') return { ok: true, value: world }
  const attempt = attemptRecruitingFacilityDemonstration(world, teamId, selection)
  if (JSON.stringify(attempt) === JSON.stringify(previous)) return { ok: true, value: world }
  return { ok: true, value: updateGameWorld(world, { recruitingVisits: Object.values(world.recruitingVisitsById).map(item => item.id !== visit.id ? item : {
    ...visit, facilityDemonstration: { ...demonstration, attempts: [...demonstration.attempts, attempt] },
  }) }) }
}
