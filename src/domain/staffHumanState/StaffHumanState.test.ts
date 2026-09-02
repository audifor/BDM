import { describe, expect, it } from 'vitest'
import { createGameDate } from '@/domain/date'
import { staffPersonIdFromString, teamIdFromString } from '@/domain/ids'
import {
  STAFF_HUMAN_STATE_DIMENSIONS,
  STAFF_EXPECTATION_DIMENSIONS,
  STAFF_HUMAN_EVENT_KINDS,
  clampHumanStateValue,
  createStaffHumanContext,
  createStaffHumanState,
  createStaffExpectationProfile,
  createStaffHumanEvent,
  createStaffReactionRecord,
  staffHumanContextIdFor,
  staffReactionRecordIdFor,
  deriveExpectationGap,
  deriveCareerStage,
  classifyWorkloadBand,
  knownReality,
  UNKNOWN_REALITY,
} from './StaffHumanState'
import { STAFF_CONSEQUENCE_SIGNAL_KINDS } from './StaffConsequenceSignals'
import { STAFF_REACTION_REGISTRY, IMPORTANCE_SCALING, reactionDefinitionFor } from './StaffReactionDefinitions'

const staffId = staffPersonIdFromString('staff-1')
const teamId = teamIdFromString('team-1')
const contextId = staffHumanContextIdFor(staffId, teamId, createGameDate(2032, 9, 1))

function baseHumanState() {
  return {
    contextId, staffId,
    roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50, influenceSatisfaction: 50,
    contractSatisfaction: 50, workloadSatisfaction: 50, professionalFulfillment: 50, recognitionSatisfaction: 50,
    frustration: 20, stress: 20, organizationalCommitment: 50,
    lastEvaluatedOn: createGameDate(2032, 9, 1),
  }
}

describe('contract/model — exact catalogue sizes', () => {
  it('exactly 11 Human State dimensions', () => { expect(STAFF_HUMAN_STATE_DIMENSIONS).toHaveLength(11) })
  it('exactly 15 Expectation dimensions', () => { expect(STAFF_EXPECTATION_DIMENSIONS).toHaveLength(15) })
  it('exactly 30 Event kinds', () => { expect(STAFF_HUMAN_EVENT_KINDS).toHaveLength(30) })
  it('exactly 40 Consequence Signal kinds', () => { expect(STAFF_CONSEQUENCE_SIGNAL_KINDS).toHaveLength(40) })
  it('every Event kind has a Reaction Definition', () => { for (const kind of STAFF_HUMAN_EVENT_KINDS) expect(() => reactionDefinitionFor(kind)).not.toThrow() })
  it('STAFF_REACTION_REGISTRY has exactly one entry per Event kind, no extras', () => { expect(Object.keys(STAFF_REACTION_REGISTRY)).toHaveLength(30) })
})

describe('numerical safety', () => {
  it('clamps out-of-range values to 0..100', () => {
    expect(clampHumanStateValue(150)).toBe(100)
    expect(clampHumanStateValue(-50)).toBe(0)
  })
  it('NaN/Infinity never survive clamping', () => {
    expect(clampHumanStateValue(NaN)).toBe(50)
    expect(clampHumanStateValue(Infinity)).toBe(50)
    expect(clampHumanStateValue(-Infinity)).toBe(50)
  })
  it('createStaffHumanState clamps every dimension and is always finite', () => {
    const state = createStaffHumanState({ ...baseHumanState(), frustration: 999, stress: -999 })
    for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) {
      expect(Number.isFinite(state[dimension])).toBe(true)
      expect(state[dimension]).toBeGreaterThanOrEqual(0)
      expect(state[dimension]).toBeLessThanOrEqual(100)
    }
  })
})

describe('determinism', () => {
  it('staffHumanContextIdFor is deterministic for the same inputs', () => {
    const a = staffHumanContextIdFor(staffId, teamId, createGameDate(2032, 9, 1))
    const b = staffHumanContextIdFor(staffId, teamId, createGameDate(2032, 9, 1))
    expect(a).toBe(b)
  })
  it('staffReactionRecordIdFor is deterministic for the same inputs', () => {
    const a = staffReactionRecordIdFor(staffId, contextId, 'source-1', 'responsibilityGranted')
    const b = staffReactionRecordIdFor(staffId, contextId, 'source-1', 'responsibilityGranted')
    expect(a).toBe(b)
  })
})

describe('importance scaling (§12)', () => {
  it('ROUTINE < MEANINGFUL < IMPORTANT < CRITICAL', () => {
    expect(IMPORTANCE_SCALING.ROUTINE).toBeLessThan(IMPORTANCE_SCALING.MEANINGFUL)
    expect(IMPORTANCE_SCALING.MEANINGFUL).toBeLessThan(IMPORTANCE_SCALING.IMPORTANT)
    expect(IMPORTANCE_SCALING.IMPORTANT).toBeLessThan(IMPORTANCE_SCALING.CRITICAL)
  })
  it('CRITICAL weighs sensibly more than IMPORTANT (at least 1.3x)', () => {
    expect(IMPORTANCE_SCALING.CRITICAL / IMPORTANCE_SCALING.IMPORTANT).toBeGreaterThan(1.3)
  })
  it('ROUTINE has limited effect (below MEANINGFUL baseline)', () => {
    expect(IMPORTANCE_SCALING.ROUTINE).toBeLessThan(1)
  })
})

describe('expectation gaps', () => {
  it('UNKNOWN reality is always neutral/MATCHED, never a penalty', () => {
    const gap = deriveExpectationGap('resourceSupport', 80, UNKNOWN_REALITY)
    expect(gap.band).toBe('MATCHED')
    expect(gap.gapValue).toBe(0)
  })
  it('negative gap (reality well below expectation) yields a BELOW/STRONGLY_BELOW band', () => {
    const gap = deriveExpectationGap('autonomy', 80, knownReality(25))
    expect(['BELOW', 'STRONGLY_BELOW']).toContain(gap.band)
    expect(gap.gapValue).toBeLessThan(0)
  })
  it('positive gap (reality above expectation) yields an ABOVE/STRONGLY_ABOVE band', () => {
    const gap = deriveExpectationGap('workload', 40, knownReality(85))
    expect(['ABOVE', 'STRONGLY_ABOVE']).toContain(gap.band)
    expect(gap.gapValue).toBeGreaterThan(0)
  })
  it('a small gap is MATCHED', () => {
    const gap = deriveExpectationGap('recognition', 50, knownReality(55))
    expect(gap.band).toBe('MATCHED')
  })
})

describe('career stage derivation', () => {
  it('unknown age derives the neutral PRIME stage, never a guess-penalty', () => {
    expect(deriveCareerStage(undefined)).toBe('PRIME')
  })
  it('young age derives EARLY', () => { expect(deriveCareerStage(26)).toBe('EARLY') })
  it('old age derives LATE_CAREER', () => { expect(deriveCareerStage(62)).toBe('LATE_CAREER') })
})

describe('workload bands', () => {
  it('classifies the canonical bands from utilization', () => {
    expect(classifyWorkloadBand(0.2)).toBe('UNDERUTILIZED')
    expect(classifyWorkloadBand(0.7)).toBe('HEALTHY')
    expect(classifyWorkloadBand(0.95)).toBe('HEAVY')
    expect(classifyWorkloadBand(1.4)).toBe('OVERLOADED')
  })
  it('Infinity utilization (unassigned + held responsibilities) classifies as OVERLOADED, never crashes', () => {
    expect(classifyWorkloadBand(Infinity)).toBe('OVERLOADED')
  })
})

describe('StaffHumanContext / StaffHumanState / StaffExpectationProfile / StaffHumanEvent / StaffReactionRecord construction', () => {
  it('creates a valid context', () => {
    const context = createStaffHumanContext({ id: contextId, staffId, teamId, startedOn: createGameDate(2032, 9, 1) })
    expect(context.staffId).toBe(staffId)
    expect(context.endedOn).toBeUndefined()
  })
  it('creates a valid human state', () => {
    const state = createStaffHumanState(baseHumanState())
    expect(state.roleSatisfaction).toBe(50)
  })
  it('creates a valid expectation profile with initial/current independently tracked', () => {
    const values = Object.fromEntries(STAFF_EXPECTATION_DIMENSIONS.map((d) => [d, 60])) as never
    const profile = createStaffExpectationProfile({ contextId, staffId, initial: values, current: values, establishedOn: createGameDate(2032, 9, 1), lastAdjustedOn: createGameDate(2032, 9, 1) })
    expect(profile.initial.autonomy).toBe(60)
    expect(profile.current.autonomy).toBe(60)
  })
  it('creates a valid human event', () => {
    const event = createStaffHumanEvent({ id: 'event-1', kind: 'responsibilityGranted', staffId, contextId, occurredOn: createGameDate(2032, 9, 1), importance: 'MEANINGFUL', sourceEventId: 'responsibility:team-1:oppositionScouting', attribution: { actorKind: 'USER_COACH', actorId: 'coach-1' }, payload: {} })
    expect(event.kind).toBe('responsibilityGranted')
  })
  it('rejects an unknown event kind', () => {
    expect(() => createStaffHumanEvent({ id: 'event-2', kind: 'notAKind' as never, staffId, contextId, occurredOn: createGameDate(2032, 9, 1), importance: 'MEANINGFUL', sourceEventId: 'x', attribution: { actorKind: 'SELF' }, payload: {} })).toThrow(RangeError)
  })
  it('creates a valid reaction record', () => {
    const record = createStaffReactionRecord({ id: staffReactionRecordIdFor(staffId, contextId, 'source-1', 'responsibilityGranted'), staffId, contextId, sourceEventId: 'source-1', eventKind: 'responsibilityGranted', importance: 'MEANINGFUL', occurredOn: createGameDate(2032, 9, 1), stateDelta: { responsibilitySatisfaction: 6 }, attribution: { actorKind: 'USER_COACH', actorId: 'coach-1' } })
    expect(record.stateDelta.responsibilitySatisfaction).toBe(6)
  })
})
