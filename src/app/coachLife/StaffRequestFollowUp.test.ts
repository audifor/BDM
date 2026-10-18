import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { declineStaffCareerRequest, grantStaffCareerRequest } from '@/app/staffCareerAutonomy'
import { updateGameWorld } from '@/domain/world'
import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { decideStaffRequestFollowUp, getPendingStaffRequestFollowUp, getPendingStaffRequestFollowUps, queueStaffRequestFollowUp } from './StaffRequestFollowUp'

const owner = {
  firstName: 'Ana', lastName: 'García', dateOfBirth: '1991-07-02',
  gender: 'female' as const, background: 'academyCoach' as const,
  disposition: 'loyal' as const, coachingStyle: 'developer' as const,
}

function withRealAssistantRequest() {
  const starting = progressStaffHumanState(applyUserCoachCreation(createAcbTestGame(), owner))
  const team = Object.values(starting.teams).find(item => item.coachId === starting.userCoachId)!
  const assignment = Object.values(starting.teamStaffAssignmentsById).find(item =>
    item.teamId === team.id && item.role === 'assistantCoach')!
  if (!assignment) throw new Error('Expected real assigned assistant in ACB fixture')
  const context = Object.values(starting.staffHumanContextsById).find(item => item.staffId === assignment.staffPersonId)!
  if (!context) throw new Error('Expected canonical StaffHumanContext')
  const request = {
    id: 'request:bs19c:assistant-responsibility', contextId: context.id,
    staffId: assignment.staffPersonId, teamId: team.id,
    kind: 'MORE_RESPONSIBILITY' as const, targetResponsibilityKind: 'createTeamTrainingPlan' as const,
    createdOn: starting.currentDate, status: 'OPEN' as const,
  }
  const pending = updateGameWorld(starting, { staffCareerRequests: [request] })
  return { pending, request, staffId: assignment.staffPersonId }
}

describe('BS19C staff career request follow-up — real request, not invented promise', () => {
  it('opens once only after a real player-controlled denial, without reversing the decision', () => {
    const { pending, request, staffId } = withRealAssistantRequest()
    expect(getPendingStaffRequestFollowUp(pending, request.id)).toBeNull()
    const declined = declineStaffCareerRequest(pending, request.id)
    expect(declined.staffCareerRequestsById[request.id]).toMatchObject({ status: 'DECLINED' })
    expect(getPendingStaffRequestFollowUp(declined, request.id)).toMatchObject({ staffId, requestId: request.id })
    expect(queueStaffRequestFollowUp(declined, request.id)).toBe(declined)
    const original = pending.relationshipsByKey[relationshipKey(staffId, pending.userCoachId)]
    const current = declined.relationshipsByKey[relationshipKey(staffId, pending.userCoachId)]!
    expect(getRelationshipDimensions(current).trust).toBeLessThan(getRelationshipDimensions(original).trust)
    expect(Object.values(declined.memoriesById).filter(item => item.sourceId === request.id)).toHaveLength(1)
    expect(getPendingStaffRequestFollowUps(declined)).toHaveLength(1)
  })

  it('acknowledging impact repairs some professional trust but does not fabricate a granted request', () => {
    const { pending, request, staffId } = withRealAssistantRequest()
    const declined = declineStaffCareerRequest(pending, request.id)
    const before = getRelationshipDimensions(declined.relationshipsByKey[relationshipKey(staffId, declined.userCoachId)])
    const result = decideStaffRequestFollowUp(declined, request.id, 'acknowledgeImpact')
    expect(result.status).toBe('APPLIED')
    if (result.status !== 'APPLIED') throw new Error('Expected reconciliation conversation')
    const after = result.world
    expect(after.staffCareerRequestsById[request.id]?.status).toBe('DECLINED')
    const rel = getRelationshipDimensions(after.relationshipsByKey[relationshipKey(staffId, after.userCoachId)])
    expect(rel.trust).toBeGreaterThan(before.trust)
    expect(rel.perceivedSupport).toBeGreaterThan(before.perceivedSupport)
    expect(after.memoriesById[`memory:bs19c:staff-request-follow-up:${after.userCoachId}:${request.id}:coach`]).toMatchObject({
      context: { choice: 'acknowledgeImpact', requestId: request.id },
    })
    expect(after.memoriesById[`memory:bs19c:staff-request-follow-up:${after.userCoachId}:${request.id}:assistant`]).toMatchObject({
      owner: { kind: 'staff', id: staffId },
    })
    expect(after.moraleByPersonId[after.userCoachId]!.events.some(item =>
      item.context.requestId === request.id && item.context.personalityEventKind === 'TEAM_MEETING')).toBe(true)
    expect(after.personalitiesByPersonId[after.userCoachId]).toEqual(after.personalitiesByPersonId[after.coaches[after.userCoachId]!.staffProfileId])
    expect(getPendingStaffRequestFollowUp(after, request.id)).toBeNull()
    expect(decideStaffRequestFollowUp(after, request.id, 'acknowledgeImpact')).toMatchObject({ status: 'BLOCKED', reason: 'NO_PENDING_FOLLOW_UP' })
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(after, '2026-10-18T12:00:00.000Z'))
    expect(loaded.relationshipsByKey[relationshipKey(staffId, after.userCoachId)]).toEqual(after.relationshipsByKey[relationshipKey(staffId, after.userCoachId)])
    expect(loaded.memoriesById).toEqual(after.memoriesById)
    expect(loaded.staffCareerRequestsById[request.id]?.status).toBe('DECLINED')
    expect(getPendingStaffRequestFollowUp(loaded, request.id)).toBeNull()
  }, 120_000)

  it('maintaining the refusal can deepen mistrust while leaving source identities intact', () => {
    const { pending, request, staffId } = withRealAssistantRequest()
    const declined = declineStaffCareerRequest(pending, request.id)
    const before = getRelationshipDimensions(declined.relationshipsByKey[relationshipKey(staffId, declined.userCoachId)])
    const staffBefore = declined.staffPeopleById[staffId]
    const result = decideStaffRequestFollowUp(declined, request.id, 'maintainDecision')
    expect(result.status).toBe('APPLIED')
    if (result.status !== 'APPLIED') throw new Error('Expected firm position')
    expect(getRelationshipDimensions(result.world.relationshipsByKey[relationshipKey(staffId, result.world.userCoachId)]).trust).toBeLessThan(before.trust)
    expect(result.world.staffPeopleById[staffId]).toEqual(staffBefore)
    expect(result.world.staffCareerRequestsById[request.id]?.status).toBe('DECLINED')
    expect(decideStaffRequestFollowUp(pending, request.id, 'maintainDecision')).toMatchObject({ status: 'BLOCKED', reason: 'NO_PENDING_FOLLOW_UP' })
    expect(decideStaffRequestFollowUp(declined, request.id, 'invalid' as never)).toMatchObject({ status: 'BLOCKED', reason: 'INVALID_CHOICE' })
    expect(decideStaffRequestFollowUp(declined, request.id, 'acknowledgeImpact', 'other-coach' as never)).toMatchObject({ status: 'BLOCKED', reason: 'NOT_USER_COACH' })
  })

  it('granting a real request through the existing authority creates no invented refusal follow-up', () => {
    const { pending, request } = withRealAssistantRequest()
    const granted = grantStaffCareerRequest(pending, request.id)
    expect(granted.staffCareerRequestsById[request.id]?.status).toBe('GRANTED')
    expect(getPendingStaffRequestFollowUp(granted, request.id)).toBeNull()
    expect(getPendingStaffRequestFollowUps(granted)).toHaveLength(0)
  })
})
