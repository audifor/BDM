import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { staffRoleDefinition, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import { STAFF_CULTURE_DIMENSIONS, createStaffCultureState, neutralCultureValues } from '@/domain/staffCulture'

import {
  applyCultureFitPressure,
  calculateStaffCultureFit,
  CULTURE_FIT_PRESSURE_CLAMP,
  deriveStaffCulturePreferences,
  deriveStaffCultureTarget,
  initializeStaffCultureState,
  progressStaffCultureState,
  seniorityWeight,
} from './StaffCultureEngine'

function userTeamId(world: GameWorld): TeamId {
  const team = getUserTeam(world)
  if (team === undefined) throw new Error('Expected a user team fixture')
  return team.id
}

/** Rewrites one Staff person's Personality wholesale — the canonical override seam used by the other Wave 5 engine tests. */
function withPersonality(world: GameWorld, staffId: StaffPersonId, overrides: Readonly<Record<string, number>>): GameWorld {
  const current = world.personalitiesByPersonId[staffId]!
  return { ...world, personalitiesByPersonId: { ...world.personalitiesByPersonId, [staffId]: { values: { ...current.values, ...overrides } } } } as GameWorld
}

const FLAT_ATTRIBUTES = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<string, number>

/** Adds one Staff person in an explicit role to the team, so seniority can be controlled precisely. */
function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, suffix: string): { readonly world: GameWorld; readonly staffId: StaffPersonId } {
  const staffId = staffPersonIdFromString(`culture-test-staff-${suffix}`)
  const next = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Cul', lastName: suffix }, professional: { attributes: FLAT_ATTRIBUTES } } as never],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`culture-test-assignment-${suffix}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  return { world: next, staffId }
}

describe('deriveStaffCultureTarget', () => {
  it('produces a value in 0-100 for all 14 dimensions from a real fixture team', () => {
    const world = createNewGame()
    const target = deriveStaffCultureTarget(world, userTeamId(world) as string)
    for (const dimension of STAFF_CULTURE_DIMENSIONS) {
      expect(Number.isInteger(target[dimension])).toBe(true)
      expect(target[dimension]).toBeGreaterThanOrEqual(0)
      expect(target[dimension]).toBeLessThanOrEqual(100)
    }
  })

  it('degrades an organization with no Staff at all to neutral 50, never NaN or a crash', () => {
    const world = createNewGame()
    expect(deriveStaffCultureTarget(world, 'not-a-real-team')).toEqual(neutralCultureValues())
  })

  it('is deterministic — the same world always derives the same target', () => {
    const world = createNewGame()
    const scopeKey = userTeamId(world) as string
    expect(deriveStaffCultureTarget(world, scopeKey)).toEqual(deriveStaffCultureTarget(world, scopeKey))
  })

  it('is leadership-weighted: the same extreme personality moves the target further from a director than from a junior', () => {
    expect(seniorityWeight('director')).toBeGreaterThan(seniorityWeight('junior'))
    const base = createNewGame()
    const teamId = userTeamId(base)

    // Two scenarios differing ONLY in whether the loud personality belongs to a director or a junior.
    const asDirector = withStaffInRole(base, teamId, 'generalManager', 'director')
    const asJunior = withStaffInRole(base, teamId, 'shootingCoach', 'junior')
    expect(staffRoleDefinition('generalManager').seniority).toBe('director')
    expect(staffRoleDefinition('shootingCoach').seniority).toBe('junior')

    const loud = { competitiveness: 100, ambition: 100 }
    const directorBaseline = deriveStaffCultureTarget(asDirector.world, teamId as string)
    const juniorBaseline = deriveStaffCultureTarget(asJunior.world, teamId as string)
    const withLoudDirector = deriveStaffCultureTarget(withPersonality(asDirector.world, asDirector.staffId, loud), teamId as string)
    const withLoudJunior = deriveStaffCultureTarget(withPersonality(asJunior.world, asJunior.staffId, loud), teamId as string)

    const directorShift = Math.abs(withLoudDirector.competitiveness - directorBaseline.competitiveness)
    const juniorShift = Math.abs(withLoudJunior.competitiveness - juniorBaseline.competitiveness)
    expect(directorShift).toBeGreaterThan(juniorShift)
  })
})

describe('progressStaffCultureState', () => {
  it('moves current toward target slowly and never past it', () => {
    const world = createNewGame()
    const scopeKey = userTeamId(world) as string
    const low = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, 10])) as never
    const high = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, 90])) as never
    let state = createStaffCultureState({ scopeKey, target: high, current: low, lastEvaluatedOn: world.currentDate })

    const first = progressStaffCultureState(state, high, world.currentDate)
    expect(first.current.innovation).toBeGreaterThan(10)
    expect(first.current.innovation).toBeLessThan(30)
    expect(first.target).toEqual(high)

    state = first
    for (let index = 0; index < 40; index += 1) state = progressStaffCultureState(state, high, world.currentDate)
    for (const dimension of STAFF_CULTURE_DIMENSIONS) expect(state.current[dimension]).toBeLessThanOrEqual(90)
  })

  it('replaces target with the freshly-passed target and bumps lastEvaluatedOn', () => {
    const world = createNewGame()
    const values = neutralCultureValues()
    const state = createStaffCultureState({ scopeKey: 'scope', target: values, current: values, lastEvaluatedOn: world.currentDate })
    const next = progressStaffCultureState(state, { ...values, innovation: 90 }, '2031-05-05' as never)
    expect(next.target.innovation).toBe(90)
    expect(next.lastEvaluatedOn).toBe('2031-05-05')
  })
})

describe('deriveStaffCulturePreferences / calculateStaffCultureFit', () => {
  it('produces 14 in-range dimensions and is never persisted onto the world', () => {
    const world = createNewGame()
    const staffId = getTeamStaffAssignments(world, userTeamId(world))[0]!.staffPersonId
    const preferences = deriveStaffCulturePreferences(world, staffId)
    for (const dimension of STAFF_CULTURE_DIMENSIONS) {
      expect(preferences[dimension]).toBeGreaterThanOrEqual(0)
      expect(preferences[dimension]).toBeLessThanOrEqual(100)
    }
    expect(Object.keys(world.staffCultureStatesByScopeKey)).toHaveLength(0)
  })

  it('scores a culture matching the person preferences as high fit', () => {
    const world = createNewGame()
    const staffId = getTeamStaffAssignments(world, userTeamId(world))[0]!.staffPersonId
    const preferences = deriveStaffCulturePreferences(world, staffId)
    const matched = createStaffCultureState({ scopeKey: 'scope', target: preferences, current: preferences, lastEvaluatedOn: world.currentDate })
    expect(calculateStaffCultureFit(world, staffId, matched).fitScore).toBe(100)
  })

  it('scores an inverted culture as low fit', () => {
    const world = createNewGame()
    const staffId = getTeamStaffAssignments(world, userTeamId(world))[0]!.staffPersonId
    // Push the person to strong convictions so extremity-weighting has something to weigh.
    const opinionated = withPersonality(world, staffId, { competitiveness: 95, ambition: 95, teamOrientation: 95, professionalism: 95, adaptability: 95, loyalty: 5 })
    const preferences = deriveStaffCulturePreferences(opinionated, staffId)
    const inverted = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, 100 - preferences[dimension]])) as never
    const mismatch = createStaffCultureState({ scopeKey: 'scope', target: inverted, current: inverted, lastEvaluatedOn: world.currentDate })

    const matched = createStaffCultureState({ scopeKey: 'scope', target: preferences, current: preferences, lastEvaluatedOn: world.currentDate })
    expect(calculateStaffCultureFit(opinionated, staffId, mismatch).fitScore)
      .toBeLessThan(calculateStaffCultureFit(opinionated, staffId, matched).fitScore)
    expect(calculateStaffCultureFit(opinionated, staffId, mismatch).fitScore).toBeLessThan(60)
  })

  it('is extremity-weighted, not a flat average: a dimension the person is neutral on cannot drag the fit down', () => {
    const world = createNewGame()
    const staffId = getTeamStaffAssignments(world, userTeamId(world))[0]!.staffPersonId
    const preferences = deriveStaffCulturePreferences(world, staffId)
    // Find a dimension where the person is close to neutral and make the culture extreme there.
    const neutralDimension = STAFF_CULTURE_DIMENSIONS.find((dimension) => Math.abs(preferences[dimension] - 50) <= 3)
    if (neutralDimension === undefined) return
    const culture = { ...preferences, [neutralDimension]: 100 } as never
    const state = createStaffCultureState({ scopeKey: 'scope', target: culture, current: culture, lastEvaluatedOn: world.currentDate })
    // A flat unweighted average over 14 dimensions would lose ~3.5 points here; extremity-weighting loses far less.
    expect(calculateStaffCultureFit(world, staffId, state).fitScore).toBeGreaterThanOrEqual(98)
  })
})

describe('initializeStaffCultureState', () => {
  it('starts current exactly at target', () => {
    const world = createNewGame()
    const state = initializeStaffCultureState(world, userTeamId(world) as string)
    expect(state.current).toEqual(state.target)
    expect(state.lastEvaluatedOn).toBe(world.currentDate)
  })
})

describe('applyCultureFitPressure', () => {
  function neutralState() {
    return {
      contextId: 'ctx' as never, staffId: 'staff' as never,
      roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50, influenceSatisfaction: 50,
      contractSatisfaction: 50, workloadSatisfaction: 50, professionalFulfillment: 50, recognitionSatisfaction: 50,
      frustration: 50, stress: 50, organizationalCommitment: 50, lastEvaluatedOn: '2030-01-07' as never,
    }
  }

  /** A fit reading where every dimension has the given preference and the given signed gap (lived minus preference). */
  function uniformFit(preference: number, signedGap: number): ReturnType<typeof calculateStaffCultureFit> {
    const preferences = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, preference])) as never
    const signedGapValues = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, signedGap])) as never
    const perDimension = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, Math.abs(signedGap)])) as never
    return { fitScore: 100 - Math.abs(signedGap), preferences, signedGap: signedGapValues, perDimension }
  }

  it('never moves any single Human State dimension by more than the per-dimension clamp in one call', () => {
    const state = neutralState()
    for (const gap of [-40, -10, 0, 10, 40]) {
      const next = applyCultureFitPressure(state, uniformFit(90, gap))
      for (const key of Object.keys(state) as (keyof typeof state)[]) {
        if (typeof state[key] !== 'number') continue
        expect(Math.abs((next[key] as number) - (state[key] as number))).toBeLessThanOrEqual(CULTURE_FIT_PRESSURE_CLAMP)
      }
    }
  })

  it('a perfect match (zero signed gap everywhere) never produces negative pressure', () => {
    const state = neutralState()
    const pressured = applyCultureFitPressure(state, uniformFit(80, 0))
    for (const key of Object.keys(state) as (keyof typeof state)[]) {
      if (typeof state[key] !== 'number') continue
      expect(pressured[key] as number).toBeGreaterThanOrEqual(state[key] as number)
    }
  })

  it('a person indifferent to every dimension (preference exactly 50) is never pressured', () => {
    const state = neutralState()
    expect(applyCultureFitPressure(state, uniformFit(50, 40))).toBe(state)
  })
})
