import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays, type GameDate } from '@/domain/date'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createStaffPerson, createTeamStaffAssignment, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { staffHumanContextIdFor } from '@/domain/staffHumanState'
import { updateGameWorld } from '@/domain/world'
import { staffPoliticalCaseIdFor } from '@/domain/staffPolitics'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { appraiseStaffPoliticalPosition, buildStaffPoliticalRelevanceIndex, discoverRelevantPoliticalActors, MAX_POLITICAL_ACTORS_PER_CASE, progressStaffPoliticalPositions } from './StaffPoliticalPositionEngine'
import { progressStaffPoliticalCases } from './StaffPoliticalCaseEngine'
import { isStaffWeeklyCheckpoint } from './StaffWeeklyCadence'
import { progressStaffPoliticalActions } from './StaffPoliticalActionEngine'

const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const nextMonday = (date: GameDate) => { let next = date; while (!isStaffWeeklyCheckpoint(next)) next = addDays(next, 1); return next }

function fixture(options: { readonly relationship?: 'actorToSubject' | 'subjectToActor' | 'none'; readonly dimensions?: Record<string, number>; readonly caseKind?: 'RELEASE' | 'MORE_RESPONSIBILITY' | 'PROMOTION'; readonly holder?: boolean; readonly conflict?: boolean; readonly actorRole?: string; readonly coachAccess?: number; readonly positions?: readonly { actorId: ReturnType<typeof staffPersonIdFromString>; stance: 'SUPPORT' | 'OPPOSE' | 'MEDIATE'; since: GameDate; lastEvaluatedOn: GameDate }[] } = {}) {
  const seeded = createNewGame(); const date = nextMonday(seeded.currentDate); const base = updateGameWorld(seeded, { currentDate: date }); const teamId = Object.values(base.teams)[0]!.id
  const subjectId = staffPersonIdFromString('politics-subject'); const actorId = staffPersonIdFromString('politics-actor')
  const people = [subjectId, actorId].map((id) => createStaffPerson({ id, identity: { firstName: id, lastName: 'Staff' }, professional: { attributes } }))
  const assignments = [subjectId, actorId].map((staffPersonId, index) => createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(`politics-assignment-${index}`), staffPersonId, teamId, role: (index === 0 ? 'assistantCoach' : options.actorRole ?? 'regionalScout') as never, assignedOn: date }))
  const contexts = [subjectId, actorId].map((staffId) => ({ id: staffHumanContextIdFor(staffId, teamId, date), staffId, teamId, startedOn: date }))
  const kind = options.caseKind ?? 'RELEASE'; const request = { id: 'politics-request', contextId: contexts[0]!.id, staffId: subjectId, teamId, kind, createdOn: date, status: 'OPEN' as const, ...(kind === 'MORE_RESPONSIBILITY' ? { targetResponsibilityKind: 'assignScouts' as never } : {}), ...(kind === 'PROMOTION' ? { targetRoleId: 'regionalScout' as never } : {}) }
  const politicalCase = { id: staffPoliticalCaseIdFor(teamId, 'CAREER_REQUEST', request.id), scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: request.id, agenda: 'CAREER' as const, subjectStaffId: subjectId, openedOn: date, lastEvaluatedOn: date, status: 'OPEN' as const, positions: options.positions ?? [] }
  const coachId = base.teams[teamId]!.coachId!
  const relationship = { ...(options.relationship === undefined || options.relationship === 'none' ? {} : { [`${options.relationship === 'actorToSubject' ? actorId : subjectId}->${options.relationship === 'actorToSubject' ? subjectId : actorId}`]: { sourceId: options.relationship === 'actorToSubject' ? actorId : subjectId, targetId: options.relationship === 'actorToSubject' ? subjectId : actorId, value: 0, events: [], dimensions: { trust: 0, professionalRespect: 0, communicationQuality: 0, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0, ...options.dimensions } } }), ...(options.coachAccess === undefined ? {} : { [`${actorId}->${coachId}`]: { sourceId: actorId, targetId: coachId, value: 0, events: [], dimensions: { trust: options.coachAccess, professionalRespect: options.coachAccess, communicationQuality: options.coachAccess, collaboration: 0, personalCloseness: 0, perceivedSupport: options.coachAccess, reliability: 0, professionalAlignment: options.coachAccess } } }) }
  const responsibilities = options.holder && kind === 'MORE_RESPONSIBILITY' ? [{ id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts' as const, mode: 'delegated' as const, holderStaffId: actorId, assignedOn: date }] : []
  const conflicts = options.conflict ? [{ id: 'politics-conflict', scopeKey: teamId, teamId, type: 'CAREER' as const, primaryCause: 'lowTrust' as const, startedOn: date, lastEvaluatedOn: date, status: 'ACTIVE' as const, stage: 'ACTIVE' as const, severity: 'MINOR' as const, participants: [{ actorId: subjectId, role: 'PRIMARY' as const, state: { grievance: 0, willingnessToCompromise: 50, perceivedFairness: 50, emotionalInvestment: 0 }, joinedOn: date }, { actorId, role: 'SECONDARY' as const, state: { grievance: 0, willingnessToCompromise: 50, perceivedFairness: 50, emotionalInvestment: 0 }, joinedOn: date }], sourceTriggerIds: [] }] : []
  const world = updateGameWorld(base, { staffPeople: [...Object.values(base.staffPeopleById), ...people], teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), ...assignments], staffEmploymentByStaffId: { ...base.staffEmploymentByStaffId, [subjectId]: { status: 'employed' as const, teamId, roleId: 'assistantCoach' as never, startedOn: date }, [actorId]: { status: 'employed' as const, teamId, roleId: (options.actorRole ?? 'regionalScout') as never, startedOn: date } }, staffHumanContexts: [...Object.values(base.staffHumanContextsById), ...contexts], staffCareerRequests: [request], staffPoliticalCases: [politicalCase], responsibilities, staffConflicts: conflicts, relationshipsByKey: relationship })
  return { world, politicalCase: Object.values(world.staffPoliticalCasesById)[0]!, subjectId, actorId, teamId, date }
}

describe('StaffPoliticalPositionEngine', () => {
  it('uses only actor-to-subject relationships for relevance', () => {
    const incoming = fixture({ relationship: 'actorToSubject' }); expect(discoverRelevantPoliticalActors(incoming.world, incoming.politicalCase, buildStaffPoliticalRelevanceIndex(incoming.world))).toContain(incoming.actorId)
    const outgoing = fixture({ relationship: 'subjectToActor' }); expect(discoverRelevantPoliticalActors(outgoing.world, outgoing.politicalCase, buildStaffPoliticalRelevanceIndex(outgoing.world))).not.toContain(outgoing.actorId)
  })

  it('forms SUPPORT only from strong professional evidence, never personal closeness alone', () => {
    const strong = fixture({ relationship: 'actorToSubject', dimensions: { trust: 80, perceivedSupport: 80, professionalAlignment: 80, collaboration: 80, professionalRespect: 80 } }); const index = buildStaffPoliticalRelevanceIndex(strong.world); expect(appraiseStaffPoliticalPosition(strong.world, strong.politicalCase, strong.actorId, index).recommendedStance).toBe('SUPPORT')
    const personal = fixture({ relationship: 'actorToSubject', dimensions: { personalCloseness: 100 } }); const personalIndex = buildStaffPoliticalRelevanceIndex(personal.world); expect(appraiseStaffPoliticalPosition(personal.world, personal.politicalCase, personal.actorId, personalIndex).recommendedStance).toBeUndefined()
  })

  it('does not interpret neutral evidence as MEDIATE', () => { const value = fixture(); const index = buildStaffPoliticalRelevanceIndex(value.world); expect(appraiseStaffPoliticalPosition(value.world, value.politicalCase, value.actorId, index).recommendedStance).toBeUndefined() })

  it('appraises real responsibility holders and target-role incumbents as OPPOSE', () => {
    const responsibility = fixture({ caseKind: 'MORE_RESPONSIBILITY', holder: true }); const responsibilityIndex = buildStaffPoliticalRelevanceIndex(responsibility.world); const responsibilityAppraisal = appraiseStaffPoliticalPosition(responsibility.world, responsibility.politicalCase, responsibility.actorId, responsibilityIndex); expect(discoverRelevantPoliticalActors(responsibility.world, responsibility.politicalCase, responsibilityIndex)).toContain(responsibility.actorId); expect(responsibilityAppraisal.opposePressure).toBeGreaterThan(0); expect(responsibilityAppraisal.recommendedStance).toBe('OPPOSE')
    const promotion = fixture({ caseKind: 'PROMOTION' }); const promotionIndex = buildStaffPoliticalRelevanceIndex(promotion.world); expect(discoverRelevantPoliticalActors(promotion.world, promotion.politicalCase, promotionIndex)).toContain(promotion.actorId); expect(appraiseStaffPoliticalPosition(promotion.world, promotion.politicalCase, promotion.actorId, promotionIndex).recommendedStance).toBe('OPPOSE')
  })

  it('does not manufacture OPPOSE from negative relationship evidence alone', () => { const value = fixture({ relationship: 'actorToSubject', dimensions: { trust: -100, professionalAlignment: -100 } }); const index = buildStaffPoliticalRelevanceIndex(value.world); expect(appraiseStaffPoliticalPosition(value.world, value.politicalCase, value.actorId, index).recommendedStance).not.toBe('OPPOSE') })

  it('reaches MEDIATE only from meaningful balanced real conflict evidence and excludes self-interest', () => {
    const mediator = fixture({ relationship: 'actorToSubject', conflict: true, dimensions: { trust: 45, perceivedSupport: 45, professionalAlignment: 45, collaboration: 45, professionalRespect: 45 } }); const appraisal = appraiseStaffPoliticalPosition(mediator.world, mediator.politicalCase, mediator.actorId, buildStaffPoliticalRelevanceIndex(mediator.world)); expect(appraisal.supportPressure).toBeGreaterThanOrEqual(15); expect(appraisal.opposePressure).toBeGreaterThanOrEqual(15); expect(appraisal.recommendedStance).toBe('MEDIATE')
    const holder = fixture({ caseKind: 'MORE_RESPONSIBILITY', holder: true, relationship: 'actorToSubject', conflict: true, dimensions: { trust: 45, perceivedSupport: 45, professionalAlignment: 45, collaboration: 45, professionalRespect: 45 } }); expect(appraiseStaffPoliticalPosition(holder.world, holder.politicalCase, holder.actorId, buildStaffPoliticalRelevanceIndex(holder.world)).recommendedStance).not.toBe('MEDIATE')
  })

  it('applies small-margin retention and material switches through progression', () => {
    const small = fixture({ caseKind: 'PROMOTION', relationship: 'actorToSubject', dimensions: { trust: 100, perceivedSupport: 100, professionalAlignment: 100, collaboration: 100, professionalRespect: 100 }, positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] }); const smallNext = progressStaffPoliticalPositions(updateGameWorld(small.world, { currentDate: addDays(small.date, 7) })); const retained = Object.values(smallNext.staffPoliticalCasesById)[0]!.positions![0]!; expect(retained.stance).toBe('SUPPORT'); expect(retained.since).toBe(small.date); expect(retained.lastEvaluatedOn).toBe(addDays(small.date, 7))
    const material = fixture({ caseKind: 'MORE_RESPONSIBILITY', holder: true, positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] }); const materialDate = addDays(material.date, 7); const switched = Object.values(progressStaffPoliticalPositions(updateGameWorld(material.world, { currentDate: materialDate })).staffPoliticalCasesById)[0]!.positions![0]!; expect(switched).toMatchObject({ stance: 'OPPOSE', since: materialDate, lastEvaluatedOn: materialDate })
  })

  it('preserves active-but-irrelevant and resolved/expired historical positions', () => {
    const active = fixture({ positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] }); expect(Object.values(progressStaffPoliticalPositions(active.world).staffPoliticalCasesById)[0]!.positions![0]!.stance).toBe('SUPPORT')
    for (const status of ['RESOLVED', 'EXPIRED'] as const) { const historical = fixture({ positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] }); const baseCase = historical.politicalCase; const caseWithStatus = { ...baseCase, status, resolution: { kind: status === 'RESOLVED' ? 'APPROVED' as const : 'EXPIRED' as const, resolvedOn: historical.date } }; const changed = updateGameWorld(historical.world, { staffPoliticalCases: [caseWithStatus], teamStaffAssignments: Object.values(historical.world.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId !== historical.actorId), staffEmploymentByStaffId: { ...historical.world.staffEmploymentByStaffId, [historical.actorId]: { status: 'unemployed' } } }); expect(Object.values(progressStaffPoliticalPositions(changed).staffPoliticalCasesById)[0]!.positions).toEqual(baseCase.positions) }
  })

  it('resolves the source before appraising new positions on a checkpoint', () => { const value = fixture({ positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] }); const request = Object.values(value.world.staffCareerRequestsById)[0]!; const resolved = updateGameWorld(value.world, { staffCareerRequests: [{ ...request, status: 'DECLINED', resolvedOn: value.date }] }); const politicalCase = Object.values(progressStaffPoliticalCases(resolved).staffPoliticalCasesById)[0]!; expect(politicalCase.status).toBe('RESOLVED'); expect(politicalCase.positions).toEqual(value.politicalCase.positions) })

  it('caps and repeats actor discovery deterministically', () => { const value = fixture({ relationship: 'actorToSubject' }); const index = buildStaffPoliticalRelevanceIndex(value.world); expect(discoverRelevantPoliticalActors(value.world, value.politicalCase, index)).toEqual(discoverRelevantPoliticalActors(value.world, value.politicalCase, index)); expect(discoverRelevantPoliticalActors(value.world, value.politicalCase, index).length).toBeLessThanOrEqual(MAX_POLITICAL_ACTORS_PER_CASE) })

  it('caches one political influence projection per active Staff member', () => {
    const value = fixture(); const index = buildStaffPoliticalRelevanceIndex(value.world)
    expect(Object.keys(index.politicalInfluenceByStaffId).sort()).toEqual(Object.keys(index.activeContextByStaffId).sort())
    expect(index.politicalInfluenceByStaffId[value.actorId]).toBeDefined()
  })

  it('removes departed positions from open cases but preserves resolved history', () => {
    const open = fixture({ positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] }); const departed = updateGameWorld(open.world, { teamStaffAssignments: Object.values(open.world.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId !== open.actorId), staffEmploymentByStaffId: { ...open.world.staffEmploymentByStaffId, [open.actorId]: { status: 'unemployed' } } }); expect(Object.values(progressStaffPoliticalPositions(departed).staffPoliticalCasesById)[0]!.positions).toEqual([])
  })

  it('keeps ordinary positions passive, uses real coach lobbying, and is idempotent', () => {
    const passive = fixture({ positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] })
    expect(progressStaffPoliticalActions(passive.world, buildStaffPoliticalRelevanceIndex(passive.world))).toBe(passive.world)
    const active = fixture({ actorRole: 'generalManager', coachAccess: 100, positions: [{ actorId: staffPersonIdFromString('politics-actor'), stance: 'SUPPORT', since: nextMonday(createNewGame().currentDate), lastEvaluatedOn: nextMonday(createNewGame().currentDate) }] })
    const progressed = progressStaffPoliticalActions(active.world, buildStaffPoliticalRelevanceIndex(active.world)); const actions = Object.values(progressed.staffPoliticalActionsById)
    expect(actions).toHaveLength(1); expect(actions[0]).toMatchObject({ kind: 'LOBBY', stance: 'SUPPORT', actorIds: [active.actorId], target: { kind: 'COACH', id: active.world.teams[active.teamId]!.coachId } })
    expect(progressStaffPoliticalActions(progressed, buildStaffPoliticalRelevanceIndex(progressed))).toBe(progressed)
  })
})
