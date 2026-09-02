import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { staffRoleDefinition, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { relationshipKey, RELATIONSHIP_DIMENSION_KEYS, type RelationshipDimensions } from '@/domain/relationships'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import {
  createStaffUnitCohesionState,
  neutralUnitCohesionValues,
  STAFF_UNIT_COHESION_DIMENSIONS,
  type StaffUnitRuntimeView,
} from '@/domain/staffUnitCohesion'

import {
  buildStaffUnitRuntimeViews,
  deriveStaffUnitCohesionTarget,
  initializeStaffUnitCohesionState,
  progressStaffUnitCohesionState,
} from './StaffUnitCohesionEngine'

function userTeamId(world: GameWorld): TeamId {
  const team = getUserTeam(world)
  if (team === undefined) throw new Error('Expected a user team fixture')
  return team.id
}

const FLAT_ATTRIBUTES = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<string, number>

function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, suffix: string): { readonly world: GameWorld; readonly staffId: StaffPersonId } {
  const staffId = staffPersonIdFromString(`cohesion-test-staff-${suffix}`)
  const next = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Coh', lastName: suffix }, professional: { attributes: FLAT_ATTRIBUTES } } as never],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`cohesion-test-assignment-${suffix}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
  })
  return { world: next, staffId }
}

function dimensions(value: number): RelationshipDimensions {
  return Object.fromEntries(RELATIONSHIP_DIMENSION_KEYS.map((key) => [key, value])) as RelationshipDimensions
}

/** Writes a directional profile with explicit facet values straight into the sparse relationship store. */
function withRelationship(world: GameWorld, sourceId: string, targetId: string, value: number): GameWorld {
  return updateGameWorld(world, {
    relationshipsByKey: {
      ...world.relationshipsByKey,
      [relationshipKey(sourceId, targetId)]: { sourceId, targetId, value: 0, events: [], dimensions: dimensions(value) },
    },
  })
}

function viewFor(world: GameWorld, teamId: TeamId, department: string): StaffUnitRuntimeView {
  const view = buildStaffUnitRuntimeViews(world, teamId).find((item) => item.department === department)
  if (view === undefined) throw new Error(`Expected a ${department} unit`)
  return view
}

describe('buildStaffUnitRuntimeViews', () => {
  it('groups the Team assignments into one view per department that has at least one member', () => {
    const world = createNewGame()
    const teamId = userTeamId(world)
    const views = buildStaffUnitRuntimeViews(world, teamId)
    expect(views.length).toBeGreaterThan(0)

    const assignedDepartments = new Set(getTeamStaffAssignments(world, teamId).map((item) => staffRoleDefinition(item.role).department))
    expect(new Set(views.map((view) => view.department))).toEqual(assignedDepartments)
    for (const view of views) {
      expect(view.memberStaffIds.length).toBeGreaterThan(0)
      expect(view.unitKey).toBe(`${teamId}:${view.department}`)
    }
  })

  it('produces NO row for a department with no members', () => {
    const world = createNewGame()
    const teamId = userTeamId(world)
    const views = buildStaffUnitRuntimeViews(world, teamId)
    // recruiting roles are ncaaLike-gated and unassigned in the default fixture.
    const emptyDepartments = ['coaching', 'performance', 'medical', 'scouting', 'basketballOperations', 'recruiting']
      .filter((department) => !getTeamStaffAssignments(world, teamId).some((item) => staffRoleDefinition(item.role).department === department))
    for (const department of emptyDepartments) expect(views.some((view) => view.department === department)).toBe(false)
  })

  it('returns nothing for a team with no staff at all, without crashing', () => {
    const world = createNewGame()
    expect(buildStaffUnitRuntimeViews(world, 'not-a-real-team' as TeamId)).toEqual([])
  })

  it('derives the leader as the highest-seniority member, tie-broken by lowest staff id', () => {
    const base = createNewGame()
    const teamId = userTeamId(base)
    // Two same-seniority juniors in a fresh department + one director: the director must win.
    let world = withStaffInRole(base, teamId, 'loadManagementSpecialist', 'perf-b').world
    world = withStaffInRole(world, teamId, 'developmentSpecialist', 'perf-a').world
    const performance = viewFor(world, teamId, 'performance')
    expect(performance.leaderStaffId).toBeDefined()

    // Tie-break: both members junior, so the lexicographically-lowest staff id leads.
    const juniors = performance.memberStaffIds.filter((staffId) => {
      const assignment = getTeamStaffAssignments(world, teamId).find((item) => item.staffPersonId === staffId)!
      return staffRoleDefinition(assignment.role).seniority === 'junior'
    })
    const leaderAssignment = getTeamStaffAssignments(world, teamId).find((item) => item.staffPersonId === performance.leaderStaffId)!
    if (staffRoleDefinition(leaderAssignment.role).seniority === 'junior') {
      expect(performance.leaderStaffId).toBe([...juniors].sort((a, b) => a.localeCompare(b))[0])
    }
  })

  it('handles a single-member unit', () => {
    const base = createNewGame()
    const teamId = userTeamId(base)
    const { world } = withStaffInRole(base, teamId, 'recruitingCoordinator', 'solo')
    const recruiting = viewFor(world, teamId, 'recruiting')
    expect(recruiting.memberStaffIds).toHaveLength(1)
    expect(recruiting.leaderStaffId).toBe(recruiting.memberStaffIds[0])
    // No pairs are possible, so cohesion is exactly neutral.
    expect(deriveStaffUnitCohesionTarget(world, recruiting)).toEqual(neutralUnitCohesionValues())
  })
})

describe('deriveStaffUnitCohesionTarget', () => {
  it('with zero relationship data reads exactly neutral 50 across all 8 dimensions', () => {
    const world = createNewGame()
    const view = buildStaffUnitRuntimeViews(world, userTeamId(world))[0]!
    expect(deriveStaffUnitCohesionTarget(world, view)).toEqual(neutralUnitCohesionValues())
  })

  it('sparse data in a larger unit produces a real but coverage-dampened result, never a crash', () => {
    const base = createNewGame()
    const teamId = userTeamId(base)
    const view = buildStaffUnitRuntimeViews(base, teamId).find((item) => item.memberStaffIds.length >= 4)
    if (view === undefined) return

    // A single very positive pair out of many possible pairs.
    const world = withRelationship(base, view.memberStaffIds[0]!, view.memberStaffIds[1]!, 100)
    const target = deriveStaffUnitCohesionTarget(world, viewFor(world, teamId, view.department))
    // Real movement above neutral...
    expect(target.cohesionTrust).toBeGreaterThan(50)
    // ...but nowhere near the extreme, because coverage is tiny.
    expect(target.cohesionTrust).toBeLessThan(70)
  })

  it('one extreme outlier pair in a 4+ member unit does not drag the aggregate to the extreme', () => {
    const base = createNewGame()
    const teamId = userTeamId(base)
    const view = buildStaffUnitRuntimeViews(base, teamId).find((item) => item.memberStaffIds.length >= 4)
    if (view === undefined) return
    const [a, b, c, d] = view.memberStaffIds

    // Three mildly positive pairs plus one catastrophic outlier.
    let world = withRelationship(base, a!, b!, 20)
    world = withRelationship(world, b!, c!, 20)
    world = withRelationship(world, c!, d!, 20)
    const withoutOutlier = deriveStaffUnitCohesionTarget(world, viewFor(world, teamId, view.department))
    world = withRelationship(world, a!, d!, -100)
    const withOutlier = deriveStaffUnitCohesionTarget(world, viewFor(world, teamId, view.department))

    // The outlier is trimmed away, so it must not halve the reading the way an unweighted mean would.
    const unweightedDrop = (withoutOutlier.cohesionTrust - 50) / 2
    expect(withOutlier.cohesionTrust).toBeGreaterThan(50)
    expect(withOutlier.cohesionTrust - 50).toBeGreaterThan(unweightedDrop)
  })

  it('leadershipCohesion degrades to the unit-wide reading when the leader has no relationship data', () => {
    const base = createNewGame()
    const teamId = userTeamId(base)
    const view = buildStaffUnitRuntimeViews(base, teamId).find((item) => item.memberStaffIds.length >= 3 && item.leaderStaffId !== undefined)
    if (view === undefined) return
    const others = view.memberStaffIds.filter((staffId) => staffId !== view.leaderStaffId)
    const world = withRelationship(base, others[0]!, others[1]!, 60)
    const target = deriveStaffUnitCohesionTarget(world, viewFor(world, teamId, view.department))
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) {
      expect(Number.isFinite(target[dimension])).toBe(true)
      expect(target[dimension]).toBeGreaterThanOrEqual(0)
      expect(target[dimension]).toBeLessThanOrEqual(100)
    }
  })
})

describe('progressStaffUnitCohesionState', () => {
  it('moves current toward target faster than Culture but never past it', () => {
    const world = createNewGame()
    const low = Object.fromEntries(STAFF_UNIT_COHESION_DIMENSIONS.map((dimension) => [dimension, 10])) as never
    const high = Object.fromEntries(STAFF_UNIT_COHESION_DIMENSIONS.map((dimension) => [dimension, 90])) as never
    let state = createStaffUnitCohesionState({ unitKey: 'team:coaching', target: high, current: low, lastEvaluatedOn: world.currentDate })

    state = progressStaffUnitCohesionState(state, high, world.currentDate)
    expect(state.current.cohesionTrust).toBeGreaterThan(15)
    expect(state.current.cohesionTrust).toBeLessThan(30)

    for (let index = 0; index < 60; index += 1) state = progressStaffUnitCohesionState(state, high, world.currentDate)
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) expect(state.current[dimension]).toBeLessThanOrEqual(90)
  })
})

describe('initializeStaffUnitCohesionState', () => {
  it('starts current exactly at target', () => {
    const world = createNewGame()
    const view = buildStaffUnitRuntimeViews(world, userTeamId(world))[0]!
    const state = initializeStaffUnitCohesionState(world, view)
    expect(state.current).toEqual(state.target)
    expect(state.unitKey).toBe(view.unitKey)
  })
})
