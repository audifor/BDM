import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { createGameDate } from '@/domain/date'
import { staffHumanContextIdFor, createStaffHumanContext, createStaffHumanState, createStaffHumanEvent, type StaffHumanEvent } from '@/domain/staffHumanState'
import { applyStaffHumanEvent } from './StaffHumanReactionEngine'
import type { TeamId, StaffPersonId } from '@/domain/ids'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { dismissStaffRecommendation } from '@/app/staffRecommendations'
import { RELATIONSHIP_DIMENSION_KEYS } from '@/domain/relationships'

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

describe('Wave 5B — Working Relationships', () => {
  it('A. RESPONSIBILITY GRANT: Staff -> attributable Head Coach relationship gains trust/respect/support', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityGranted', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const relationship = result.world.relationshipsByKey[`${staffId}->${coachId}`]!
    expect(relationship.dimensions?.trust).toBeGreaterThan(0)
    expect(relationship.dimensions?.professionalRespect).toBeGreaterThan(0)
    expect(relationship.dimensions?.perceivedSupport).toBeGreaterThan(0)
  })

  it('B. MODE INCREASE (advisory -> delegated): positive professional relationship effect', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityModeIncreased', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const relationship = result.world.relationshipsByKey[`${staffId}->${coachId}`]!
    expect(relationship.dimensions?.trust).toBeGreaterThan(0)
    expect(relationship.dimensions?.professionalRespect).toBeGreaterThan(0)
  })

  it('C. ACTIONABLE REJECTION isolated: small professional effect, no large trust change, no personalCloseness', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'actionableRecommendationRejected', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const relationship = result.world.relationshipsByKey[`${staffId}->${coachId}`]!
    expect(Math.abs(relationship.dimensions?.trust ?? 0)).toBeLessThanOrEqual(2)
    expect(relationship.dimensions?.personalCloseness ?? 0).toBe(0)
  })

  it('D. IMPORTANT REJECTION: larger effect than an isolated/routine rejection', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world: isolatedWorld, contextId: isolatedContextId } = seedContext(base, staffId, teamId)
    const isolatedResult = applyStaffHumanEvent(isolatedWorld, isolatedWorld.staffHumanContextsById[isolatedContextId]!, makeEvent({ staffId, contextId: isolatedContextId, kind: 'actionableRecommendationRejected', attribution: { actorKind: 'USER_COACH', actorId: coachId }, sourceEventId: 'isolated' }))
    const isolatedRespect = isolatedResult.world.relationshipsByKey[`${staffId}->${coachId}`]?.dimensions?.professionalRespect ?? 0

    const { world: importantWorld, contextId: importantContextId } = seedContext(base, staffId, teamId)
    const importantResult = applyStaffHumanEvent(importantWorld, importantWorld.staffHumanContextsById[importantContextId]!, makeEvent({ staffId, contextId: importantContextId, kind: 'importantRecommendationRejected', importance: 'IMPORTANT', attribution: { actorKind: 'USER_COACH', actorId: coachId }, sourceEventId: 'important' }))
    const importantRespect = importantResult.world.relationshipsByKey[`${staffId}->${coachId}`]?.dimensions?.professionalRespect ?? 0

    expect(Math.abs(importantRespect)).toBeGreaterThan(Math.abs(isolatedRespect))
  })

  it('E. POSITIVE PATTERN: trust/respect/communication/collaboration all improve', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'recommendationPatternPositive', importance: 'IMPORTANT', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const dims = result.world.relationshipsByKey[`${staffId}->${coachId}`]!.dimensions!
    expect(dims.trust).toBeGreaterThan(0)
    expect(dims.professionalRespect).toBeGreaterThan(0)
    expect(dims.communicationQuality).toBeGreaterThan(0)
    expect(dims.collaboration).toBeGreaterThan(0)
  })

  it('F. NEGATIVE PATTERN: larger, coherent deterioration', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'recommendationPatternNegative', importance: 'IMPORTANT', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const dims = result.world.relationshipsByKey[`${staffId}->${coachId}`]!.dimensions!
    expect(dims.trust).toBeLessThan(0)
    expect(dims.professionalRespect).toBeLessThan(0)
    expect(dims.communicationQuality).toBeLessThan(0)
  })

  it('G (bridge-level sanity, NOT the real informational-dismiss guarantee — see the seam-level test below): an event kind with no relationship facet mapping never creates a relationship', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'sustainedHealthyWorkload', importance: 'ROUTINE', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    expect(Object.keys(result.world.relationshipsByKey)).toHaveLength(0)
  })

  it('G (REAL seam): dismissing a genuinely INFORMATIONAL DelegationOutcome through dismissStaffRecommendation produces zero rejection event, zero new RelationshipEvent, an unchanged value, all 8 dimensions unchanged, and no negative Memory', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world: seededWorld, contextId } = seedContext(base, staffId, teamId)

    // oppositionScouting has no canonical acceptance seam (Wave 4C3) — genuinely INFORMATIONAL.
    const advisory = setTeamResponsibility(seededWorld, { teamId, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId })

    // A preexisting Staff->Coach relationship snapshot, so the assertion is meaningful (not just "0 === 0").
    const preexistingProfile = { sourceId: staffId, targetId: coachId, value: 12, dimensions: { trust: 10, professionalRespect: 8, communicationQuality: 5, collaboration: 3, personalCloseness: 0, perceivedSupport: 6, reliability: 4, professionalAlignment: 2 }, events: [] }
    const withProfile = updateGameWorld(advisory, { relationshipsByKey: { ...advisory.relationshipsByKey, [`${staffId}->${coachId}`]: preexistingProfile } })

    const outcomeId = 'delegation-outcome:informational-real-seam' as never
    const withOutcome = updateGameWorld(withProfile, {
      delegationOutcomes: [...Object.values(withProfile.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${teamId}:oppositionScouting` as never, staffId, decidedOn: withProfile.currentDate, kind: 'oppositionScouting', applied: false, qualityScore: 60, payload: {} }],
    })

    const beforeState = withOutcome.staffHumanStatesByContextId[contextId]!
    const beforeReactionCount = Object.keys(withOutcome.staffReactionRecordsById).length
    const beforeRelationship = withOutcome.relationshipsByKey[`${staffId}->${coachId}`]!
    const beforeMemoryCount = Object.keys(withOutcome.memoriesById).length

    const result = dismissStaffRecommendation(withOutcome, outcomeId)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // No StaffHumanEvent of rejection ever fired.
    expect(Object.keys(result.world.staffReactionRecordsById)).toHaveLength(beforeReactionCount)
    expect(result.world.staffHumanStatesByContextId[contextId]).toEqual(beforeState)

    // No new RelationshipEvent — the events array is byte-identical, value unchanged, all 8 dimensions unchanged.
    const afterRelationship = result.world.relationshipsByKey[`${staffId}->${coachId}`]!
    expect(afterRelationship.events).toEqual(beforeRelationship.events)
    expect(afterRelationship.value).toBe(beforeRelationship.value)
    for (const key of RELATIONSHIP_DIMENSION_KEYS) expect(afterRelationship.dimensions![key]).toBe(beforeRelationship.dimensions![key])

    // No negative Memory derived from a rejection that never happened.
    expect(Object.keys(result.world.memoriesById)).toHaveLength(beforeMemoryCount)
  })

  it('H. SYSTEMIC / NO ACTOR: no personal relationship effect', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityGranted', attribution: { actorKind: 'SYSTEMIC_CONTEXT' } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    expect(Object.keys(result.world.relationshipsByKey)).toHaveLength(0)
  })

  it('I. CORRECT ACTOR: explicit Staff/Coach actor gets the relationship, no userCoach fallback', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const otherStaffId = pickStaff(base, teamId, 'regionalScout')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityGranted', attribution: { actorKind: 'OTHER_STAFF', actorId: otherStaffId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    expect(result.world.relationshipsByKey[`${staffId}->${otherStaffId}`]).toBeDefined()
    expect(result.world.relationshipsByKey[`${staffId}->${world.userCoachId}`]).toBeUndefined()
  })

  it('J. BENEFICIARY: a Staff person reassigned a Responsibility (gain event) receives no automatic hostility', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const otherStaffId = pickStaff(base, teamId, 'regionalScout')
    const { world, contextId } = seedContext(base, staffId, teamId)
    const event = makeEvent({ staffId, contextId, kind: 'responsibilityReassignedToStaff', attribution: { actorKind: 'OTHER_STAFF', actorId: otherStaffId } })
    const result = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, event)
    const relationship = result.world.relationshipsByKey[`${staffId}->${otherStaffId}`]
    if (relationship !== undefined) expect(relationship.dimensions?.perceivedSupport ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('Human State feedback: same negative reaction is dampened by a strong relationship vs. amplified by a poor one, bounded', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id

    const strongProfile = { sourceId: staffId, targetId: coachId, value: 80, dimensions: { trust: 80, professionalRespect: 80, communicationQuality: 80, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 }, events: [] }
    const poorProfile = { sourceId: staffId, targetId: coachId, value: -80, dimensions: { trust: -80, professionalRespect: -80, communicationQuality: -80, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 }, events: [] }

    const { world: baseWorldWithContext, contextId } = seedContext(base, staffId, teamId)
    const strongWorld = updateGameWorld(baseWorldWithContext, { relationshipsByKey: { ...baseWorldWithContext.relationshipsByKey, [`${staffId}->${coachId}`]: strongProfile } })
    const poorWorld = updateGameWorld(baseWorldWithContext, { relationshipsByKey: { ...baseWorldWithContext.relationshipsByKey, [`${staffId}->${coachId}`]: poorProfile } })

    const negativeEvent = makeEvent({ staffId, contextId, kind: 'importantRecommendationRejected', importance: 'IMPORTANT', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const strongResult = applyStaffHumanEvent(strongWorld, strongWorld.staffHumanContextsById[contextId]!, negativeEvent)
    const poorResult = applyStaffHumanEvent(poorWorld, poorWorld.staffHumanContextsById[contextId]!, negativeEvent)

    const strongMagnitude = Math.abs(strongResult.reaction!.stateDelta.influenceSatisfaction ?? 0)
    const poorMagnitude = Math.abs(poorResult.reaction!.stateDelta.influenceSatisfaction ?? 0)
    expect(strongMagnitude).toBeLessThan(poorMagnitude)
    expect(poorMagnitude / Math.max(1, strongMagnitude)).toBeLessThan(3) // bounded, no runaway amplification
  })

  it('legacy profile (no facets) still modulates Human State reactions via `value`, unchanged from pre-5B behavior', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)
    const legacyProfile = { sourceId: staffId, targetId: coachId, value: 70, events: [] }
    const withLegacy = updateGameWorld(world, { relationshipsByKey: { ...world.relationshipsByKey, [`${staffId}->${coachId}`]: legacyProfile } })
    const event = makeEvent({ staffId, contextId, kind: 'importantRecommendationRejected', importance: 'IMPORTANT', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const result = applyStaffHumanEvent(withLegacy, withLegacy.staffHumanContextsById[contextId]!, event)
    expect(result.reaction).toBeDefined()
    expect(Number.isFinite(result.reaction!.stateDelta.influenceSatisfaction)).toBe(true)
  })

  it('HARD DIRECTIONALITY: an extreme actor->staff profile with no staff->actor profile never modulates the reaction — the reverse direction is never consulted', () => {
    const base = baseWorld()
    const teamId = Object.values(base.teams)[0]!.id
    const staffId = pickStaff(base, teamId, 'assistantCoach')
    const coachId = Object.values(base.coaches)[0]!.id
    const { world, contextId } = seedContext(base, staffId, teamId)

    // Only actor->staff exists (the coach's perception of the Staff), and it is extreme in BOTH
    // directions across two otherwise-identical worlds — if the reverse direction were ever
    // consulted, these two extreme-but-opposite profiles would produce different reaction
    // magnitudes. They must not: staff->actor is absent in both, so the modifier must be neutral (1x).
    const extremePositiveReverse = { sourceId: coachId, targetId: staffId, value: 100, dimensions: { trust: 100, professionalRespect: 100, communicationQuality: 100, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 }, events: [] }
    const extremeNegativeReverse = { sourceId: coachId, targetId: staffId, value: -100, dimensions: { trust: -100, professionalRespect: -100, communicationQuality: -100, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 }, events: [] }
    const worldPositiveReverse = updateGameWorld(world, { relationshipsByKey: { ...world.relationshipsByKey, [`${coachId}->${staffId}`]: extremePositiveReverse } })
    const worldNegativeReverse = updateGameWorld(world, { relationshipsByKey: { ...world.relationshipsByKey, [`${coachId}->${staffId}`]: extremeNegativeReverse } })

    expect(worldPositiveReverse.relationshipsByKey[`${staffId}->${coachId}`]).toBeUndefined()
    expect(worldNegativeReverse.relationshipsByKey[`${staffId}->${coachId}`]).toBeUndefined()

    const event = makeEvent({ staffId, contextId, kind: 'importantRecommendationRejected', importance: 'IMPORTANT', attribution: { actorKind: 'USER_COACH', actorId: coachId } })
    const resultNoReverse = applyStaffHumanEvent(world, world.staffHumanContextsById[contextId]!, { ...event, id: 'event:no-reverse', sourceEventId: 'no-reverse' })
    const resultPositiveReverse = applyStaffHumanEvent(worldPositiveReverse, worldPositiveReverse.staffHumanContextsById[contextId]!, { ...event, id: 'event:positive-reverse', sourceEventId: 'positive-reverse' })
    const resultNegativeReverse = applyStaffHumanEvent(worldNegativeReverse, worldNegativeReverse.staffHumanContextsById[contextId]!, { ...event, id: 'event:negative-reverse', sourceEventId: 'negative-reverse' })

    // All three must be identical: the extreme actor->staff profile is never read, regardless of its sign.
    expect(resultPositiveReverse.reaction!.stateDelta).toEqual(resultNoReverse.reaction!.stateDelta)
    expect(resultNegativeReverse.reaction!.stateDelta).toEqual(resultNoReverse.reaction!.stateDelta)
  })
})
