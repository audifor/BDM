import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { addDays, type GameDate } from '@/domain/date'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createStaffPerson, createTeamStaffAssignment, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { staffHumanContextIdFor } from '@/domain/staffHumanState'
import { updateGameWorld } from '@/domain/world'
import { createStaffPoliticalAction, staffPoliticalActionIdFor, staffPoliticalCaseIdFor } from '@/domain/staffPolitics'
import { progressStaffPoliticalCases } from './StaffPoliticalCaseEngine'
import { isStaffWeeklyCheckpoint } from './StaffWeeklyCadence'

function nextWeeklyCheckpoint(date: GameDate): GameDate {
  let next = date
  while (!isStaffWeeklyCheckpoint(next)) next = addDays(next, 1)
  return next
}

function worldWithRequest(kind: import('@/domain/staffCareerAutonomy').StaffCareerRequestKind, status: import('@/domain/staffCareerAutonomy').StaffCareerRequestStatus = 'OPEN', currentDate?: GameDate) {
  const base = currentDate === undefined ? createNewGame() : updateGameWorld(createNewGame(), { currentDate })
  const staffId = staffPersonIdFromString(`politics-staff-${kind}`)
  const staff = createStaffPerson({ id: staffId, identity: { firstName: 'Case', lastName: 'Staff' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((attribute) => [attribute, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } })
  const teamId = Object.values(base.teams)[0]!.id
  const context = { id: staffHumanContextIdFor(staffId, teamId, base.currentDate), staffId, teamId, startedOn: base.currentDate }
  const request = { id: `request-${kind}`, contextId: context.id, staffId: context.staffId, teamId: context.teamId, kind, createdOn: base.currentDate, status, ...(status === 'OPEN' ? {} : { resolvedOn: base.currentDate }), ...((kind === 'PROMOTION' || kind === 'ROLE_CHANGE') ? { targetRoleId: 'assistantCoach' as never } : {}), ...(kind === 'MORE_RESPONSIBILITY' ? { targetResponsibilityKind: 'SCOUTING' as never } : {}) }
  return updateGameWorld(base, { staffPeople: [...Object.values(base.staffPeopleById), staff], staffHumanContexts: [context], staffCareerRequests: [request] })
}

function worldReadyForSupportLobby(currentDate?: GameDate) {
  const base = updateGameWorld(createNewGame(), { currentDate: currentDate ?? nextWeeklyCheckpoint(createNewGame().currentDate) }); const date = base.currentDate; const teamId = Object.values(base.teams)[0]!.id; const coachId = base.teams[teamId]!.coachId!
  const subjectId = staffPersonIdFromString('pipeline-subject'); const actorId = staffPersonIdFromString('pipeline-actor'); const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((attribute) => [attribute, 90])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  const people = [subjectId, actorId].map((id) => createStaffPerson({ id, identity: { firstName: id, lastName: 'Staff' }, professional: { attributes } })); const contexts = [subjectId, actorId].map((staffId) => ({ id: staffHumanContextIdFor(staffId, teamId, date), staffId, teamId, startedOn: date })); const assignments = [subjectId, actorId].map((staffPersonId, index) => createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(`pipeline-assignment-${index}`), staffPersonId, teamId, role: (index === 0 ? 'assistantCoach' : 'generalManager') as never, assignedOn: date }))
  const request = { id: 'pipeline-request', contextId: contexts[0]!.id, staffId: subjectId, teamId, kind: 'RELEASE' as const, createdOn: date, status: 'OPEN' as const }; const politicalCase = { id: staffPoliticalCaseIdFor(teamId, 'CAREER_REQUEST', request.id), scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: request.id, agenda: 'CAREER' as const, subjectStaffId: subjectId, openedOn: date, lastEvaluatedOn: date, status: 'OPEN' as const, positions: [{ actorId, stance: 'SUPPORT' as const, since: date, lastEvaluatedOn: date }] }; const neutral = { trust: 100, professionalRespect: 100, communicationQuality: 100, collaboration: 0, personalCloseness: 0, perceivedSupport: 100, reliability: 0, professionalAlignment: 100 }
  const world = updateGameWorld(base, { staffPeople: [...Object.values(base.staffPeopleById), ...people], teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), ...assignments], staffEmploymentByStaffId: { ...base.staffEmploymentByStaffId, [subjectId]: { status: 'employed' as const, teamId, roleId: 'assistantCoach' as never, startedOn: date }, [actorId]: { status: 'employed' as const, teamId, roleId: 'generalManager' as never, startedOn: date } }, staffHumanContexts: contexts, staffCareerRequests: [request], staffPoliticalCases: [politicalCase], relationshipsByKey: { [`${actorId}->${coachId}`]: { sourceId: actorId, targetId: coachId, value: 0, dimensions: neutral, events: [] } } })
  return { world, date, teamId, coachId, subjectId, actorId, request: world.staffCareerRequestsById[request.id]!, politicalCase: world.staffPoliticalCasesById[politicalCase.id]! }
}

describe('progressStaffPoliticalCases', () => {
  it('creates one prospective case for every supported open request kind without duplication', () => {
    for (const kind of ['MORE_RESPONSIBILITY', 'PROMOTION', 'ROLE_CHANGE', 'CONTRACT_DISCUSSION', 'RELEASE'] as const) {
      const base = worldWithRequest(kind)
      const progressed = progressStaffPoliticalCases(updateGameWorld(base, { currentDate: nextWeeklyCheckpoint(base.currentDate) }))
      const politicalCase = Object.values(progressed.staffPoliticalCasesById)[0]!
      expect(politicalCase.agenda).toBe(kind === 'MORE_RESPONSIBILITY' ? 'RESPONSIBILITY' : 'CAREER')
      expect(progressStaffPoliticalCases(progressed)).toBe(progressed)
    }
  })

  it('does not invent a case for a request already resolved before observation', () => {
    const base = worldWithRequest('RELEASE', 'DECLINED')
    expect(Object.keys(progressStaffPoliticalCases(updateGameWorld(base, { currentDate: nextWeeklyCheckpoint(base.currentDate) })).staffPoliticalCasesById)).toEqual([])
  })

  it('reconciles each real Career Request resolution exactly once', () => {
    for (const [requestStatus, resolutionKind] of [['GRANTED', 'APPROVED'], ['DECLINED', 'REJECTED'], ['WITHDRAWN', 'WITHDRAWN'], ['SUPERSEDED', 'SUPERSEDED']] as const) {
      const base = worldWithRequest('RELEASE')
      const open = progressStaffPoliticalCases(updateGameWorld(base, { currentDate: nextWeeklyCheckpoint(base.currentDate) }))
      const request = Object.values(open.staffCareerRequestsById)[0]!
      const resolvedSource = updateGameWorld(open, { staffCareerRequests: [{ ...request, status: requestStatus, resolvedOn: open.currentDate }] })
      const resolved = progressStaffPoliticalCases(resolvedSource)
      const politicalCase = Object.values(resolved.staffPoliticalCasesById)[0]!
      expect(politicalCase).toMatchObject({ status: 'RESOLVED', resolution: { kind: resolutionKind, resolvedOn: open.currentDate } })
      expect(progressStaffPoliticalCases(resolved)).toBe(resolved)
    }
  })

  it('leaves an open case untouched if its historical source is unavailable', () => {
    const base = worldWithRequest('RELEASE')
    const open = progressStaffPoliticalCases(updateGameWorld(base, { currentDate: nextWeeklyCheckpoint(base.currentDate) }))
    const withoutSource = updateGameWorld(open, { staffCareerRequests: [] })
    expect(progressStaffPoliticalCases(withoutSource)).toBe(withoutSource)
  })

  it('observes requests only at the shared weekly Staff checkpoint', () => {
    const initial = createNewGame()
    const monday = nextWeeklyCheckpoint(initial.currentDate)
    const tuesday = addDays(monday, 1)
    const openedTuesday = worldWithRequest('RELEASE', 'OPEN', tuesday)
    expect(progressStaffPoliticalCases(openedTuesday)).toBe(openedTuesday)

    const firstMonday = updateGameWorld(openedTuesday, { currentDate: addDays(tuesday, 6) })
    const created = progressStaffPoliticalCases(firstMonday)
    const politicalCase = Object.values(created.staffPoliticalCasesById)[0]!
    expect(politicalCase.lastEvaluatedOn).toBe(firstMonday.currentDate)
    expect(progressStaffPoliticalCases(created)).toBe(created)

    const tuesdayAfter = updateGameWorld(created, { currentDate: addDays(created.currentDate, 1) })
    expect(progressStaffPoliticalCases(tuesdayAfter)).toBe(tuesdayAfter)
    expect(Object.values(tuesdayAfter.staffPoliticalCasesById)[0]!.lastEvaluatedOn).toBe(firstMonday.currentDate)

    const nextMonday = updateGameWorld(tuesdayAfter, { currentDate: addDays(tuesdayAfter.currentDate, 6) })
    expect(Object.values(progressStaffPoliticalCases(nextMonday).staffPoliticalCasesById)[0]!.lastEvaluatedOn).toBe(nextMonday.currentDate)
  })

  it('reconciles a resolved source only at the weekly checkpoint and preserves its real resolution date', () => {
    const base = worldWithRequest('RELEASE')
    const monday = nextWeeklyCheckpoint(base.currentDate)
    const open = progressStaffPoliticalCases(updateGameWorld(base, { currentDate: monday }))
    const resolvedOn = addDays(monday, 2)
    const request = Object.values(open.staffCareerRequestsById)[0]!
    const resolvedTuesday = updateGameWorld(open, { currentDate: resolvedOn, staffCareerRequests: [{ ...request, status: 'DECLINED', resolvedOn }] })
    expect(progressStaffPoliticalCases(resolvedTuesday)).toBe(resolvedTuesday)
    const nextMonday = updateGameWorld(resolvedTuesday, { currentDate: addDays(resolvedOn, 5) })
    expect(Object.values(progressStaffPoliticalCases(nextMonday).staffPoliticalCasesById)[0]!.resolution).toEqual({ kind: 'REJECTED', resolvedOn })
  })

  it('does not fabricate a case when a request opens and resolves between checkpoints', () => {
    const initial = createNewGame()
    const tuesday = addDays(nextWeeklyCheckpoint(initial.currentDate), 1)
    const opened = worldWithRequest('RELEASE', 'OPEN', tuesday)
    const request = Object.values(opened.staffCareerRequestsById)[0]!
    const resolved = updateGameWorld(opened, { currentDate: addDays(tuesday, 2), staffCareerRequests: [{ ...request, status: 'DECLINED', resolvedOn: addDays(tuesday, 2) }] })
    const nextMonday = updateGameWorld(resolved, { currentDate: addDays(tuesday, 6) })
    expect(progressStaffPoliticalCases(nextMonday).staffPoliticalCasesById).toEqual({})
  })

  it('is reached from the Calendar Engine only when it advances onto Monday', () => {
    const initial = createNewGame()
    const sunday = addDays(nextWeeklyCheckpoint(initial.currentDate), -1)
    const world = worldWithRequest('RELEASE', 'OPEN', sunday)
    expect(Object.keys(advanceDay(world).staffPoliticalCasesById)).toHaveLength(1)
  })

  it('applies a newly created action consequence in the same weekly checkpoint', () => {
    const value = worldReadyForSupportLobby(); const progressed = progressStaffPoliticalCases(value.world); const politicalAction = Object.values(progressed.staffPoliticalActionsById)[0]!
    expect(politicalAction).toMatchObject({ kind: 'LOBBY', stance: 'SUPPORT', actorIds: [value.actorId], performedOn: value.date }); const relationship = progressed.relationshipsByKey[`${value.subjectId}->${value.actorId}`]!; expect(relationship).toMatchObject({ value: 5, dimensions: expect.objectContaining({ perceivedSupport: 9, trust: 4, professionalRespect: 3, professionalAlignment: 2 }) }); expect(relationship.events).toHaveLength(1); expect(Object.values(progressed.memoriesById)).toHaveLength(1)
  })

  it('does not backfill consequences for an action persisted before this checkpoint', () => {
    const initial = worldReadyForSupportLobby(); const nextDate = nextWeeklyCheckpoint(addDays(initial.date, 1)); const action = createStaffPoliticalAction({ id: staffPoliticalActionIdFor(initial.politicalCase.id, 'LOBBY', 'SUPPORT', [initial.actorId], { kind: 'COACH', id: initial.coachId }), caseId: initial.politicalCase.id, teamId: initial.teamId, kind: 'LOBBY', stance: 'SUPPORT', actorIds: [initial.actorId], target: { kind: 'COACH', id: initial.coachId }, performedOn: initial.date }); const historical = updateGameWorld(initial.world, { currentDate: nextDate, staffPoliticalActions: [action] }); const progressed = progressStaffPoliticalCases(historical)
    expect(progressed.staffPoliticalActionsById).toEqual(historical.staffPoliticalActionsById); expect(progressed.relationshipsByKey).toEqual(historical.relationshipsByKey); expect(progressed.memoriesById).toEqual(historical.memoriesById)
  })

  it('resolves the Career Request before actions or consequences can be created', () => {
    const value = worldReadyForSupportLobby(); const resolved = updateGameWorld(value.world, { staffCareerRequests: [{ ...value.request, status: 'DECLINED', resolvedOn: value.date }] }); const progressed = progressStaffPoliticalCases(resolved)
    expect(progressed.staffPoliticalCasesById[value.politicalCase.id]).toMatchObject({ status: 'RESOLVED', resolution: { kind: 'REJECTED', resolvedOn: value.date } }); expect(progressed.staffPoliticalActionsById).toEqual({}); expect(progressed.relationshipsByKey).toEqual(resolved.relationshipsByKey); expect(progressed.memoriesById).toEqual(resolved.memoriesById)
  })
})
