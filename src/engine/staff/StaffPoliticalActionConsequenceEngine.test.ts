import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { type GameDate } from '@/domain/date'
import { staffPersonIdFromString } from '@/domain/ids'
import { createRelationshipProfile, getRelationshipDimensions, relationshipKey, type RelationshipEvent } from '@/domain/relationships'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, createStaffPerson } from '@/domain/staff'
import { createStaffPoliticalAction, staffPoliticalActionIdFor, staffPoliticalCaseIdFor, type PoliticalActionKind, type PoliticalStance } from '@/domain/staffPolitics'
import { applyRelationshipEventsToWorld, updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV3, serializeGameWorldV3 } from '@/save/GameWorldSaveV3'
import { applyStaffPoliticalActionConsequences } from './StaffPoliticalActionConsequenceEngine'

const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const dimensions = (personalCloseness = 37) => ({ trust: 0, professionalRespect: 0, communicationQuality: 0, collaboration: 0, personalCloseness, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 })

function fixture(options: { readonly subjectless?: boolean; readonly actorNames?: readonly string[]; readonly currentDate?: GameDate } = {}) {
  const base = createNewGame(); const teamId = Object.values(base.teams)[0]!.id; const date = '2032-10-08' as GameDate
  const subjectId = staffPersonIdFromString('politics-subject'); const actorIds = (options.actorNames ?? ['politics-actor']).map(staffPersonIdFromString)
  const people = [subjectId, ...actorIds].map((id) => createStaffPerson({ id, identity: { firstName: id, lastName: 'Staff' }, professional: { attributes } }))
  const politicalCase = { id: staffPoliticalCaseIdFor(teamId, 'CAREER_REQUEST', `request-${options.subjectless ? 'subjectless' : 'subject'}`), scopeKey: teamId, teamId, sourceKind: 'CAREER_REQUEST' as const, sourceId: `request-${options.subjectless ? 'subjectless' : 'subject'}`, agenda: 'CAREER' as const, ...(options.subjectless ? {} : { subjectStaffId: subjectId }), openedOn: date, lastEvaluatedOn: date, status: 'OPEN' as const }
  const world = updateGameWorld(base, { currentDate: options.currentDate ?? ('2032-10-20' as GameDate), staffPeople: [...Object.values(base.staffPeopleById), ...people], staffPoliticalCases: [politicalCase] })
  return { world, teamId, date, subjectId, actorIds, politicalCase: world.staffPoliticalCasesById[politicalCase.id]!, coachId: world.teams[teamId]!.coachId! }
}

function action(value: ReturnType<typeof fixture>, kind: PoliticalActionKind, stance: PoliticalStance, actorIds = value.actorIds, target?: { readonly kind: 'COACH'; readonly id: string }) {
  return createStaffPoliticalAction({ id: staffPoliticalActionIdFor(value.politicalCase.id, kind, stance, actorIds, target), caseId: value.politicalCase.id, teamId: value.teamId, kind, stance, actorIds, ...(target === undefined ? {} : { target }), performedOn: value.date })
}

function withRelationship(value: ReturnType<typeof fixture>, sourceId: string, targetId: string, personalCloseness = 37) {
  const profile = { ...createRelationshipProfile(sourceId, targetId), dimensions: dimensions(personalCloseness) }
  return updateGameWorld(value.world, { relationshipsByKey: { ...value.world.relationshipsByKey, [relationshipKey(sourceId, targetId)]: profile } })
}

function profile(world: ReturnType<typeof fixture>['world'], sourceId: string, targetId: string) { return world.relationshipsByKey[relationshipKey(sourceId, targetId)] }
function expectDimensions(world: ReturnType<typeof fixture>['world'], sourceId: string, targetId: string, expected: Record<string, number>) { expect(getRelationshipDimensions(profile(world, sourceId, targetId))).toMatchObject(expected) }
function memory(world: ReturnType<typeof fixture>['world']) { return Object.values(world.memoriesById)[0]! }
function unrelatedMemory(value: ReturnType<typeof fixture>) { return { id: 'memory:unrelated', owner: { kind: 'staff' as const, id: value.subjectId }, type: 'trust' as const, occurredOn: value.date, entityRefs: [{ kind: 'staff' as const, id: value.actorIds[0]! }, { kind: 'team' as const, id: value.teamId }], semanticKey: 'unrelated-memory', importance: 'minor' as const, valence: 1, intensity: 1, decayPerMonth: 1, permanent: false, tags: [], context: { fixture: true } } }
function untouchedPoliticalState(world: ReturnType<typeof fixture>['world']) { return { staffCareerRequestsById: world.staffCareerRequestsById, staffCareerAutonomyByContextId: world.staffCareerAutonomyByContextId, staffHumanStatesByContextId: world.staffHumanStatesByContextId, staffReactionRecordsById: world.staffReactionRecordsById, staffConflictsById: world.staffConflictsById, staffPoliticalCasesById: world.staffPoliticalCasesById, staffPoliticalPositionsByCaseId: undefined, staffPoliticalActionsById: world.staffPoliticalActionsById } }

describe('StaffPoliticalActionConsequenceEngine', () => {
  it('applies ENDORSE support only from subject to actor with its support memory', () => {
    const value = fixture(); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const next = applyStaffPoliticalActionConsequences(seeded, [action(value, 'ENDORSE', 'SUPPORT')])
    expect(profile(next, value.subjectId, value.actorIds[0]!)!.events[0]).toMatchObject({ gameDate: value.date, source: 'professionalInteraction', delta: 3 })
    expectDimensions(next, value.subjectId, value.actorIds[0]!, { perceivedSupport: 6, trust: 3, professionalRespect: 2, personalCloseness: 37 }); expect(profile(next, value.actorIds[0]!, value.subjectId)).toBeUndefined()
    expect(memory(next)).toMatchObject({ owner: { kind: 'staff', id: value.subjectId }, type: 'support', importance: 'notable', valence: 45, intensity: 45, decayPerMonth: 5, permanent: false, sourceId: action(value, 'ENDORSE', 'SUPPORT').id }); expect(memory(next).relationshipImpact).toBeUndefined(); expect(memory(next).entityRefs).toEqual(expect.arrayContaining([{ kind: 'staff', id: value.actorIds[0] }, { kind: 'team', id: value.teamId }]))
  })

  it('applies SUPPORT LOBBY only from subject to actor and leaves lobbying target relationships alone', () => {
    const value = fixture(); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const targetSeeded = withRelationship({ ...value, world: seeded }, value.actorIds[0]!, value.coachId); const beforeTarget = profile(targetSeeded, value.actorIds[0]!, value.coachId); const next = applyStaffPoliticalActionConsequences(targetSeeded, [action(value, 'LOBBY', 'SUPPORT', value.actorIds, { kind: 'COACH', id: value.coachId })])
    expect(profile(next, value.subjectId, value.actorIds[0]!)!.value).toBe(5); expectDimensions(next, value.subjectId, value.actorIds[0]!, { perceivedSupport: 9, trust: 4, professionalRespect: 3, professionalAlignment: 2, personalCloseness: 37 }); expect(profile(next, value.actorIds[0]!, value.coachId)).toEqual(beforeTarget); expect(profile(next, value.coachId, value.actorIds[0]!)).toBeUndefined(); expect(profile(next, value.subjectId, value.coachId)).toBeUndefined()
    expect(memory(next)).toMatchObject({ type: 'support', importance: 'important', valence: 65, intensity: 65, decayPerMonth: 4 })
  })

  it('applies OPPOSE LOBBY without personal, conflict, or betrayal side effects', () => {
    const value = fixture(); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const next = applyStaffPoliticalActionConsequences(seeded, [action(value, 'LOBBY', 'OPPOSE', value.actorIds, { kind: 'COACH', id: value.coachId })])
    expect(profile(next, value.subjectId, value.actorIds[0]!)!.value).toBe(-5); expectDimensions(next, value.subjectId, value.actorIds[0]!, { perceivedSupport: -9, trust: -5, professionalRespect: -2, professionalAlignment: -3, personalCloseness: 37 }); expect(memory(next)).toMatchObject({ type: 'trust', importance: 'important', valence: -60, intensity: 60, decayPerMonth: 4 }); expect(Object.values(next.memoriesById).some((item) => item.type === 'betrayal' || item.type === 'conflict')).toBe(false); expect(next.staffConflictsById).toEqual(seeded.staffConflictsById)
  })

  it('applies MEDIATE only from subject to mediator with its trust memory', () => {
    const value = fixture(); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const next = applyStaffPoliticalActionConsequences(seeded, [action(value, 'MEDIATE', 'MEDIATE')])
    expect(profile(next, value.subjectId, value.actorIds[0]!)!.value).toBe(3); expectDimensions(next, value.subjectId, value.actorIds[0]!, { professionalRespect: 4, communicationQuality: 5, trust: 2, perceivedSupport: 0, personalCloseness: 37 }); expect(profile(next, value.actorIds[0]!, value.subjectId)).toBeUndefined(); expect(memory(next)).toMatchObject({ type: 'trust', importance: 'notable', valence: 35, intensity: 40, decayPerMonth: 5 })
  })

  it('coordinates two actors in exactly both directions without memories or subject effects', () => {
    const value = fixture({ actorNames: ['a', 'b'] }); const forward = withRelationship(value, value.actorIds[0]!, value.actorIds[1]!); const seeded = withRelationship({ ...value, world: forward }, value.actorIds[1]!, value.actorIds[0]!); const next = applyStaffPoliticalActionConsequences(seeded, [action(value, 'COORDINATE', 'SUPPORT')])
    for (const [source, target] of [[value.actorIds[0]!, value.actorIds[1]!], [value.actorIds[1]!, value.actorIds[0]!]] as const) { expect(profile(next, source, target)!.value).toBe(2); expectDimensions(next, source, target, { collaboration: 3, professionalAlignment: 2, trust: 1, personalCloseness: 37 }) }
    expect(profile(next, value.subjectId, value.actorIds[0]!)).toBeUndefined(); expect(profile(next, value.subjectId, value.actorIds[1]!)).toBeUndefined(); expect(Object.values(next.memoriesById)).toHaveLength(0)
  })

  it('coordinates four actors over six unordered pairs with deterministic unique directional event IDs', () => {
    const value = fixture({ actorNames: ['a', 'b', 'c', 'd'] }); let seeded = value.world; for (const source of value.actorIds) for (const target of value.actorIds) if (source !== target) seeded = withRelationship({ ...value, world: seeded }, source, target); const politicalAction = action(value, 'COORDINATE', 'SUPPORT'); const next = applyStaffPoliticalActionConsequences(seeded, [politicalAction]); const profiles = Object.values(next.relationshipsByKey)
    expect(profiles).toHaveLength(12); expect(profiles.every((item) => item.sourceId !== item.targetId && item.events.length === 1 && getRelationshipDimensions(item).personalCloseness === 37)).toBe(true); const ids = profiles.map((item) => item.events[0]!.id).sort(); expect(new Set(ids).size).toBe(12); expect(ids).toEqual(value.actorIds.flatMap((source) => value.actorIds.filter((target) => target !== source).map((target) => `staff-politics:${politicalAction.id}:relationship:${source}->${target}`)).sort()); expect(Object.values(next.memoriesById)).toHaveLength(0)
  })

  it('makes subjectless ENDORSE, LOBBY, and MEDIATE no-ops while retaining COORDINATE', () => {
    const value = fixture({ subjectless: true, actorNames: ['a', 'b'] }); expect(() => applyStaffPoliticalActionConsequences(value.world, [action(value, 'ENDORSE', 'SUPPORT', [value.actorIds[0]!])])).not.toThrow(); expect(applyStaffPoliticalActionConsequences(value.world, [action(value, 'ENDORSE', 'SUPPORT', [value.actorIds[0]!])])).toBe(value.world); expect(applyStaffPoliticalActionConsequences(value.world, [action(value, 'LOBBY', 'SUPPORT', [value.actorIds[0]!], { kind: 'COACH', id: value.coachId })])).toBe(value.world); expect(applyStaffPoliticalActionConsequences(value.world, [action(value, 'MEDIATE', 'MEDIATE', [value.actorIds[0]!])])).toBe(value.world)
    const coordinated = applyStaffPoliticalActionConsequences(value.world, [action(value, 'COORDINATE', 'SUPPORT')]); expect(Object.values(coordinated.relationshipsByKey)).toHaveLength(2)
  })

  it('is idempotent, uses action performedOn, and mutates only relationships and memories', () => {
    const value = fixture({ currentDate: '2032-11-01' as GameDate }); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const politicalAction = action(value, 'LOBBY', 'SUPPORT', value.actorIds, { kind: 'COACH', id: value.coachId }); const before = untouchedPoliticalState(seeded); const first = applyStaffPoliticalActionConsequences(seeded, [politicalAction]); const second = applyStaffPoliticalActionConsequences(first, [politicalAction])
    expect(second).toBe(first); expect(Object.values(second.memoriesById)).toHaveLength(1); expect(profile(second, value.subjectId, value.actorIds[0]!)!.events).toHaveLength(1); expect(profile(second, value.subjectId, value.actorIds[0]!)!.events[0]!.gameDate).toBe(value.date); expect(memory(second).occurredOn).toBe(value.date); expect(untouchedPoliticalState(second)).toEqual(before)
  })

  it('preserves indexed existing memories while adding a new consequence memory once', () => {
    const value = fixture(); const seeded = updateGameWorld(withRelationship(value, value.subjectId, value.actorIds[0]!), { memories: [unrelatedMemory(value)] }); const next = applyStaffPoliticalActionConsequences(seeded, [action(value, 'ENDORSE', 'SUPPORT')])
    expect(next.memoriesById['memory:unrelated']).toEqual(unrelatedMemory(value)); expect(Object.values(next.memoriesById)).toHaveLength(2)
  })

  it('deduplicates the same action supplied twice in one consequence call', () => {
    const value = fixture(); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const politicalAction = action(value, 'ENDORSE', 'SUPPORT'); const next = applyStaffPoliticalActionConsequences(seeded, [politicalAction, politicalAction])
    expect(profile(next, value.subjectId, value.actorIds[0]!)!.events).toHaveLength(1); expect(Object.values(next.memoriesById)).toHaveLength(1); expect(applyStaffPoliticalActionConsequences(next, [politicalAction])).toBe(next)
  })

  it('round-trips the action, relationship event and dimensions, and complete deterministic memory through Save V3', () => {
    const value = fixture(); const seeded = withRelationship(value, value.subjectId, value.actorIds[0]!); const politicalAction = action(value, 'LOBBY', 'SUPPORT', value.actorIds, { kind: 'COACH', id: value.coachId }); const applied = applyStaffPoliticalActionConsequences(updateGameWorld(seeded, { staffPoliticalActions: [politicalAction] }), [politicalAction]); const loaded = deserializeGameWorldV3(serializeGameWorldV3(applied, '2032-10-01T00:00:00.000Z')); const remembered = memory(loaded)
    expect(loaded.staffPoliticalActionsById).toEqual(applied.staffPoliticalActionsById); expect(loaded.relationshipsByKey).toEqual(applied.relationshipsByKey); expect(loaded.memoriesById).toEqual(applied.memoriesById); expect(remembered.id).toBe(`memory:staff-politics:${politicalAction.id}:${value.subjectId}:${value.actorIds[0]}`); expect(remembered.semanticKey).toBe(`staff-politics:${politicalAction.id}:${value.subjectId}:${value.actorIds[0]}`); expect(remembered.sourceId).toBe(politicalAction.id); expect(remembered.context).toEqual({ politicalActionId: politicalAction.id, politicalCaseId: value.politicalCase.id, teamId: value.teamId, kind: 'LOBBY', stance: 'SUPPORT' }); expect(remembered.relationshipImpact).toBeUndefined()
  })

  it('applies a relationship batch directionally, idempotently, and through facet saturation', () => {
    const value = fixture({ actorNames: ['a', 'b', 'c'] }); const first: RelationshipEvent = { id: 'batch:first', gameDate: value.date, source: 'professionalInteraction', delta: 5, dimensionDeltas: { trust: 10 }, context: { test: true } }; const second: RelationshipEvent = { id: 'batch:second', gameDate: value.date, source: 'professionalInteraction', delta: 5, dimensionDeltas: { trust: 10 }, context: { test: true } }
    const seeded = withRelationship(value, value.actorIds[0]!, value.actorIds[1]!, 37); const nearLimit = { ...profile(seeded, value.actorIds[0]!, value.actorIds[1]!)!, dimensions: { ...dimensions(37), trust: 95 } }; const world = updateGameWorld(seeded, { relationshipsByKey: { ...seeded.relationshipsByKey, [relationshipKey(value.actorIds[0]!, value.actorIds[1]!)]: nearLimit } }); const batch = [{ sourceId: value.actorIds[0]!, targetId: value.actorIds[1]!, event: first }, { sourceId: value.actorIds[0]!, targetId: value.actorIds[2]!, event: second }]; const next = applyRelationshipEventsToWorld(world, batch)
    expect(profile(next, value.actorIds[0]!, value.actorIds[1]!)!.events).toHaveLength(1); expect(profile(next, value.actorIds[0]!, value.actorIds[2]!)!.events).toHaveLength(1); expect(profile(next, value.actorIds[1]!, value.actorIds[0]!)).toBeUndefined(); expect(getRelationshipDimensions(profile(next, value.actorIds[0]!, value.actorIds[1]!)).trust).toBe(97); expect(applyRelationshipEventsToWorld(next, batch)).toBe(next)
  })
})
