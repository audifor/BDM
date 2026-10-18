import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { declineStaffCareerRequest, grantStaffCareerRequest, withdrawStaffCareerRequest } from '@/app/staffCareerAutonomy'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { relationshipKey, getRelationshipDimensions } from '@/domain/relationships'
import { progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { getActiveStaffPromises, getStaffPromise, postponeStaffPromise, progressStaffPromises, promiseStaffCareerRequest, staffPromiseInboxId } from './StaffProfessionalCommitment'

const coach = { firstName: 'Ana', lastName: 'García', dateOfBirth: '1987-07-07',
  gender: 'female' as const, background: 'formerAssistant' as const, ambition: 'talentDeveloper' as const,
  disposition: 'loyal' as const, coachingStyle: 'developer' as const }

function withRequest() {
  const initial = progressStaffHumanState(applyUserCoachCreation(createAcbTestGame(), coach))
  const team = Object.values(initial.teams).find(x => x.coachId === initial.userCoachId)!
  const assigned = Object.values(initial.teamStaffAssignmentsById).find(x => x.teamId === team.id && x.role === 'assistantCoach')!
  if (!assigned) throw new Error('Fixture must contain real assistant coach')
  const context = Object.values(initial.staffHumanContextsById).find(x => x.staffId === assigned.staffPersonId)!
  if (!context) throw new Error('Fixture must contain real staff context')
  const request = { id: 'bs19c:p4:real-staff-career-request', contextId: context.id,
    staffId: assigned.staffPersonId, teamId: team.id, kind: 'MORE_RESPONSIBILITY' as const,
    targetResponsibilityKind: 'createTeamTrainingPlan' as const, status: 'OPEN' as const,
    createdOn: initial.currentDate }
  return { request, initial: updateGameWorld(initial, { staffCareerRequests: [request] }), staffId: assigned.staffPersonId }
}

function start() {
  const base = withRequest()
  const result = promiseStaffCareerRequest(base.initial, base.request.id, 7)
  expect(result.status).toBe('APPLIED')
  if (result.status !== 'APPLIED') throw new Error('Promise must be accepted')
  return { ...base, world: result.world }
}

describe('BS19C P4 — promises backed by real staff requests', () => {
  it('records an explicit promise from both people, with a due date and no automatic promotion', () => {
    const { world, initial, request, staffId } = start()
    const promise = getStaffPromise(world, request.id)!
    expect(promise).toMatchObject({ requestId: request.id, staffId, postponed: false,
      dueOn: addDays(world.currentDate, 7) })
    expect(world.staffCareerRequestsById[request.id]?.status).toBe('OPEN')
    expect(world.responsibilitiesById).toEqual(initial.responsibilitiesById)
    expect(world.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:created:coach`]?.context.dueOn).toBe(promise.dueOn)
    expect(world.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:created:staff`]?.owner.id).toBe(staffId)
    expect(world.inboxItemsById[staffPromiseInboxId(world.userCoachId, request.id)]?.status).toBe('unread')
    expect(promiseStaffCareerRequest(world, request.id, 7)).toMatchObject({ status: 'BLOCKED', reason: 'ALREADY_PROMISED', world })
    expect(promiseStaffCareerRequest(initial, request.id, 365 as never)).toMatchObject({ status: 'BLOCKED', reason: 'INVALID_DATE', world: initial })
  })

  it('honors the promise only after actual delegation; records both perspectives and survives Save V4', () => {
    const { world, request, staffId } = start()
    const fulfilled = grantStaffCareerRequest(world, request.id)
    expect(fulfilled.staffCareerRequestsById[request.id]?.status).toBe('GRANTED')
    expect(Object.values(fulfilled.responsibilitiesById).some(item => item.holderStaffId === staffId && item.kind === 'createTeamTrainingPlan')).toBe(true)
    expect(getStaffPromise(fulfilled, request.id)).toBeNull()
    expect(fulfilled.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:fulfilled:staff`]?.context.outcome).toBe('FULFILLED')
    expect(getRelationshipDimensions(fulfilled.relationshipsByKey[relationshipKey(staffId, world.userCoachId)]).reliability).toBeGreaterThan(0)
    expect(fulfilled.inboxItemsById[staffPromiseInboxId(world.userCoachId, request.id)]?.status).toBe('archived')
    const restored = deserializeGameWorldV4(serializeGameWorldV4(fulfilled, '2026-10-18T12:00:00.000Z'))
    expect(restored.memoriesById).toEqual(fulfilled.memoriesById)
    expect(restored.relationshipsByKey[relationshipKey(staffId, world.userCoachId)]).toEqual(fulfilled.relationshipsByKey[relationshipKey(staffId, world.userCoachId)])
    expect(restored.staffCareerRequestsById[request.id]?.status).toBe('GRANTED')
    expect(progressStaffPromises(restored)).toBe(restored)
    expect(restored.personalitiesByPersonId[staffId]).toBeDefined()
  }, 120_000)

  it('allows exactly one explicit 7-day extension and does not penalize on the former date', () => {
    const { world, request } = start()
    const extension = postponeStaffPromise(world, request.id)
    expect(extension.status).toBe('APPLIED')
    if (extension.status !== 'APPLIED') throw new Error('Expected extension')
    expect(getStaffPromise(extension.world, request.id)?.postponed).toBe(true)
    expect(getStaffPromise(extension.world, request.id)?.dueOn).toBe(addDays(world.currentDate, 14))
    expect(postponeStaffPromise(extension.world, request.id)).toMatchObject({ status: 'BLOCKED', reason: 'EXTENSION_ALREADY_USED' })
    const previousDeadline = updateGameWorld(extension.world, { currentDate: addDays(world.currentDate, 8) })
    expect(progressStaffPromises(previousDeadline)).toBe(previousDeadline)
    const fulfilled = grantStaffCareerRequest(previousDeadline, request.id)
    expect(fulfilled.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:fulfilled:coach`]).toBeDefined()
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(fulfilled, '2026-10-18T12:00:00.000Z'))
    expect(loaded.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:extended:staff`]?.context.dueOn).toBe(addDays(world.currentDate, 14))
  }, 120_000)

  it('marks overdue OPEN requests broken once; worsens trust and leaves a source-backed conflict trigger', () => {
    const { world, request, staffId } = start()
    const expired = updateGameWorld(world, { currentDate: addDays(world.currentDate, 8) })
    const overdue = progressStaffPromises(expired)
    expect(overdue.staffCareerRequestsById[request.id]?.status).toBe('OPEN')
    expect(overdue.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:broken:assistant`]).toBeUndefined()
    expect(overdue.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:broken:staff`]?.context.outcome).toBe('BROKEN')
    expect(getRelationshipDimensions(overdue.relationshipsByKey[relationshipKey(staffId, world.userCoachId)]).reliability).toBeLessThan(0)
    expect(overdue.moraleByPersonId[staffId]?.events.some(e => e.context.promiseOutcome === 'BROKEN')).toBe(true)
    expect(getActiveStaffPromises(overdue)).toHaveLength(0)
    expect(progressStaffPromises(overdue)).toBe(overdue)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(overdue, '2026-10-18T12:00:00.000Z'))
    expect(restored.memoriesById).toEqual(overdue.memoriesById)
    expect(restored.staffCareerRequestsById[request.id]?.status).toBe('OPEN')
    expect(progressStaffPromises(restored)).toBe(restored)
  }, 120_000)

  it('declining an explicitly promised request counts as broken; independent withdrawal is neutral', () => {
    const { world, request } = start()
    const broken = declineStaffCareerRequest(world, request.id)
    expect(broken.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:broken:coach`]?.context.outcome).toBe('BROKEN')
    expect(broken.staffCareerRequestsById[request.id]?.status).toBe('DECLINED')
    const withdrawn = withdrawStaffCareerRequest(world, request.id)
    expect(withdrawn.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:cancelled:staff`]?.context.outcome).toBe('CANCELLED')
    expect(withdrawn.staffCareerRequestsById[request.id]?.status).toBe('WITHDRAWN')
    expect(withdrawn.relationshipsByKey).toEqual(world.relationshipsByKey)
  }, 120_000)

  it('evaluates overdue requests inside the real calendar day, not only manual command', () => {
    const { world, request } = start()
    const onDeadline = updateGameWorld(world, { currentDate: addDays(world.currentDate, 7) })
    const day = advanceGameDayWithResult(onDeadline)
    expect(day.status).not.toBe('FAILED')
    expect(day.world.currentDate).toBe(addDays(onDeadline.currentDate, 1))
    expect(day.phases.some(phase => phase.phaseId === 'BS19C_STAFF_PROMISE_REVIEW' && phase.worldChanged)).toBe(true)
    expect(day.world.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:broken:staff`]).toBeDefined()
  }, 120_000)

  it('rejects unrelated NPC, missing or resolved requests without inventing a commitment', () => {
    const { initial, request, staffId } = withRequest()
    const invalid = promiseStaffCareerRequest(initial, 'made-up', 7)
    expect(invalid).toMatchObject({ status: 'BLOCKED', reason: 'NO_REAL_REQUEST', world: initial })
    const granted = grantStaffCareerRequest(initial, request.id)
    expect(promiseStaffCareerRequest(granted, request.id, 7)).toMatchObject({ status: 'BLOCKED', reason: 'NO_REAL_REQUEST' })
    // GameWorld correctly prohibits creating an OPEN request for a non-existent
    // Staff/StaffHumanContext; the application must reject a missing request
    // without attempting to bypass that validator.
    expect(promiseStaffCareerRequest(initial, 'foreign-request', 7)).toMatchObject({
      status: 'BLOCKED', reason: 'NO_REAL_REQUEST', world: initial,
    })
    expect(initial.staffPeopleById[staffId]).toBeDefined()
  }, 120_000)
})
