import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { createGameDate } from '@/domain/date'
import { staffHumanContextIdFor, createStaffHumanContext, createStaffHumanState, createStaffHumanEvent, type StaffHumanEvent } from '@/domain/staffHumanState'
import { applyStaffHumanEvent } from './StaffHumanReactionEngine'
import type { TeamId, StaffPersonId } from '@/domain/ids'

function baseWorld() {
  return createNewGame()
}

function seedContext(world: GameWorld, staffId: StaffPersonId, teamId: TeamId) {
  const contextId = staffHumanContextIdFor(staffId, teamId, world.currentDate)
  const context = createStaffHumanContext({ id: contextId, staffId, teamId, startedOn: world.currentDate })
  const state = createStaffHumanState({
    contextId, staffId,
    roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50, influenceSatisfaction: 50,
    contractSatisfaction: 50, workloadSatisfaction: 50, professionalFulfillment: 50, recognitionSatisfaction: 50,
    frustration: 20, stress: 20, organizationalCommitment: 50,
    lastEvaluatedOn: world.currentDate,
  })
  const seeded = updateGameWorld(world, { staffHumanContexts: [context], staffHumanStates: [state] })
  return { world: seeded, contextId }
}

function pickStaff(world: GameWorld, teamId: TeamId, role: string): StaffPersonId {
  return getTeamStaffAssignments(world, teamId).find((assignment) => assignment.role === role)!.staffPersonId
}

function makeEvent(overrides: Partial<StaffHumanEvent> & Pick<StaffHumanEvent, 'staffId' | 'contextId'>): StaffHumanEvent {
  return createStaffHumanEvent({
    id: overrides.id ?? `event:${overrides.sourceEventId ?? 'src'}:${overrides.kind ?? 'responsibilityGranted'}`,
    kind: overrides.kind ?? 'responsibilityGranted',
    staffId: overrides.staffId,
    contextId: overrides.contextId,
    occurredOn: overrides.occurredOn ?? createGameDate(2032, 10, 1),
    importance: overrides.importance ?? 'MEANINGFUL',
    sourceEventId: overrides.sourceEventId ?? 'source-1',
    attribution: overrides.attribution ?? { actorKind: 'USER_COACH', actorId: 'coach-1' },
    payload: overrides.payload ?? {},
  })
}

describe('applyStaffHumanEvent', () => {
  it('applies a positive event and produces a ReactionRecord', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityGranted' })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    expect(result.reaction).toBeDefined()
    const updatedState = result.world.staffHumanStatesByContextId[contextId]!
    expect(updatedState.responsibilitySatisfaction).toBeGreaterThan(50)
  })

  it('idempotency: reprocessing the same source event/kind changes nothing a second time', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityGranted' })
    const first = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const second = applyStaffHumanEvent(first.world, first.world.staffHumanContextsById[contextId]!, event)
    expect(second.reaction).toBeUndefined()
    expect(second.world.staffHumanStatesByContextId[contextId]).toEqual(first.world.staffHumanStatesByContextId[contextId])
    expect(Object.keys(second.world.staffReactionRecordsById)).toHaveLength(1)
  })

  it('determinism: same inputs produce the same output', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'importantRecommendationRejected', importance: 'IMPORTANT' })
    const a = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const b = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    expect(a.reaction!.stateDelta).toEqual(b.reaction!.stateDelta)
  })

  it('importance ordering: CRITICAL moves state further than IMPORTANT further than MEANINGFUL further than ROUTINE', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const magnitudes = (['ROUTINE', 'MEANINGFUL', 'IMPORTANT', 'CRITICAL'] as const).map((importance) => {
      const { world, contextId } = seedContext(base, staffId, teamId)
      const event = makeEvent({ staffId, contextId, kind: 'staffRoleReduced', importance, sourceEventId: `src-${importance}` })
      const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
      return Math.abs(result.reaction!.stateDelta.roleSatisfaction ?? 0)
    })
    expect(magnitudes[0]).toBeLessThan(magnitudes[1])
    expect(magnitudes[1]).toBeLessThan(magnitudes[2])
    expect(magnitudes[2]).toBeLessThan(magnitudes[3])
  })

  it('personality: different personalities produce different reaction magnitudes for the same event, within sane bounds', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffA = pickStaff(base, teamId, 'assistantCoach')
    const staffB = pickStaff(base, teamId, 'regionalScout')
    const withPersonalities = updateGameWorld(base, {
      personalitiesByPersonId: {
        ...base.personalitiesByPersonId,
        [staffA]: { values: { ...base.personalitiesByPersonId[staffA]!.values, resilience: 10, adaptability: 10 } },
        [staffB]: { values: { ...base.personalitiesByPersonId[staffB]!.values, resilience: 95, adaptability: 95 } },
      } as never,
    })
    const seededA = seedContext(withPersonalities, staffA, teamId)
    const seededB = seedContext(withPersonalities, staffB, teamId)
    const eventA = makeEvent({ staffId: staffA, contextId: seededA.contextId, kind: 'sustainedOverload', importance: 'IMPORTANT', attribution: { actorKind: 'SYSTEMIC_CONTEXT' } })
    const eventB = makeEvent({ staffId: staffB, contextId: seededB.contextId, kind: 'sustainedOverload', importance: 'IMPORTANT', attribution: { actorKind: 'SYSTEMIC_CONTEXT' } })
    const resultA = applyStaffHumanEvent(seededA.world, seededA.world.staffHumanContextsById[seededA.contextId]!, eventA)
    const resultB = applyStaffHumanEvent(seededB.world, seededB.world.staffHumanContextsById[seededB.contextId]!, eventB)
    const stressA = resultA.reaction!.stateDelta.stress!
    const stressB = resultB.reaction!.stateDelta.stress!
    expect(stressA).not.toBe(stressB)
    expect(stressA).toBeGreaterThan(stressB) // low resilience/adaptability => bigger stress swing
    expect(stressA / stressB).toBeLessThan(2.6) // sane bounds, not a caricature
  })

  it('saturation: an already-high frustration resists a large jump from one more negative routine event', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const contextId = staffHumanContextIdFor(staffId, teamId, base.currentDate)
    const context = createStaffHumanContext({ id: contextId, staffId, teamId, startedOn: base.currentDate })
    const nearMaxState = createStaffHumanState({
      contextId, staffId,
      roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50, influenceSatisfaction: 50,
      contractSatisfaction: 50, workloadSatisfaction: 50, professionalFulfillment: 50, recognitionSatisfaction: 50,
      frustration: 94, stress: 20, organizationalCommitment: 50,
      lastEvaluatedOn: base.currentDate,
    })
    const world = updateGameWorld(base, { staffHumanContexts: [context], staffHumanStates: [nearMaxState] })
    const event = makeEvent({ staffId, contextId, kind: 'actionableRecommendationRejected', importance: 'ROUTINE' })
    const result = applyStaffHumanEvent(world, context, event)
    const updated = result.world.staffHumanStatesByContextId[contextId]!
    expect(updated.frustration).toBeLessThan(100)
    expect(updated.frustration - 94).toBeLessThan(3)
  })

  it('attribution: relationship effect points to the actual attributed actor, not an arbitrary default', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const gmId = 'gm-actor-1'
    const withGm = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: gmId as never, identity: { firstName: 'GM', lastName: 'Person' }, professional: { attributes: world.staffPeopleById[staffId]!.professional.attributes } }],
    })
    const event = makeEvent({ staffId, contextId, kind: 'importantRecommendationRejected', importance: 'IMPORTANT', attribution: { actorKind: 'EXECUTIVE', actorId: gmId } })
    const result = applyStaffHumanEvent(withGm, withGm.staffHumanContextsById[contextId]!, event)
    const relationshipKeyToGm = `${staffId}->${gmId}`
    expect(result.world.relationshipsByKey[relationshipKeyToGm]).toBeDefined()
    // Confirm no relationship was created to a coach that was never the actor.
    const coachId = Object.values(withGm.coaches)[0]!.id
    const relationshipKeyToCoach = `${staffId}->${coachId}`
    expect(result.world.relationshipsByKey[relationshipKeyToCoach]).toBeUndefined()
  })

  it('systemic events never create a personal relationship effect', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'sustainedOverload', importance: 'IMPORTANT', attribution: { actorKind: 'SYSTEMIC_CONTEXT' } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    expect(Object.keys(result.world.relationshipsByKey)).toHaveLength(0)
  })
})
