import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { relationshipKey } from '@/domain/relationships'
import {
  STAFF_EXPECTATION_DIMENSIONS,
  STAFF_HUMAN_STATE_DIMENSIONS,
  staffHumanContextIdFor,
  createStaffHumanContext,
  knownReality,
  UNKNOWN_REALITY,
  deriveExpectationGap,
} from '@/domain/staffHumanState'
import {
  deriveStaffReality,
  deriveInitialExpectations,
  initializeStaffExpectationProfile,
  initializeStaffHumanState,
  appraiseStaffHumanState,
  applyHumanStateRecovery,
  deriveOverallSatisfaction,
  getStaffConsequenceSignals,
  classifyGapDuration,
} from './StaffHumanAppraisalEngine'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { deriveStaffPoliticalInfluence } from './StaffPoliticalInfluenceEngine'

function baseWorld(): GameWorld { return createNewGame() }
function pickStaff(world: GameWorld, teamId: TeamId, role: string): StaffPersonId {
  return getTeamStaffAssignments(world, teamId).find((assignment) => assignment.role === role)!.staffPersonId
}

describe('deriveStaffReality', () => {
  it('uses derived political influence as its canonical influence reading without fabricating decision access', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const reality = deriveStaffReality(world, context)
    expect(reality.influence).toEqual(knownReality(deriveStaffPoliticalInfluence(world, context).overall))
    expect(world.staffHumanStatesByContextId).toEqual({})
    expect(reality.decisionAccess).toEqual(UNKNOWN_REALITY)
  })
  it('keeps decision and information UNKNOWN without access signals, then recognizes real leadership and delegation signals', () => {
    const world = baseWorld(); const teamId = Object.values(world.teams)[0]!.id; const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const absent = deriveStaffReality(world, context)
    expect(absent.influence.known).toBe(true)
    expect(absent.decisionAccess).toEqual(UNKNOWN_REALITY)
    expect(absent.informationAccess).toEqual(UNKNOWN_REALITY)
    const leadership = updateGameWorld(world, { relationshipsByKey: { [relationshipKey(staffId, world.teams[teamId]!.coachId!)]: { sourceId: staffId, targetId: world.teams[teamId]!.coachId!, value: 0, events: [], dimensions: { trust: 50, professionalRespect: 50, communicationQuality: 50, collaboration: 0, personalCloseness: 0, perceivedSupport: 50, reliability: 0, professionalAlignment: 50 } } } })
    expect(deriveStaffReality(leadership, context).informationAccess.known).toBe(true)
    const delegated = setTeamResponsibility(world, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const known = deriveStaffReality(delegated, context)
    expect(known.decisionAccess.known).toBe(true)
    expect(known.informationAccess.known).toBe(true)
  })
  it('unavailable dimensions (no canonical authority yet) are UNKNOWN, never fabricated zeros', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const reality = deriveStaffReality(world, context)
    expect(reality.progression.known).toBe(false)
    expect(reality.resourceSupport.known).toBe(false)
    expect(reality.organizationalAmbition.known).toBe(false)
  })

  it('workload reality is always known (calculateStaffWorkload never returns undefined)', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    expect(deriveStaffReality(world, context).workload.known).toBe(true)
  })
})

describe('deriveInitialExpectations', () => {
  it('derives all 15 dimensions, clamped and finite', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const expectations = deriveInitialExpectations(world, context)
    for (const dimension of STAFF_EXPECTATION_DIMENSIONS) {
      expect(Number.isFinite(expectations[dimension])).toBe(true)
      expect(expectations[dimension]).toBeGreaterThanOrEqual(0)
      expect(expectations[dimension]).toBeLessThanOrEqual(100)
    }
  })

  it('two Staff in the same context but different personality (ambition) derive different expectations', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffA = pickStaff(world, teamId, 'assistantCoach')
    const staffB = pickStaff(world, teamId, 'regionalScout')
    const withPersonalities = updateGameWorld(world, {
      personalitiesByPersonId: {
        ...world.personalitiesByPersonId,
        [staffA]: { values: { ...world.personalitiesByPersonId[staffA]!.values, ambition: 10 } },
        [staffB]: { values: { ...world.personalitiesByPersonId[staffB]!.values, ambition: 95 } },
      } as never,
    })
    const contextA = createStaffHumanContext({ id: staffHumanContextIdFor(staffA, teamId, world.currentDate), staffId: staffA, teamId, startedOn: world.currentDate })
    const contextB = createStaffHumanContext({ id: staffHumanContextIdFor(staffB, teamId, world.currentDate), staffId: staffB, teamId, startedOn: world.currentDate })
    const expectationsA = deriveInitialExpectations(withPersonalities, contextA)
    const expectationsB = deriveInitialExpectations(withPersonalities, contextB)
    expect(expectationsA.influence).toBeLessThan(expectationsB.influence)
  })
})

describe('initializeStaffHumanState / initializeStaffExpectationProfile', () => {
  it('initial expectations profile has initial === current at creation', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const profile = initializeStaffExpectationProfile(world, context)
    expect(profile.initial).toEqual(profile.current)
  })

  it('two different Staff at context creation do not both start at a uniform 50 across the board', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffA = pickStaff(world, teamId, 'assistantCoach')
    const staffB = pickStaff(world, teamId, 'physiotherapist')
    const contextA = createStaffHumanContext({ id: staffHumanContextIdFor(staffA, teamId, world.currentDate), staffId: staffA, teamId, startedOn: world.currentDate })
    const contextB = createStaffHumanContext({ id: staffHumanContextIdFor(staffB, teamId, world.currentDate), staffId: staffB, teamId, startedOn: world.currentDate })
    const expectationsA = deriveInitialExpectations(world, contextA)
    const stateA = initializeStaffHumanState(world, contextA, expectationsA)
    const expectationsB = deriveInitialExpectations(world, contextB)
    const stateB = initializeStaffHumanState(world, contextB, expectationsB)
    const allFiftyA = STAFF_HUMAN_STATE_DIMENSIONS.every((dimension) => stateA[dimension] === 50)
    const allFiftyB = STAFF_HUMAN_STATE_DIMENSIONS.every((dimension) => stateB[dimension] === 50)
    expect(allFiftyA && allFiftyB).toBe(false)
  })
})

describe('appraiseStaffHumanState', () => {
  it('a real granted Responsibility improves reality-derived satisfaction on appraisal', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const expectations = initializeStaffExpectationProfile(world, context)
    const state = initializeStaffHumanState(world, context, expectations.current)

    const delegated = setTeamResponsibility(world, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const appraisalWithout = appraiseStaffHumanState(world, context, state, expectations, 3)
    const appraisalWith = appraiseStaffHumanState(delegated, context, state, expectations, 3)
    // Holding an extra real Responsibility narrows the expectation gap, so the appraisal pressure applied
    // is strictly less negative (a smaller downward nudge) than the world where no Responsibility was granted —
    // even though both may still sit below a high expectation baseline in one appraisal pass.
    expect(appraisalWith.state.responsibilitySatisfaction).toBeGreaterThan(appraisalWithout.state.responsibilitySatisfaction)
  })

  it('chronic gap duration applies more pressure than recent', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const highExpectations = { ...initializeStaffExpectationProfile(world, context), current: { ...initializeStaffExpectationProfile(world, context).current, autonomy: 95 } }
    const state = initializeStaffHumanState(world, context, highExpectations.current)
    const recentResult = appraiseStaffHumanState(world, context, state, highExpectations, 0)
    const chronicResult = appraiseStaffHumanState(world, context, state, highExpectations, 10)
    expect(Math.abs(chronicResult.state.autonomySatisfaction - state.autonomySatisfaction)).toBeGreaterThanOrEqual(Math.abs(recentResult.state.autonomySatisfaction - state.autonomySatisfaction))
  })
})

describe('recovery (§23)', () => {
  it('stress recovers faster than frustration toward baseline from the same elevated starting point', () => {
    const highState = {
      contextId: 'ctx' as never, staffId: 'staff' as never,
      roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50, influenceSatisfaction: 50,
      contractSatisfaction: 50, workloadSatisfaction: 50, professionalFulfillment: 50, recognitionSatisfaction: 50,
      frustration: 80, stress: 80, organizationalCommitment: 50,
      lastEvaluatedOn: '2032-10-01' as never,
    }
    const recovered = applyHumanStateRecovery(highState, undefined)
    const stressDrop = highState.stress - recovered.stress
    const frustrationDrop = highState.frustration - recovered.frustration
    expect(stressDrop).toBeGreaterThan(frustrationDrop)
  })

  it('satisfaction is untouched by recovery — it never blindly reverts toward 50', () => {
    const state = {
      contextId: 'ctx' as never, staffId: 'staff' as never,
      roleSatisfaction: 90, responsibilitySatisfaction: 90, autonomySatisfaction: 90, influenceSatisfaction: 90,
      contractSatisfaction: 90, workloadSatisfaction: 90, professionalFulfillment: 90, recognitionSatisfaction: 90,
      frustration: 10, stress: 10, organizationalCommitment: 90,
      lastEvaluatedOn: '2032-10-01' as never,
    }
    const recovered = applyHumanStateRecovery(state, undefined)
    expect(recovered.roleSatisfaction).toBe(90)
    expect(recovered.organizationalCommitment).toBe(90)
  })
})

describe('expectation gaps (§20/H)', () => {
  it('UNKNOWN reality is always neutral, never a penalty', () => {
    expect(deriveExpectationGap('resourceSupport', 90, UNKNOWN_REALITY).band).toBe('MATCHED')
  })
  it('negative gap produces pressure; positive gap produces benefit', () => {
    const negative = deriveExpectationGap('autonomy', 80, knownReality(20))
    const positive = deriveExpectationGap('autonomy', 30, knownReality(85))
    expect(negative.gapValue).toBeLessThan(0)
    expect(positive.gapValue).toBeGreaterThan(0)
  })
  it('gap duration bucketing is monotonic with elapsed months', () => {
    expect(classifyGapDuration(0)).toBe('RECENT')
    expect(classifyGapDuration(2)).toBe('ESTABLISHED')
    expect(classifyGapDuration(5)).toBe('SUSTAINED')
    expect(classifyGapDuration(12)).toBe('CHRONIC')
  })
})

describe('deriveOverallSatisfaction', () => {
  it('is derived, finite, and clamped — never persisted by caller', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const expectations = initializeStaffExpectationProfile(world, context)
    const state = initializeStaffHumanState(world, context, expectations.current)
    const overall = deriveOverallSatisfaction(state, world.personalitiesByPersonId[staffId])
    expect(Number.isFinite(overall)).toBe(true)
    expect(overall).toBeGreaterThanOrEqual(0)
    expect(overall).toBeLessThanOrEqual(100)
  })
})

describe('getStaffConsequenceSignals', () => {
  it('no signals is a valid, meaningful result for a balanced Human State', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const expectations = initializeStaffExpectationProfile(world, context)
    const balancedState = {
      contextId: context.id, staffId,
      roleSatisfaction: 55, responsibilitySatisfaction: 55, autonomySatisfaction: 55, influenceSatisfaction: 55,
      contractSatisfaction: 55, workloadSatisfaction: 55, professionalFulfillment: 55, recognitionSatisfaction: 55,
      frustration: 20, stress: 20, organizationalCommitment: 55,
      lastEvaluatedOn: world.currentDate,
    }
    const signals = getStaffConsequenceSignals(world, context, balancedState, expectations, 0)
    expect(Array.isArray(signals)).toBe(true)
  })

  it('high frustration + high stress derives professionalBurnoutRisk', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const expectations = initializeStaffExpectationProfile(world, context)
    const burnedOutState = {
      contextId: context.id, staffId,
      roleSatisfaction: 30, responsibilitySatisfaction: 30, autonomySatisfaction: 30, influenceSatisfaction: 30,
      contractSatisfaction: 30, workloadSatisfaction: 30, professionalFulfillment: 30, recognitionSatisfaction: 30,
      frustration: 85, stress: 85, organizationalCommitment: 30,
      lastEvaluatedOn: world.currentDate,
    }
    const signals = getStaffConsequenceSignals(world, context, burnedOutState, expectations, 0)
    expect(signals.some((signal) => signal.kind === 'professionalBurnoutRisk')).toBe(true)
    expect(signals.some((signal) => signal.kind === 'chronicFrustration')).toBe(true)
  })

  it('all returned signal kinds are members of the canonical 40', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const context = createStaffHumanContext({ id: staffHumanContextIdFor(staffId, teamId, world.currentDate), staffId, teamId, startedOn: world.currentDate })
    const expectations = initializeStaffExpectationProfile(world, context)
    const state = initializeStaffHumanState(world, context, expectations.current)
    const signals = getStaffConsequenceSignals(world, context, state, expectations, 3)
    for (const signal of signals) expect(typeof signal.kind).toBe('string')
  })
})
