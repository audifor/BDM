import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createPersonality } from '@/domain/personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from '@/domain/personality/SemanticPersonality'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createStaffHumanContext, createStaffHumanEvent, createStaffHumanState, staffHumanContextIdFor } from '@/domain/staffHumanState'
import { updateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { applyStaffHumanEvent, applyStaffHumanEventsBatch } from './StaffHumanReactionEngine'

function fixture() {
  const base = createNewGame()
  const staff = Object.values(base.staffPeopleById).find((person) => person.marketRole !== 'headCoach')!
  const employee = createStaffPerson({
    ...staff, identity: { ...staff.identity, dateOfBirth: '1990-04-20' },
    professional: { attributes: { ...Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, staff.professional.attributes[key]])) } as never },
  })
  const withStaff = updateGameWorld(base, {
    staffPeople: Object.values(base.staffPeopleById).map((s) => s.id === employee.id ? employee : s),
  })
  const teamId = Object.values(withStaff.teams)[0]!.id
  const contextId = staffHumanContextIdFor(employee.id, teamId, withStaff.currentDate)
  const context = createStaffHumanContext({ id: contextId, staffId: employee.id, teamId, startedOn: withStaff.currentDate })
  const state = createStaffHumanState({
    contextId, staffId: employee.id,
    roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50,
    influenceSatisfaction: 50, contractSatisfaction: 50, workloadSatisfaction: 50,
    professionalFulfillment: 50, recognitionSatisfaction: 50,
    frustration: 20, stress: 20, organizationalCommitment: 50, lastEvaluatedOn: withStaff.currentDate,
  })
  const personality = createPersonality({ values: Object.fromEntries(
    SEMANTIC_PERSONALITY_DIMENSIONS.map((key) => [key, 50]),
  ) as never })
  const world = updateGameWorld(withStaff, {
    staffHumanContexts: [context], staffHumanStates: [state],
    personalitiesByPersonId: { ...withStaff.personalitiesByPersonId, [employee.id]: personality },
  })
  const event = createStaffHumanEvent({
    id: 'staff:observed:success', kind: 'professionalSuccess', staffId: employee.id,
    contextId, occurredOn: world.currentDate, importance: 'IMPORTANT',
    sourceEventId: 'verified:professional-review:001',
    attribution: { actorKind: 'SYSTEMIC_CONTEXT' }, payload: {},
  })
  return { world, context, event, staffId: employee.id }
}

describe('PERSON 50 observed from canonical StaffHuman events', () => {
  it('single successful review writes traceable 50D experience, not a fabricated event', () => {
    const { world, context, event, staffId } = fixture()
    const first = applyStaffHumanEvent(world, context, event)
    expect(first.reaction).toBeDefined()
    const entries = first.world.personalityHistoryByPersonId[staffId]!
    expect(entries).toHaveLength(1)
    expect(entries[0]!.dimensionCode).toBe('conscientiousness')
    expect(entries[0]!.newValue).toBeGreaterThan(entries[0]!.previousValue)
    expect(first.world.moraleByPersonId[staffId]!.events[0]!.context.personalityEventKind).toBe('PROFESSIONAL_REVIEW')
    const duplicate = applyStaffHumanEvent(first.world, context, event)
    expect(duplicate.reaction).toBeUndefined()
    expect(duplicate.world).toBe(first.world)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(first.world, '2032-10-01T00:00:00.000Z'))
    expect(restored.personalityHistoryByPersonId[staffId]).toEqual(entries)
  })
  it('batch path matches the single observed result without changing legacy staffing events', () => {
    const { world, context, event, staffId } = fixture()
    const single = applyStaffHumanEvent(world, context, event).world
    const batch = applyStaffHumanEventsBatch(world, [event])
    expect(batch.personalityHistoryByPersonId[staffId]).toEqual(single.personalityHistoryByPersonId[staffId])
    expect(batch.personalitiesByPersonId[staffId]).toEqual(single.personalitiesByPersonId[staffId])
    const duplicateBatch = applyStaffHumanEventsBatch(batch, [event])
    expect(duplicateBatch.personalityHistoryByPersonId[staffId]).toEqual(batch.personalityHistoryByPersonId[staffId])
    const none = createStaffHumanEvent({ ...event, id: 'staff:observed:workload', kind: 'sustainedHealthyWorkload', sourceEventId: 'verified:workload:01' })
    const ordinary = applyStaffHumanEvent(world, context, none)
    expect(ordinary.world.personalityHistoryByPersonId[staffId]).toBeUndefined()
  })
})
