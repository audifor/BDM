import { compareGameDates } from '@/domain/date'
import { createStaffPoliticalCase, staffPoliticalCaseIdFor, type StaffPoliticalCase, type StaffPoliticalCaseResolutionKind } from '@/domain/staffPolitics'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { isStaffWeeklyCheckpoint } from './StaffWeeklyCadence'
import { progressStaffPoliticalPositions } from './StaffPoliticalPositionEngine'
import { buildStaffPoliticalRelevanceIndex } from './StaffPoliticalPositionEngine'
import { progressStaffPoliticalActionsDetailed } from './StaffPoliticalActionEngine'
import { applyStaffPoliticalActionConsequences } from './StaffPoliticalActionConsequenceEngine'

const agendaForCareerRequest = (kind: import('@/domain/staffCareerAutonomy').StaffCareerRequestKind): import('@/domain/staffPolitics').PoliticalAgenda => kind === 'MORE_RESPONSIBILITY' ? 'RESPONSIBILITY' : 'CAREER'

function resolutionForCareerRequest(status: import('@/domain/staffCareerAutonomy').StaffCareerRequestStatus): StaffPoliticalCaseResolutionKind | undefined {
  if (status === 'GRANTED') return 'APPROVED'
  if (status === 'DECLINED') return 'REJECTED'
  if (status === 'WITHDRAWN') return 'WITHDRAWN'
  if (status === 'SUPERSEDED') return 'SUPERSEDED'
  return undefined
}

/**
 * Observes, but never changes, Career Request state. Missing open sources deliberately leave
 * their cases open: 5F2A has no deterministic historical basis to invent a resolution.
 */
export function progressStaffPoliticalCases(world: GameWorld): GameWorld {
  if (!isStaffWeeklyCheckpoint(world.currentDate)) return world
  const casesById: Record<string, StaffPoliticalCase> = { ...world.staffPoliticalCasesById }
  let changed = false

  for (const request of Object.values(world.staffCareerRequestsById)) {
    if (request.status !== 'OPEN') continue
    const id = staffPoliticalCaseIdFor(request.teamId, 'CAREER_REQUEST', request.id)
    if (casesById[id] !== undefined) continue
    const lastEvaluatedOn = compareGameDates(world.currentDate, request.createdOn) < 0 ? request.createdOn : world.currentDate
    casesById[id] = createStaffPoliticalCase({ id, scopeKey: request.teamId, teamId: request.teamId, sourceKind: 'CAREER_REQUEST', sourceId: request.id, agenda: agendaForCareerRequest(request.kind), subjectStaffId: request.staffId, openedOn: request.createdOn, lastEvaluatedOn, status: 'OPEN' })
    changed = true
  }

  for (const politicalCase of Object.values(casesById)) {
    if (politicalCase.status !== 'OPEN' || politicalCase.sourceKind !== 'CAREER_REQUEST') continue
    const request = world.staffCareerRequestsById[politicalCase.sourceId]
    if (request === undefined) continue
    if (request.status === 'OPEN') {
      if (compareGameDates(world.currentDate, politicalCase.lastEvaluatedOn) > 0) {
        casesById[politicalCase.id] = createStaffPoliticalCase({ ...politicalCase, lastEvaluatedOn: world.currentDate })
        changed = true
      }
      continue
    }
    const resolutionKind = resolutionForCareerRequest(request.status)
    if (resolutionKind === undefined || request.resolvedOn === undefined) continue
    casesById[politicalCase.id] = createStaffPoliticalCase({ ...politicalCase, lastEvaluatedOn: request.resolvedOn, status: 'RESOLVED', resolution: { kind: resolutionKind, resolvedOn: request.resolvedOn } })
    changed = true
  }
  const reconciled = changed ? updateGameWorld(world, { staffPoliticalCases: Object.values(casesById) }) : world
  const index = buildStaffPoliticalRelevanceIndex(reconciled)
  const result = progressStaffPoliticalActionsDetailed(progressStaffPoliticalPositions(reconciled, index), index)
  return applyStaffPoliticalActionConsequences(result.world, result.createdActions)
}
