import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { addDays } from '@/domain/date'
import { createStaffPoliticalAction, createStaffPoliticalCase, staffPoliticalActionIdFor, staffPoliticalCaseIdFor } from '@/domain/staffPolitics'
import { createStaffUnitCohesionState } from '@/domain/staffUnitCohesion'
import { applyRelationshipEventToWorld, updateGameWorld } from '@/domain/world'
import { staffRoleDefinition } from '@/domain/staff'
import { createScheduledTrainingSession } from '@/domain/training'
import { applyStaffPoliticalActionConsequences } from '@/engine/staff/StaffPoliticalActionConsequenceEngine'
import { buildStaffUnitRuntimeViews, initializeStaffUnitCohesionState } from '@/engine/staff/StaffUnitCohesionEngine'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { executeScheduledTrainingSessions, nextEligibleTrainingDate, scheduleTrainingSession, trainingStaffExecutionMultiplier } from './ScheduledTrainingEngine'
import { staffCohesionDevelopmentMultiplier } from './StaffCohesionDevelopmentBridge'

function fixture() {
  const world = createAcbTestGame()
  const team = Object.values(world.teams)[0]!
  const shooting = Object.values(world.teamStaffAssignmentsById).find(item => item.teamId === team.id && item.role === 'shootingCoach')!
  const skills = Object.values(world.teamStaffAssignmentsById).find(item => item.teamId === team.id && item.role === 'skillsCoach')!
  if (!shooting || !skills || shooting.staffPersonId === skills.staffPersonId) throw new Error('Fixture requires two distinct real coaches')
  const department = staffRoleDefinition(shooting.role).department
  if (staffRoleDefinition(skills.role).department !== department) throw new Error('Staff must share a genuine department')
  const view = buildStaffUnitRuntimeViews(world, team.id).find(item => item.department === department)!
  const date = nextEligibleTrainingDate(world.currentDate)
  const playerId = team.rosterPlayerIds[0]!
  const session = createScheduledTrainingSession({
    id: 'bs19c-p7-training', teamId: team.id, date, startTime: '09:00', durationMinutes: 60,
    scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal',
    assignedStaffPersonIds: [shooting.staffPersonId],
  })
  return { world, team, shooting, skills, department, view, date, playerId, session }
}

function witnessed(f: ReturnType<typeof fixture>) {
  return applyRelationshipEventToWorld(f.world, f.shooting.staffPersonId, f.skills.staffPersonId, {
    id: 'relationship:bs19c-p7:verified-coaches', source: 'professionalInteraction',
    gameDate: f.world.currentDate, delta: 8, dimensionDeltas: {
      trust: 8, communicationQuality: 10, collaboration: 9, perceivedSupport: 7,
    }, context: { source: 'actualStaffInteraction' },
  })
}

function withCohesion(f: ReturnType<typeof fixture>, score: number) {
  const related = witnessed(f)
  const base = initializeStaffUnitCohesionState(related, f.view)
  const current = { ...base.current, communication: score, coordination: score,
    mutualSupport: score, trustClimate: score }
  return updateGameWorld(related, { staffUnitCohesionStates: [
    ...Object.values(related.staffUnitCohesionStatesByUnitKey).filter(item => item.unitKey !== base.unitKey),
    createStaffUnitCohesionState({ ...base, current }),
  ] })
}

function execute(world: ReturnType<typeof createAcbTestGame>, f: ReturnType<typeof fixture>) {
  const scheduled = scheduleTrainingSession(world, f.session)
  return executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: f.date }))
}

describe('BS19C P7 — witnessed staff cooperation affects real player development', () => {
  it('retains exact neutral legacy output without executing staff, without witnessed peers, or without canonical cohesion', () => {
    const f = fixture()
    expect(staffCohesionDevelopmentMultiplier(f.world, f.session)).toBe(1)
    expect(staffCohesionDevelopmentMultiplier(f.world, { ...f.session, assignedStaffPersonIds: undefined })).toBe(1)
    const neutral = initializeStaffUnitCohesionState(f.world, f.view)
    const noEvidence = updateGameWorld(f.world, { staffUnitCohesionStates: [createStaffUnitCohesionState({
      ...neutral, current: { ...neutral.current, communication: 100, coordination: 100, mutualSupport: 100, trustClimate: 100 },
    })] })
    expect(staffCohesionDevelopmentMultiplier(noEvidence, f.session)).toBe(1)
    expect(staffCohesionDevelopmentMultiplier(witnessed(f), f.session)).toBe(1)
  }, 120_000)

  it('bounds the effect to 0.96–1.04 and changes player development, NOT fatigue or injuries', () => {
    const f = fixture()
    const high = withCohesion(f, 100)
    const low = withCohesion(f, 0)
    expect(staffCohesionDevelopmentMultiplier(high, f.session)).toBeCloseTo(1.04, 10)
    expect(staffCohesionDevelopmentMultiplier(low, f.session)).toBeCloseTo(0.96, 10)
    expect(trainingStaffExecutionMultiplier(high, f.session)).toBe(trainingStaffExecutionMultiplier(low, f.session))
    const improved = execute(high, f)
    const friction = execute(low, f)
    const gainHigh = improved.developmentStimulusByPlayerId[f.playerId]?.byRating.threePointShooting ?? 0
    const gainLow = friction.developmentStimulusByPlayerId[f.playerId]?.byRating.threePointShooting ?? 0
    expect(gainHigh).toBeGreaterThan(gainLow)
    expect(improved.careerFatigueByPlayerId[f.playerId]).toBe(friction.careerFatigueByPlayerId[f.playerId])
    expect(improved.moraleByPersonId[f.playerId]).toEqual(friction.moraleByPersonId[f.playerId])
    expect(improved.injuriesById).toEqual(friction.injuriesById)
    expect(improved.teamCohesionByTeamId).toEqual(friction.teamCohesionByTeamId)
    expect(improved.staffPoliticalActionsById).toEqual(friction.staffPoliticalActionsById)
  }, 120_000)

  it('the real political COORDINATE pathway supplies the relationship evidence; never an invented sporting score', () => {
    const f = fixture()
    const subject = Object.values(f.world.teamStaffAssignmentsById).find(item =>
      item.teamId === f.team.id && item.role === 'assistantCoach' &&
      item.staffPersonId !== f.shooting.staffPersonId && item.staffPersonId !== f.skills.staffPersonId)!
    if (!subject) throw new Error('Political case must have an independent real applicant')
    const caseId = staffPoliticalCaseIdFor(f.team.id, 'CAREER_REQUEST', 'bs19c-p7-represented-request')
    const politicalCase = createStaffPoliticalCase({
      id: caseId, scopeKey: f.team.id, teamId: f.team.id,
      sourceKind: 'CAREER_REQUEST', sourceId: 'bs19c-p7-represented-request', agenda: 'RESPONSIBILITY',
      subjectStaffId: subject.staffPersonId, openedOn: f.world.currentDate,
      lastEvaluatedOn: f.world.currentDate, status: 'OPEN',
    })
    const actors = [f.shooting.staffPersonId, f.skills.staffPersonId].sort()
    const action = createStaffPoliticalAction({
      id: staffPoliticalActionIdFor(caseId, 'COORDINATE', 'SUPPORT', actors),
      caseId, teamId: f.team.id, kind: 'COORDINATE', stance: 'SUPPORT', actorIds: actors,
      performedOn: f.world.currentDate,
    })
    const committed = updateGameWorld(f.world, { staffPoliticalCases: [politicalCase], staffPoliticalActions: [action] })
    const observed = applyStaffPoliticalActionConsequences(committed, [action])
    expect(staffCohesionDevelopmentMultiplier(observed, f.session)).toBe(1) // no evaluated unit cohesion yet
    const unit = initializeStaffUnitCohesionState(observed, f.view)
    const reviewed = updateGameWorld(observed, { staffUnitCohesionStates: [unit] })
    const factor = staffCohesionDevelopmentMultiplier(reviewed, f.session)
    expect(factor).toBeGreaterThanOrEqual(0.96)
    expect(factor).toBeLessThanOrEqual(1.04)
    expect(factor).not.toBe(1)
    expect(observed.relationshipsByKey[`${f.shooting.staffPersonId}->${f.skills.staffPersonId}`]?.events.some(e =>
      e.context.politicalActionId === action.id)).toBe(true)
    expect(applyStaffPoliticalActionConsequences(reviewed, [action])).toBe(reviewed)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(reviewed, '2026-10-18T12:00:00.000Z'))
    expect(staffCohesionDevelopmentMultiplier(restored, f.session)).toBeCloseTo(factor, 12)
    expect(restored.staffPoliticalActionsById[action.id]).toEqual(action)
  }, 120_000)

  it('a future-dated cohesion state is not used to change an earlier training session', () => {
    const f = fixture()
    const good = withCohesion(f, 90)
    const state = Object.values(good.staffUnitCohesionStatesByUnitKey)[0]!
    const future = updateGameWorld(good, { staffUnitCohesionStates: [
      createStaffUnitCohesionState({ ...state, lastEvaluatedOn: addDays(good.currentDate, 30) }),
    ] })
    expect(staffCohesionDevelopmentMultiplier(future, f.session)).toBe(1)
  }, 120_000)
})
