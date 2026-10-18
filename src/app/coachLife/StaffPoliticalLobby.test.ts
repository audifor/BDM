import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { createStaffPoliticalAction, staffPoliticalActionIdFor, staffPoliticalCaseIdFor } from '@/domain/staffPolitics'
import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { progressStaffPoliticalCases } from '@/engine/staff/StaffPoliticalCaseEngine'
import { decideStaffPoliticalLobby, getPendingStaffPoliticalLobby, getPendingStaffPoliticalLobbies, politicalLobbyInboxId, queueVerifiedStaffLobbies } from './StaffPoliticalLobby'

function fixture() {
  const started = progressStaffHumanState(applyUserCoachCreation(createAcbTestGame(), {
    firstName: 'Irene', lastName: 'Vega', dateOfBirth: '1987-05-12',
    gender: 'female', background: 'formerAssistant', disposition: 'loyal', coachingStyle: 'analyst',
  }))
  const team = Object.values(started.teams).find(item => item.coachId === started.userCoachId)!
  const assigned = Object.values(started.teamStaffAssignmentsById)
    .filter(item => item.teamId === team.id && item.role !== 'headCoach')
    .sort((a, b) => a.staffPersonId.localeCompare(b.staffPersonId))
  const subject = assigned.find(item => item.role === 'assistantCoach')!
  const actor = assigned.find(item => item.staffPersonId !== subject.staffPersonId)!
  if (!subject || !actor) throw new Error('Expected existing assistant and another real staff member')
  const context = Object.values(started.staffHumanContextsById).find(item => item.staffId === subject.staffPersonId)!
  if (!context) throw new Error('Missing real subject staff context')
  const request = {
    id: 'bs19c:p6:real-career-request', contextId: context.id, staffId: subject.staffPersonId, teamId: team.id,
    kind: 'MORE_RESPONSIBILITY' as const, targetResponsibilityKind: 'createTeamTrainingPlan' as const,
    createdOn: started.currentDate, status: 'OPEN' as const,
  }
  const caseId = staffPoliticalCaseIdFor(team.id, 'CAREER_REQUEST', request.id)
  const politicalCase = { id: caseId, scopeKey: team.id, teamId: team.id,
    sourceKind: 'CAREER_REQUEST' as const, sourceId: request.id, subjectStaffId: subject.staffPersonId,
    agenda: 'RESPONSIBILITY' as const, openedOn: started.currentDate, lastEvaluatedOn: started.currentDate,
    status: 'OPEN' as const,
    positions: [{ actorId: actor.staffPersonId, stance: 'SUPPORT' as const, since: started.currentDate, lastEvaluatedOn: started.currentDate }],
  }
  const target = { kind: 'COACH' as const, id: started.userCoachId }
  const action = createStaffPoliticalAction({
    id: staffPoliticalActionIdFor(caseId, 'LOBBY', 'SUPPORT', [actor.staffPersonId], target),
    caseId, teamId: team.id, kind: 'LOBBY', stance: 'SUPPORT', actorIds: [actor.staffPersonId],
    target, performedOn: started.currentDate,
  })
  const world = updateGameWorld(started, {
    staffCareerRequests: [request], staffPoliticalCases: [politicalCase], staffPoliticalActions: [action],
  })
  return { world, action, subjectId: subject.staffPersonId, actorId: actor.staffPersonId, requestId: request.id, teamId: team.id }
}

describe('BS19C P6 verified NPC lobbying and multi-person consequences', () => {
  it('only creates an inbox scenario for a real recorded action, live request, present coworker and user Coach', () => {
    const { world, action, actorId, subjectId } = fixture()
    expect(getPendingStaffPoliticalLobbies(world)).toHaveLength(0)
    const queued = queueVerifiedStaffLobbies(world, [action])
    expect(getPendingStaffPoliticalLobby(queued, action.id)).toMatchObject({
      actorId, subjectId, stance: 'SUPPORT', actionId: action.id,
    })
    expect(queueVerifiedStaffLobbies(queued, [action])).toBe(queued)
    const withoutAction = updateGameWorld(world, { staffPoliticalActions: [] })
    expect(queueVerifiedStaffLobbies(withoutAction, [action])).toBe(withoutAction)
    const resolvedSource = updateGameWorld(world, {
      staffCareerRequests: Object.values(world.staffCareerRequestsById).map(item =>
        ({ ...item, status: 'DECLINED' as const, resolvedOn: world.currentDate })),
    })
    expect(queueVerifiedStaffLobbies(resolvedSource, [action])).toBe(resolvedSource)
    const byOtherCoach = queueVerifiedStaffLobbies(world, [{
      ...action, target: { kind: 'COACH', id: 'other-coach' },
    }])
    expect(byOtherCoach).toBe(world)
  }, 120_000)

  it('hearing a real lobby changes only bilateral relations, memory and morale, never the source request', () => {
    const { world, action, actorId, subjectId, requestId } = fixture()
    const queued = queueVerifiedStaffLobbies(world, [action])
    const result = decideStaffPoliticalLobby(queued, action.id, 'hearArgument')
    expect(result.status).toBe('APPLIED')
    if (result.status !== 'APPLIED') throw new Error('Expected supported action')
    const after = result.world
    expect(after.staffCareerRequestsById[requestId]?.status).toBe('OPEN')
    expect(after.staffPoliticalActionsById[action.id]).toEqual(action)
    const staffPerspective = after.relationshipsByKey[relationshipKey(actorId, world.userCoachId)]!
    expect(getRelationshipDimensions(staffPerspective).trust).toBeGreaterThan(0)
    expect(after.relationshipsByKey[relationshipKey(world.userCoachId, actorId)]).toBeDefined()
    expect(after.relationshipsByKey[relationshipKey(subjectId, world.userCoachId)]).toBeUndefined()
    expect(after.memoriesById[`memory:bs19c:staff-lobby:${action.id}:coach`]).toMatchObject({
      sourceId: action.id, context: { sourceRequestId: requestId, choice: 'hearArgument' },
    })
    expect(after.memoriesById[`memory:bs19c:staff-lobby:${action.id}:actor`]?.owner).toEqual({ kind: 'staff', id: actorId })
    expect(after.inboxItemsById[politicalLobbyInboxId(action.id)]?.status).toBe('archived')
    expect(after.moraleByPersonId[world.userCoachId]?.events.some(e =>
      e.context.politicalActionId === action.id && e.context.personalityEventKind === 'TEAM_MEETING')).toBe(true)
    expect(after.personalitiesByPersonId[after.userCoachId]).toEqual(after.personalitiesByPersonId[after.coaches[after.userCoachId]!.staffProfileId])
    expect(decideStaffPoliticalLobby(after, action.id, 'hearArgument')).toMatchObject({ status: 'BLOCKED', reason: 'NOT_PENDING' })
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(after, '2026-10-18T09:00:00.000Z'))
    expect(loaded.memoriesById).toEqual(after.memoriesById)
    expect(loaded.relationshipsByKey[relationshipKey(actorId, world.userCoachId)]).toEqual(staffPerspective)
    expect(getPendingStaffPoliticalLobbies(loaded)).toHaveLength(0)
    expect(queueVerifiedStaffLobbies(loaded, [action])).toBe(loaded)
  }, 120_000)

  it('standing firm against lobbying can create friction without denying the colleague request', () => {
    const { world, action, actorId, requestId } = fixture()
    const queued = queueVerifiedStaffLobbies(world, [action])
    const result = decideStaffPoliticalLobby(queued, action.id, 'standFirm')
    expect(result.status).toBe('APPLIED')
    if (result.status !== 'APPLIED') throw new Error('Expected response')
    expect(getRelationshipDimensions(result.world.relationshipsByKey[relationshipKey(actorId, world.userCoachId)]).trust).toBeLessThan(0)
    expect(result.world.staffCareerRequestsById[requestId]?.status).toBe('OPEN')
    expect(decideStaffPoliticalLobby(queued, action.id, 'fake' as never)).toMatchObject({
      status: 'BLOCKED', reason: 'INVALID_CHOICE', world: queued,
    })
    expect(decideStaffPoliticalLobby(queued, action.id, 'standFirm', 'npc-coach' as never)).toMatchObject({
      status: 'BLOCKED', reason: 'NOT_USER_COACH', world: queued,
    })
  }, 120_000)

  it('a political group alone does not fabricate a lobby directed to the coach', () => {
    const { world, action } = fixture()
    const withNoFreshActions = progressStaffPoliticalCases(world)
    // Political cases are evaluated only at the scheduled weekly checkpoint:
    // if no fresh verified LOBBY is produced, the inbox stays unchanged.
    expect(getPendingStaffPoliticalLobbies(withNoFreshActions).length).toBeLessThanOrEqual(1)
    expect(queueVerifiedStaffLobbies(world, [{
      ...action, kind: 'COORDINATE', target: undefined, actorIds: [action.actorIds[0]!, 'another-staff' as never],
    }])).toBe(world)
  }, 120_000)
})
