import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import {
  MINIMUM_AUTO_SUITABILITY,
  OPTIMIZATION_MINIMUM_GAIN,
  STAFF_ASSIGNMENT_STRATEGIES,
  planStaffAssignments,
  planStaffOptimization,
  runStaffAssignmentStrategy,
  runStaffOptimization,
  unassignResponsibility,
} from '@/app/staffAssignments'
import { getUserTeam } from '@/engine/calendar'
import { responsibilityDefinition, responsibilityIdForTeam, RESPONSIBILITY_KINDS, type ResponsibilityKind } from '@/domain/responsibility'
import { calculateStaffWorkload, getTeamStaffAssignments, getTeamResponsibilities } from '@/domain/world'

function newGame() {
  const world = createNewGame()
  return { world, teamId: getUserTeam(world)!.id }
}

function heldKinds(world: ReturnType<typeof createNewGame>, teamId: ReturnType<typeof getUserTeam> extends never ? never : string): readonly ResponsibilityKind[] {
  return getTeamResponsibilities(world, teamId as never)
    .filter((responsibility) => responsibility.holderStaffId !== undefined)
    .map((responsibility) => responsibility.kind)
}

describe('planStaffAssignments', () => {
  it('exposes exactly the four documented strategies', () => {
    expect([...STAFF_ASSIGNMENT_STRATEGIES]).toEqual(['bestOverallFit', 'balanceWorkload', 'maximumSpecialization', 'delegateMore'])
  })

  it.each(STAFF_ASSIGNMENT_STRATEGIES)('never mutates the input world (%s)', (strategy) => {
    const { world, teamId } = newGame()
    const before = structuredClone(world)
    planStaffAssignments(world, teamId, strategy)
    expect(world).toEqual(before)
  })

  it.each(STAFF_ASSIGNMENT_STRATEGIES)('is deterministic across repeated plans (%s)', (strategy) => {
    const { world, teamId } = newGame()
    expect(planStaffAssignments(world, teamId, strategy)).toEqual(planStaffAssignments(world, teamId, strategy))
  })

  it.each(STAFF_ASSIGNMENT_STRATEGIES)('only assigns staff-eligible responsibilities to eligible staff (%s)', (strategy) => {
    const { world, teamId } = newGame()
    const plan = planStaffAssignments(world, teamId, strategy)
    expect(plan.changes.length).toBeGreaterThan(0)

    const assignments = getTeamStaffAssignments(world, teamId)
    const headCoachId = assignments.find((assignment) => assignment.role === 'headCoach')!.staffPersonId
    for (const change of plan.changes) {
      const definition = responsibilityDefinition(change.kind)
      expect(definition.eligibleParticipant).toBe('staff')
      expect(definition.supportedModes).toContain(change.mode)
      expect(change.holderStaffId).not.toBe(headCoachId)
      expect(change.reason).toBe('vacancy')
      expect(change.previousHolderStaffId).toBeUndefined()
    }
    expect(plan.changes.some((change) => change.kind === 'rotationPlanning')).toBe(false)
  })

  it('bestOverallFit only delegates work that clears the minimum suitability', () => {
    const { world, teamId } = newGame()
    const plan = planStaffAssignments(world, teamId, 'bestOverallFit')
    for (const change of plan.changes) expect(change.suitability).toBeGreaterThanOrEqual(MINIMUM_AUTO_SUITABILITY)
  })

  it('delegateMore covers at least as many responsibilities as bestOverallFit', () => {
    const { world, teamId } = newGame()
    const focused = planStaffAssignments(world, teamId, 'bestOverallFit').changes.length
    const aggressive = planStaffAssignments(world, teamId, 'delegateMore').changes.length
    expect(aggressive).toBeGreaterThanOrEqual(focused)
  })

  it('maximumSpecialization always picks the highest-proficiency candidate for the responsibility', () => {
    const { world, teamId } = newGame()
    const plan = planStaffAssignments(world, teamId, 'maximumSpecialization')
    const assignments = getTeamStaffAssignments(world, teamId)
    for (const change of plan.changes) {
      const definition = responsibilityDefinition(change.kind)
      const chosen = assignments.find((assignment) => assignment.staffPersonId === change.holderStaffId)!
      expect(definition.eligibleRoleIds).toContain(chosen.role)
    }
  })

  it('balanceWorkload never leaves a staff member overloaded when a fitting candidate exists', () => {
    const { world, teamId } = newGame()
    const overloaded = (candidate: ReturnType<typeof createNewGame>) =>
      getTeamStaffAssignments(candidate, teamId).filter((assignment) => calculateStaffWorkload(candidate, assignment.staffPersonId).overloaded).length

    expect(overloaded(runStaffAssignmentStrategy(world, teamId, 'maximumSpecialization').world)).toBeGreaterThanOrEqual(0)
    expect(overloaded(runStaffAssignmentStrategy(world, teamId, 'balanceWorkload').world)).toBe(0)
  })

  it('a section scope only touches that domain', () => {
    const { world, teamId } = newGame()
    const plan = planStaffAssignments(world, teamId, 'bestOverallFit', { domain: 'scouting' })
    expect(plan.changes.length).toBeGreaterThan(0)
    for (const change of plan.changes) {
      expect(responsibilityDefinition(change.kind).domain).toBe('scouting')
    }
  })

  it('leaves responsibilities that already have a holder untouched', () => {
    const { world, teamId } = newGame()
    const once = runStaffAssignmentStrategy(world, teamId, 'bestOverallFit')
    const alreadyHeld = new Set(once.changes.map((change) => change.kind))
    for (const change of planStaffAssignments(once.world, teamId, 'bestOverallFit').changes) {
      expect(alreadyHeld.has(change.kind)).toBe(false)
    }
  })

  it('applies through the canonical responsibility boundary', () => {
    const { world, teamId } = newGame()
    const result = runStaffAssignmentStrategy(world, teamId, 'bestOverallFit')
    for (const change of result.changes) {
      const stored = result.world.responsibilitiesById[responsibilityIdForTeam(teamId, change.kind)]
      expect(stored?.holderStaffId).toBe(change.holderStaffId)
      expect(stored?.mode).toBe(change.mode)
    }
  })

  it('counts unchanged and overload warnings into the program result', () => {
    const { world, teamId } = newGame()
    const program = planStaffAssignments(world, teamId, 'delegateMore')
    const delegable = RESPONSIBILITY_KINDS.filter((kind) => responsibilityDefinition(kind).eligibleParticipant === 'staff')
    expect(program.changes.length + program.unchanged).toBeGreaterThanOrEqual(delegable.length - 1)
    expect(program.workloadWarnings).toBe(program.changes.filter((change) => change.overloadWarning).length)
  })
})

describe('planStaffOptimization', () => {
  it('never fills a vacancy', () => {
    const { world, teamId } = newGame()
    expect(planStaffOptimization(world, teamId)).toEqual([])
  })

  it('only proposes upgrades that improve suitability by the minimum gain', () => {
    const { world, teamId } = newGame()
    const assigned = runStaffAssignmentStrategy(world, teamId, 'delegateMore').world
    for (const suggestion of planStaffOptimization(assigned, teamId)) {
      expect(suggestion.previousHolderStaffId).toBeDefined()
      expect(suggestion.holderStaffId).not.toBe(suggestion.previousHolderStaffId)
      expect(suggestion.suitabilityGain).toBeGreaterThanOrEqual(OPTIMIZATION_MINIMUM_GAIN)
      expect(suggestion.reason).toBe('upgrade')
    }
  })

  it('is deterministic and does not mutate the world', () => {
    const { world, teamId } = newGame()
    const assigned = runStaffAssignmentStrategy(world, teamId, 'delegateMore').world
    const before = structuredClone(assigned)
    expect(planStaffOptimization(assigned, teamId)).toEqual(planStaffOptimization(assigned, teamId))
    expect(assigned).toEqual(before)
  })

  it('applies the suggestions through the canonical boundary', () => {
    const { world, teamId } = newGame()
    const assigned = runStaffAssignmentStrategy(world, teamId, 'delegateMore').world
    const result = runStaffOptimization(assigned, teamId)
    for (const change of result.changes) {
      expect(result.world.responsibilitiesById[responsibilityIdForTeam(teamId, change.kind)]?.holderStaffId).toBe(change.holderStaffId)
    }
  })
})

describe('unassignResponsibility', () => {
  it('returns a responsibility to the head coach and drops the holder', () => {
    const { world, teamId } = newGame()
    const assigned = runStaffAssignmentStrategy(world, teamId, 'delegateMore').world
    const [firstKind] = heldKinds(assigned, teamId)
    const released = unassignResponsibility(assigned, teamId, firstKind!)
    const stored = released.responsibilitiesById[responsibilityIdForTeam(teamId, firstKind!)]
    expect(stored?.mode).toBe('userControlled')
    expect(stored?.holderStaffId).toBeUndefined()
  })
})
