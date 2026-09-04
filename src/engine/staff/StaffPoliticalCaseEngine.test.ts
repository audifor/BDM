import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { addDays, type GameDate } from '@/domain/date'
import { staffPersonIdFromString } from '@/domain/ids'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { staffHumanContextIdFor } from '@/domain/staffHumanState'
import { updateGameWorld } from '@/domain/world'
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
})
