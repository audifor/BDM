import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { advanceGameDay } from '@/app/game/advanceGameDay'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { acceptStaffRecommendation, dismissStaffRecommendation } from '@/app/staffRecommendations'
import { progressMedicalAdvisories } from '@/engine/injury/MedicalAdvisory'
import { staffHumanContextIdFor, createStaffHumanEvent } from '@/domain/staffHumanState'
import { applyStaffHumanEvent } from '@/engine/staff/StaffHumanReactionEngine'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

function acbWorld(): GameWorld {
  return createAcbTestGame({ userTeamKey: 'caz' })
}

function pickStaff(world: GameWorld, teamId: TeamId, role: string): StaffPersonId {
  return getTeamStaffAssignments(world, teamId).find((assignment) => assignment.role === role)!.staffPersonId
}

/** Runs `advanceGameDay` until this Staff person has a real `StaffHumanContext` — the daily pipeline creates one from their `StaffEmployment`. */
function ensureContext(world: GameWorld, staffId: StaffPersonId, teamId: TeamId): { world: GameWorld; contextId: ReturnType<typeof staffHumanContextIdFor> } {
  let current = world
  for (let day = 0; day < 3; day += 1) {
    const employment = current.staffEmploymentByStaffId[staffId]
    if (employment?.startedOn !== undefined) {
      const contextId = staffHumanContextIdFor(staffId, teamId, employment.startedOn)
      if (current.staffHumanContextsById[contextId] !== undefined) return { world: current, contextId }
    }
    current = advanceGameDay(current)
  }
  const employment = current.staffEmploymentByStaffId[staffId]!
  return { world: current, contextId: staffHumanContextIdFor(staffId, teamId, employment.startedOn!) }
}

describe('CASO 1 — RESPONSIBILITY GRANTED', () => {
  it('a real Responsibility grant on an ACB Staff person produces exactly one Human Event and a ReactionRecord', () => {
    const base = acbWorld()
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    const { world } = ensureContext(base, staffId, team.id)

    const before = world.staffHumanStatesByContextId[staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)]!
    const granted = setTeamResponsibility(world, { teamId: team.id, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })

    const contextId = staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)
    const reactions = Object.values(granted.staffReactionRecordsById).filter((record) => record.contextId === contextId && record.eventKind === 'responsibilityGranted')
    expect(reactions).toHaveLength(1)
    const after = granted.staffHumanStatesByContextId[contextId]!
    expect(after.responsibilitySatisfaction).toBeGreaterThanOrEqual(before.responsibilitySatisfaction)
  })

  it('Wave 5B ACB acceptance: real Responsibility grant -> facets change -> presentation shows it -> Save/load conserves the relationship', async () => {
    const { explainWorkingRelationship } = await import('@/ui/staffWorkingRelationshipPresentation')
    const { serializeGameWorldV3, deserializeGameWorldV3 } = await import('@/save/GameWorldSaveV3')
    const base = acbWorld()
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    const { world } = ensureContext(base, staffId, team.id)

    const granted = setTeamResponsibility(world, { teamId: team.id, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const relationship = granted.relationshipsByKey[`${staffId}->${granted.userCoachId}`]
    expect(relationship?.dimensions?.trust).toBeGreaterThan(0)

    const explanation = explainWorkingRelationship(granted, staffId, granted.userCoachId)
    expect(explanation).toBeDefined()
    expect(explanation!.facets.some((facet) => facet.key === 'trust')).toBe(true)
    expect(explanation!.recentInteractions.length).toBeGreaterThan(0)

    const loaded = deserializeGameWorldV3(serializeGameWorldV3(granted, '2032-10-01T00:00:00.000Z'))
    expect(loaded.relationshipsByKey[`${staffId}->${granted.userCoachId}`]).toEqual(relationship)
  })
})

describe('CASO 2 — MODE CHANGE', () => {
  it('advisory -> delegated increases autonomy satisfaction (or leaves it non-decreased)', () => {
    const base = acbWorld()
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    const { world } = ensureContext(base, staffId, team.id)
    const advisory = setTeamResponsibility(world, { teamId: team.id, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId })
    const contextId = staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)
    const beforeDelegated = advisory.staffHumanStatesByContextId[contextId]!.autonomySatisfaction

    const delegated = setTeamResponsibility(advisory, { teamId: team.id, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const afterDelegated = delegated.staffHumanStatesByContextId[contextId]!.autonomySatisfaction
    expect(afterDelegated).toBeGreaterThanOrEqual(beforeDelegated)
  })

  it('delegated -> advisory can reduce autonomy satisfaction (or leaves it non-increased)', () => {
    const base = acbWorld()
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    const { world } = ensureContext(base, staffId, team.id)
    const delegated = setTeamResponsibility(world, { teamId: team.id, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const contextId = staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)
    const beforeAdvisory = delegated.staffHumanStatesByContextId[contextId]!.autonomySatisfaction

    const advisory = setTeamResponsibility(delegated, { teamId: team.id, kind: 'createTeamTrainingPlan', mode: 'advisory', holderStaffId: staffId })
    const afterAdvisory = advisory.staffHumanStatesByContextId[contextId]!.autonomySatisfaction
    expect(afterAdvisory).toBeLessThanOrEqual(beforeAdvisory)
  })
})

function withActiveInjury(world: GameWorld, teamId: TeamId, suffix = '', playerIndex = 0) {
  const playerId = world.teams[teamId]!.rosterPlayerIds[playerIndex]!
  const injury = createInjury({ id: injuryIdFromString(`human-state-injury-${teamId}${suffix}`), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never })
  return { world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), injury] }), injury }
}

function withMedicalAdvisoryStaff(world: GameWorld, teamId: TeamId, role: string, kind: 'treatmentRecommendation') {
  const staffId = staffPersonIdFromString(`human-state-staff-${role}-${kind}-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Med', lastName: 'Ic' }, professional: { attributes: flatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`human-state-assignment-${role}-${kind}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { status: 'employed', teamId, roleId: role as never, startedOn: world.currentDate } },
  })
  const id = `responsibility:${teamId}:${kind}` as never
  const delegated = updateGameWorld(withStaff, {
    responsibilities: [...Object.values(withStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode: 'advisory', holderStaffId: staffId }],
  })
  return { world: delegated, staffId }
}

describe('CASO 3 — ACTIONABLE REJECTION', () => {
  it('DISMISS on an actionable (acceptance-seam-backed) recommendation produces a rejection event and reaction', () => {
    const base = createAcbTestGame({ userTeamKey: 'caz' })
    const team = getUserTeam(base)!
    const { world: withInjury } = withActiveInjury(base, team.id)
    const { world: withStaff, staffId } = withMedicalAdvisoryStaff(withInjury, team.id, 'teamDoctor', 'treatmentRecommendation')
    const { world } = ensureContext(withStaff, staffId, team.id)
    const progressed = progressMedicalAdvisories(world)
    const outcome = Object.values(progressed.delegationOutcomesById).find((item) => item.staffId === staffId && item.kind === 'treatmentRecommendation')!

    const contextId = staffHumanContextIdFor(staffId, team.id, progressed.staffEmploymentByStaffId[staffId]!.startedOn!)
    const before = progressed.staffHumanStatesByContextId[contextId]!

    const result = dismissStaffRecommendation(progressed, outcome.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const after = result.world.staffHumanStatesByContextId[contextId]!
    const rejectionReactions = Object.values(result.world.staffReactionRecordsById).filter((record) => record.contextId === contextId && (record.eventKind === 'actionableRecommendationRejected' || record.eventKind === 'importantRecommendationRejected'))
    expect(rejectionReactions.length).toBeGreaterThan(0)
    expect(after.influenceSatisfaction).toBeLessThanOrEqual(before.influenceSatisfaction)
  })
})

describe('CASO 4 — INFORMATIONAL DISMISS', () => {
  it('DISMISS on an oppositionScouting (informational, no acceptance seam) outcome never produces a rejection event or negative reaction', () => {
    const base = createAcbTestGame({ userTeamKey: 'caz' })
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    const { world } = ensureContext(base, staffId, team.id)
    const advisory = setTeamResponsibility(world, { teamId: team.id, kind: 'oppositionScouting', mode: 'advisory', holderStaffId: staffId })
    const contextId = staffHumanContextIdFor(staffId, team.id, advisory.staffEmploymentByStaffId[staffId]!.startedOn!)
    const outcomeId = 'delegation-outcome:human-state-opposition-scouting' as never
    const withOutcome = updateGameWorld(advisory, {
      delegationOutcomes: [...Object.values(advisory.delegationOutcomesById), { id: outcomeId, responsibilityId: `responsibility:${team.id}:oppositionScouting` as never, staffId, decidedOn: advisory.currentDate, kind: 'oppositionScouting', applied: false, qualityScore: 60, payload: {} }],
    })
    const before = withOutcome.staffHumanStatesByContextId[contextId]!
    const reactionCountBefore = Object.keys(withOutcome.staffReactionRecordsById).length
    const relationshipCountBefore = Object.keys(withOutcome.relationshipsByKey).length

    const result = dismissStaffRecommendation(withOutcome, outcomeId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const after = result.world.staffHumanStatesByContextId[contextId]!
    expect(Object.keys(result.world.staffReactionRecordsById)).toHaveLength(reactionCountBefore) // no new reaction at all
    expect(after).toEqual(before) // Human State completely untouched
    expect(Object.keys(result.world.relationshipsByKey)).toHaveLength(relationshipCountBefore) // no NEW relationship effect from the dismiss itself
  })
})

describe('CASO 5 — PATTERN', () => {
  it('multiple actionable rejections escalate to a recommendationPatternNegative / repeatedProfessionalDisregard signal', () => {
    const base = createAcbTestGame({ userTeamKey: 'caz' })
    const team = getUserTeam(base)!
    let world = base
    const outcomeIds: string[] = []
    for (let i = 0; i < 4; i += 1) {
      const { world: withInjury } = withActiveInjury(world, team.id, `-${i}`, i)
      world = withInjury
    }
    const { world: withStaff, staffId } = withMedicalAdvisoryStaff(world, team.id, 'teamDoctor', 'treatmentRecommendation')
    world = withStaff
    const { world: withContext } = ensureContext(world, staffId, team.id)
    world = withContext

    for (let i = 0; i < 4; i += 1) {
      world = progressMedicalAdvisories(world)
    }
    const allOutcomes = Object.values(world.delegationOutcomesById).filter((item) => item.staffId === staffId && item.kind === 'treatmentRecommendation')
    expect(allOutcomes.length).toBeGreaterThanOrEqual(3)

    for (const outcome of allOutcomes) {
      const result = dismissStaffRecommendation(world, outcome.id)
      if (result.ok) world = result.world
    }

    const contextId = staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)
    const patternReactions = Object.values(world.staffReactionRecordsById).filter((record) => record.contextId === contextId && record.eventKind === 'recommendationPatternNegative')
    expect(patternReactions.length).toBeGreaterThan(0)
  })
})

describe('CASO 7 — WORKLOAD', () => {
  it('sustained overload raises stress and lowers workload satisfaction; relief afterward recovers stress', { timeout: 45000 }, () => {
    const base = createAcbTestGame({ userTeamKey: 'caz' })
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    // Stack several delegated Responsibilities on the same holder to force overload.
    let world = base
    for (const kind of ['createTeamTrainingPlan', 'assignIndividualDevelopment', 'defensiveGamePlan', 'offensivePreparation'] as const) {
      world = setTeamResponsibility(world, { teamId: team.id, kind, mode: 'delegated', holderStaffId: staffId })
    }
    const { world: withContext } = ensureContext(world, staffId, team.id)
    world = withContext
    const contextId = staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)

    // Advance ~2 weeks so the weekly overload checkpoint repeats and registers as sustained.
    for (let day = 0; day < 15; day += 1) world = advanceGameDay(world)

    const overloadedState = world.staffHumanStatesByContextId[contextId]!
    expect(overloadedState.stress).toBeGreaterThan(20)

    // Relieve the overload by removing responsibilities, then advance again.
    for (const kind of ['createTeamTrainingPlan', 'assignIndividualDevelopment', 'defensiveGamePlan'] as const) {
      world = setTeamResponsibility(world, { teamId: team.id, kind, mode: 'userControlled' })
    }
    for (let day = 0; day < 14; day += 1) world = advanceGameDay(world)
    const recoveredState = world.staffHumanStatesByContextId[contextId]!
    expect(recoveredState.stress).toBeLessThanOrEqual(overloadedState.stress)
  })
})

describe('CASO 8 — ATTRIBUTION', () => {
  it('a non-coach decision maker attribution points relationship effects at that Person, not automatically the user coach', () => {
    const base = createAcbTestGame({ userTeamKey: 'caz' })
    const team = getUserTeam(base)!
    const staffId = pickStaff(base, team.id, 'assistantCoach')
    const { world } = ensureContext(base, staffId, team.id)
    const contextId = staffHumanContextIdFor(staffId, team.id, world.staffEmploymentByStaffId[staffId]!.startedOn!)
    const context = world.staffHumanContextsById[contextId]!

    const gmId = 'gm-fixture-actor'
    const withGm = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: gmId as never, identity: { firstName: 'GM', lastName: 'Fixture' }, professional: { attributes: flatAttributes } }],
    })
    const event = createStaffHumanEvent({
      id: 'event:test-gm-attribution:importantRecommendationRejected',
      kind: 'importantRecommendationRejected',
      staffId,
      contextId,
      occurredOn: withGm.currentDate,
      importance: 'IMPORTANT',
      sourceEventId: 'test-gm-attribution',
      attribution: { actorKind: 'EXECUTIVE', actorId: gmId },
      payload: {},
    })
    const result = applyStaffHumanEvent(withGm, context, event)
    expect(result.world.relationshipsByKey[`${staffId}->${gmId}`]).toBeDefined()
    const coachId = Object.values(withGm.coaches)[0]!.id
    expect(result.world.relationshipsByKey[`${staffId}->${coachId}`]).toBeUndefined()
  })
})
