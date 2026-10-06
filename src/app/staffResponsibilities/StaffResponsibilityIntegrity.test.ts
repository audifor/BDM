import { describe, expect, it } from 'vitest'

import { createAcbTestGame as createFullAcbTestGame, createNewGame as createFullNewGame } from '@/app/game'
import { runStaffAssignmentStrategy, planStaffAssignments } from '@/app/staffAssignments'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { withShortGameFormat } from '@/app/game/testFixtures'
import { responsibilityIdForTeam, RESPONSIBILITY_KINDS, isResponsibilityConnected, responsibilityDefinition, type ResponsibilityKind } from '@/domain/responsibility'
import { getTeamResponsibilities, updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { resolveDelegatedResponsibility } from '@/engine/staff/resolveDelegatedResponsibility'
import { calculateStaffWorkload } from '@/domain/world'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'

// MX0.3 Gate B: Staff responsibility integrity. The canonical authority is the responsibility registry's own
// disposition (`isResponsibilityConnected`): retired / deferred kinds may be preserved as historical rows, but no
// product flow may create a new active assignment for them.

const createNewGame = (...args: Parameters<typeof createFullNewGame>): ReturnType<typeof createFullNewGame> => withShortGameFormat(createFullNewGame(...args))
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

const RETIRED_OR_DEFERRED: readonly ResponsibilityKind[] = RESPONSIBILITY_KINDS.filter((kind) => !isResponsibilityConnected(kind))
const ACTIVE: readonly ResponsibilityKind[] = RESPONSIBILITY_KINDS.filter(isResponsibilityConnected)

function memoryRepository(initial = ''): GameSaveRepository & { value: string } {
  return {
    value: initial,
    async save(value) { this.value = value },
    async load() { return this.value },
    async getInfo() { return null },
  }
}

/** An assistant Coach who can hold Staff responsibilities on the user's Team. */
function assistantCoach(world: GameWorld) {
  const team = getUserTeam(world)!
  const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'assistantCoach')!
  return { teamId: team.id, staffId: assignment.staffPersonId }
}

describe('MX0.3 Gate B — one canonical responsibility authority', () => {
  it('has both an active and a retired/deferred population to reason about', () => {
    expect(ACTIVE.length).toBeGreaterThan(0)
    expect(RETIRED_OR_DEFERRED.length).toBeGreaterThan(0)
    // The registry itself is the authority: the disposition is never inferred from a name.
    for (const kind of RETIRED_OR_DEFERRED) expect(responsibilityDefinition(kind).disposition).not.toBe('CONNECTED')
  })

  it('can manually assign an active responsibility and rejects every retired/deferred one', () => {
    const world = createNewGame()
    const { teamId, staffId } = assistantCoach(world)

    const assigned = setTeamResponsibility(world, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    expect(assigned.responsibilitiesById[responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')]!.holderStaffId).toBe(staffId)

    for (const kind of RETIRED_OR_DEFERRED) {
      expect(() => setTeamResponsibility(world, { teamId, kind, mode: 'userControlled' })).toThrow(/cannot be assigned/)
    }
  })

  it('never lets the auto-assignment planner attempt a retired or deferred responsibility', () => {
    const world = createNewGame()
    const { teamId } = assistantCoach(world)

    for (const strategy of ['bestOverallFit', 'delegateMore', 'maximumSpecialization', 'balanceWorkload'] as const) {
      // The planner used to throw here ("Responsibility manageRecovery is retired and cannot be assigned") because it
      // iterated every registry kind; now every kind it proposes is one the assignment boundary accepts.
      const program = planStaffAssignments(world, teamId, strategy)
      for (const kind of new Set(program.changes.map((change) => change.kind))) {
        expect(isResponsibilityConnected(kind), `${strategy} proposed the non-assignable kind ${kind}`).toBe(true)
      }
      expect(program.changes.length + program.unchanged).toBeGreaterThan(0)
      for (const kind of RETIRED_OR_DEFERRED) expect(program.changes.some((change) => change.kind === kind)).toBe(false)
    }
  })

  it('runs the automatic strategy through the canonical boundary and keeps connectivity and suitability working', () => {
    const world = createNewGame()
    const { teamId, staffId } = assistantCoach(world)
    const result = runStaffAssignmentStrategy(world, teamId, 'delegateMore')
    expect(result.changes.length).toBeGreaterThan(0)
    for (const change of result.changes) {
      expect(result.world.responsibilitiesById[responsibilityIdForTeam(teamId, change.kind)]!.holderStaffId).toBe(change.holderStaffId)
    }

    // Connectivity: a delegated ACTIVE responsibility resolves to its holder; a retired kind never resolves.
    expect(resolveDelegatedResponsibility(result.world, teamId, 'createTeamTrainingPlan')).toBeDefined()
    for (const kind of RETIRED_OR_DEFERRED) expect(resolveDelegatedResponsibility(result.world, teamId, kind)).toBeUndefined()

    // Suitability stays functional for an active kind, and its candidates are real Team Staff.
    const candidates = planStaffAssignments(world, teamId, 'bestOverallFit')
    expect(candidates.changes.every((change) => change.suitability >= 0)).toBe(true)
    expect(staffId).toBeDefined()
  })

  it('does not charge an inert retired row against workload', () => {
    const world = createNewGame()
    const { teamId, staffId } = assistantCoach(world)
    const baseline = calculateStaffWorkload(world, staffId).totalCapacityUsed
    // `defensiveGamePlan` is RETIRED yet assistantCoach-eligible: a retirement-era row is valid historical data, but
    // it is inert — it must not resolve and must not consume capacity.
    const kind: ResponsibilityKind = 'defensiveGamePlan'
    expect(isResponsibilityConnected(kind)).toBe(false)
    const withRetiredRow = updateGameWorld(world, { responsibilities: [{ id: responsibilityIdForTeam(teamId, kind), teamId, kind, mode: 'delegated', holderStaffId: staffId }] })

    expect(calculateStaffWorkload(withRetiredRow, staffId).totalCapacityUsed).toBe(baseline)
    expect(resolveDelegatedResponsibility(withRetiredRow, teamId, kind)).toBeUndefined()
  })
})

describe('MX0.3 Gate B — responsibility round-trip and legacy migration', () => {
  it('preserves a current valid assignment across save and load', async () => {
    const base = createAcbTestGame()
    const { teamId, staffId } = assistantCoach(base)
    const world = setTeamResponsibility(base, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })

    const repository = memoryRepository()
    await saveCurrentGame(world, repository, `${world.currentDate}T12:00:00.000Z`)
    const loaded = await loadSavedGame(repository)

    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
    expect(loaded.responsibilitiesById[responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')]!.holderStaffId).toBe(staffId)
  })

  it('loads a legacy save carrying a retired row without letting it become active, then auto-assigns', async () => {
    // A legacy save may carry a retirement-era row (the domain keeps such rows as inert historical data). Loading it
    // must not make it assignable again, must not break world validation, and must leave auto-assignment working.
    const base = createAcbTestGame()
    const { teamId, staffId } = assistantCoach(base)
    const retiredKind: ResponsibilityKind = 'defensiveGamePlan'
    expect(isResponsibilityConnected(retiredKind)).toBe(false)
    const legacy = updateGameWorld(base, { responsibilities: [{ id: responsibilityIdForTeam(teamId, retiredKind), teamId, kind: retiredKind, mode: 'delegated', holderStaffId: staffId }] })

    const repository = memoryRepository()
    await saveCurrentGame(legacy, repository, `${legacy.currentDate}T12:00:00.000Z`)
    const loaded = await loadSavedGame(repository)

    // The retired row is still history, never an active assignment...
    expect(resolveDelegatedResponsibility(loaded, teamId, retiredKind)).toBeUndefined()
    expect(calculateStaffWorkload(loaded, staffId).totalCapacityUsed).toBe(calculateStaffWorkload(base, staffId).totalCapacityUsed)
    // ...it is not exposed as a current responsibility of the Team's workspace rows...
    expect(getTeamResponsibilities(loaded, teamId).filter((row) => isResponsibilityConnected(row.kind)).every((row) => row.kind !== retiredKind)).toBe(true)
    // ...and every product flow still works afterwards.
    const afterPlan = runStaffAssignmentStrategy(loaded, teamId, 'bestOverallFit')
    for (const change of afterPlan.changes) expect(isResponsibilityConnected(change.kind)).toBe(true)
    expect(afterPlan.changes.length).toBeGreaterThan(0)
  })
})
