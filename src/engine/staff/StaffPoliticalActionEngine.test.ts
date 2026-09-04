import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createStaffPerson, createTeamStaffAssignment, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { staffHumanContextIdFor } from '@/domain/staffHumanState'
import { staffPoliticalCaseIdFor } from '@/domain/staffPolitics'
import { updateGameWorld } from '@/domain/world'
import { buildStaffPoliticalRelevanceIndex } from './StaffPoliticalPositionEngine'
import { progressStaffPoliticalActions } from './StaffPoliticalActionEngine'
import { progressStaffPoliticalCases } from './StaffPoliticalCaseEngine'

type Stance = 'SUPPORT' | 'OPPOSE' | 'MEDIATE'

function worldFor(positions: readonly Stance[], access = 100) {
  const base = createNewGame(); const teamId = Object.values(base.teams)[0]!.id; const assignments = Object.values(base.teamStaffAssignmentsById).filter((item) => item.teamId === teamId)
  const [subjectAssignment, ...existingActors] = assignments; const extras = Array.from({ length: Math.max(0, positions.length - existingActors.length) }, (_, index) => { const id = staffPersonIdFromString(`action-extra-${index}`); return { person: createStaffPerson({ id, identity: { firstName: 'Action', lastName: `${index}` }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 100])) as never } }), assignment: createTeamStaffAssignment({ id: teamStaffAssignmentIdFromString(`action-extra-assignment-${index}`), staffPersonId: id, teamId, role: 'generalManager' as never, assignedOn: base.currentDate }) } })
  const actorAssignments = [...existingActors, ...extras.map((extra) => extra.assignment)]; const subjectId = subjectAssignment!.staffPersonId; const actorIds = actorAssignments.slice(0, positions.length).map((item) => item.staffPersonId)
  const coachId = base.teams[teamId]!.coachId!
  const upgradedAssignments = [...Object.values(base.teamStaffAssignmentsById).map((assignment) => assignment.teamId !== teamId || assignment.staffPersonId === subjectId ? assignment : { ...assignment, role: 'generalManager' as never }), ...extras.map((extra) => extra.assignment)]
  const employment = { ...base.staffEmploymentByStaffId, ...Object.fromEntries(upgradedAssignments.filter((assignment) => assignment.teamId === teamId).map((assignment) => [assignment.staffPersonId, { status: 'employed' as const, teamId, roleId: assignment.role, startedOn: base.currentDate }])) }
  const contexts = upgradedAssignments.filter((assignment) => assignment.teamId === teamId).map((assignment) => ({ id: staffHumanContextIdFor(assignment.staffPersonId, teamId, base.currentDate), staffId: assignment.staffPersonId, teamId, startedOn: base.currentDate }))
  const relationships = Object.fromEntries(actorIds.map((actorId) => [`${actorId}->${coachId}`, { sourceId: actorId, targetId: coachId, value: 0, events: [], dimensions: { trust: access, professionalRespect: access, communicationQuality: access, collaboration: 0, personalCloseness: 0, perceivedSupport: access, reliability: 0, professionalAlignment: access } }]))
  const politicalCase = { id: staffPoliticalCaseIdFor(teamId, 'CAREER_REQUEST', 'action-engine'), scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: 'action-engine', agenda: 'CAREER' as const, subjectStaffId: subjectId, openedOn: base.currentDate, lastEvaluatedOn: base.currentDate, status: 'OPEN' as const, positions: actorIds.map((actorId, index) => ({ actorId, stance: positions[index]!, since: base.currentDate, lastEvaluatedOn: base.currentDate })) }
  const boostedPeople = [...Object.values(base.staffPeopleById), ...extras.map((extra) => extra.person)].map((person) => actorIds.includes(person.id as never) ? { ...person, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 100])) as never } } : person)
  const world = updateGameWorld(base, { staffPeople: boostedPeople, teamStaffAssignments: upgradedAssignments, staffEmploymentByStaffId: employment, staffHumanContexts: contexts, relationshipsByKey: relationships, staffPoliticalCases: [politicalCase] })
  return { world, teamId, actorIds, politicalCase }
}

const progress = (world: ReturnType<typeof worldFor>['world']) => progressStaffPoliticalActions(world, buildStaffPoliticalRelevanceIndex(world))

describe('StaffPoliticalActionEngine', () => {
  it('generates ENDORSE only for capable SUPPORT without lobby access, and keeps weak support passive', () => {
    const eligible = worldFor(['SUPPORT'], 0); const endorsed = Object.values(progress(eligible.world).staffPoliticalActionsById)
    expect(endorsed).toHaveLength(1); expect(endorsed[0]).toMatchObject({ kind: 'ENDORSE', stance: 'SUPPORT', actorIds: [eligible.actorIds[0]] }); expect(endorsed[0]!.target).toBeUndefined()
    expect(Object.keys(progress(worldFor(['SUPPORT'], -100).world).staffPoliticalActionsById)).toEqual([])
  })

  it('generates real-coach SUPPORT and OPPOSE LOBBY actions without duplicate ENDORSE', () => {
    for (const stance of ['SUPPORT', 'OPPOSE'] as const) { const value = worldFor([stance]); const actions = Object.values(progress(value.world).staffPoliticalActionsById); expect(actions).toEqual([expect.objectContaining({ kind: 'LOBBY', stance, target: { kind: 'COACH', id: value.world.teams[value.teamId]!.coachId } })]); expect(actions.some((action) => action.kind === 'ENDORSE')).toBe(false) }
  })

  it('coordinates same-side actors deterministically, caps participants, and mediates only real polarization', () => {
    const coordinated = worldFor(['SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT', 'SUPPORT'], 0); const first = progress(coordinated.world); const support = Object.values(first.staffPoliticalActionsById).find((action) => action.kind === 'COORDINATE')!
    expect(support).toMatchObject({ stance: 'SUPPORT' }); expect(support.actorIds).toHaveLength(4); expect(progress(first)).toBe(first)
    const opposed = Object.values(progress(worldFor(['OPPOSE', 'OPPOSE'], 0).world).staffPoliticalActionsById).find((action) => action.kind === 'COORDINATE'); expect(opposed?.stance).toBe('OPPOSE')
    expect(Object.values(progress(worldFor(['SUPPORT', 'OPPOSE']).world).staffPoliticalActionsById).some((action) => action.kind === 'COORDINATE')).toBe(false)
    expect(Object.values(progress(worldFor(['SUPPORT', 'OPPOSE', 'MEDIATE']).world).staffPoliticalActionsById).some((action) => action.kind === 'MEDIATE')).toBe(true)
    expect(Object.values(progress(worldFor(['MEDIATE']).world).staffPoliticalActionsById).some((action) => action.kind === 'MEDIATE')).toBe(false)
  })

  it('caps action creation, leaves closed cases passive, and has no world-side effects', () => {
    const value = worldFor(['SUPPORT', 'SUPPORT', 'OPPOSE', 'OPPOSE', 'MEDIATE']); const before = { requests: value.world.staffCareerRequestsById, autonomy: value.world.staffCareerAutonomyByContextId, states: value.world.staffHumanStatesByContextId, relationships: value.world.relationshipsByKey, memories: value.world.memoriesById, conflicts: value.world.staffConflictsById }; const progressed = progress(value.world)
    expect(Object.keys(progressed.staffPoliticalActionsById).length).toBeLessThanOrEqual(4); expect({ requests: progressed.staffCareerRequestsById, autonomy: progressed.staffCareerAutonomyByContextId, states: progressed.staffHumanStatesByContextId, relationships: progressed.relationshipsByKey, memories: progressed.memoriesById, conflicts: progressed.staffConflictsById }).toEqual(before)
    for (const status of ['RESOLVED', 'EXPIRED'] as const) { const closed = updateGameWorld(value.world, { staffPoliticalCases: [{ ...value.politicalCase, status, resolution: { kind: status === 'RESOLVED' ? 'APPROVED' as const : 'EXPIRED' as const, resolvedOn: value.world.currentDate } }] }); expect(progress(closed)).toBe(closed) }
    const lobby = worldFor(['SUPPORT']); const withAction = progress(lobby.world); const history = Object.values(withAction.staffPoliticalActionsById)
    const resolved = updateGameWorld(withAction, { staffPoliticalCases: [{ ...lobby.politicalCase, status: 'RESOLVED' as const, resolution: { kind: 'APPROVED' as const, resolvedOn: lobby.world.currentDate } }] })
    const departed = updateGameWorld(resolved, { teamStaffAssignments: Object.values(resolved.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId !== lobby.actorIds[0]), staffContracts: Object.values(resolved.staffContractsById).filter((contract) => contract.staffId !== lobby.actorIds[0]), staffEmploymentByStaffId: { ...resolved.staffEmploymentByStaffId, [lobby.actorIds[0]!]: { status: 'unemployed' as const } } })
    expect(Object.values(departed.staffPoliticalActionsById)).toEqual(history)
  })

  it('resolves sources before actions on the weekly case pipeline', () => {
    const value = worldFor(['SUPPORT']); let checkpoint = value.world.currentDate; while (new Date(`${checkpoint}T00:00:00Z`).getUTCDay() !== 1) checkpoint = addDays(checkpoint, 1); const request = { id: 'action-engine', contextId: Object.values(value.world.staffHumanContextsById).find((context) => context.staffId === value.politicalCase.subjectStaffId)!.id, staffId: value.politicalCase.subjectStaffId!, teamId: value.teamId, kind: 'RELEASE' as const, createdOn: value.world.currentDate, status: 'DECLINED' as const, resolvedOn: checkpoint }
    const progressed = progressStaffPoliticalCases(updateGameWorld(value.world, { currentDate: checkpoint, staffCareerRequests: [request] }))
    expect(Object.values(progressed.staffPoliticalCasesById)[0]!.status).toBe('RESOLVED'); expect(progressed.staffPoliticalActionsById).toEqual({})
  })
})
