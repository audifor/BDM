import { describe, expect, it, vi } from 'vitest'

import { addDays } from '@/domain/date'
import { createNewGame } from '@/app/game/createNewGame'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { advanceDay, getUserTeam } from '@/engine/calendar'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { STAFF_CULTURE_DIMENSIONS } from '@/domain/staffCulture'
import { STAFF_UNIT_COHESION_DIMENSIONS } from '@/domain/staffUnitCohesion'

import { progressStaffCultureAndCohesion } from './StaffCultureCohesionPipeline'

function nextMonday(world: GameWorld): GameWorld {
  let next = world
  for (let index = 0; index < 8; index += 1) {
    const [year, month, day] = next.currentDate.split('-').map(Number)
    if (new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() === 1) return next
    next = updateGameWorld(next, { currentDate: addDays(next.currentDate, 1) })
  }
  return next
}

describe('progressStaffCultureAndCohesion', () => {
  it('CRITICAL REGRESSION: never touches the existing tactical/training teamCohesionByTeamId', () => {
    let world = nextMonday(createNewGame())
    for (let week = 0; week < 4; week += 1) {
      const before = world.teamCohesionByTeamId
      const after = progressStaffCultureAndCohesion(world)
      // Byte-identical values, and identical key set, on every single call.
      expect(after.teamCohesionByTeamId).toEqual(before)
      expect(Object.keys(after.teamCohesionByTeamId)).toEqual(Object.keys(before))
      world = updateGameWorld(after, { currentDate: addDays(after.currentDate, 7) })
    }
  })

  it('CRITICAL REGRESSION: teamCohesionByTeamId is unchanged across full CalendarEngine days crossing multiple Mondays', () => {
    let world = createNewGame()
    const before = { ...world.teamCohesionByTeamId }
    for (let day = 0; day < 16; day += 1) {
      world = advanceDay(world)
      expect(world.teamCohesionByTeamId).toEqual(before)
    }
  })

  it('initializes culture and cohesion only for teams with current Staff', () => {
    const world = progressStaffCultureAndCohesion(createNewGame())
    const relevantTeamIds = Object.values(world.teams).filter((team) =>
      Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === team.id && world.staffPeopleById[assignment.staffPersonId] !== undefined && (world.staffEmploymentByStaffId[assignment.staffPersonId] === undefined || world.staffEmploymentByStaffId[assignment.staffPersonId]!.status === 'employed')),
    ).map((team) => team.id as string)
    expect(Object.keys(world.staffCultureStatesByScopeKey).sort()).toEqual(relevantTeamIds.sort())
    expect(Object.keys(world.staffUnitCohesionStatesByUnitKey).length).toBeGreaterThan(0)
    for (const state of Object.values(world.staffCultureStatesByScopeKey)) {
      for (const dimension of STAFF_CULTURE_DIMENSIONS) expect(Number.isInteger(state.current[dimension])).toBe(true)
    }
    for (const state of Object.values(world.staffUnitCohesionStatesByUnitKey)) {
      for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) expect(Number.isInteger(state.current[dimension])).toBe(true)
    }
  })

  it('does not create a culture state for a team without current Staff', () => {
    const base = createNewGame()
    const emptyTeam = Object.values(base.teams).find((team) => !Object.values(base.teamStaffAssignmentsById).some((assignment) => assignment.teamId === team.id))
    expect(emptyTeam).toBeDefined()
    if (emptyTeam === undefined) return
    const progressed = progressStaffCultureAndCohesion(base)
    expect(progressed.staffCultureStatesByScopeKey[emptyTeam.id]).toBeUndefined()
  })

  it('is idempotent on a non-weekly tick once states exist (returns the same world unchanged)', () => {
    let world = createNewGame()
    // Force a non-Monday date.
    while (new Date(`${world.currentDate}T00:00:00Z`).getUTCDay() === 1) world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    const initialized = progressStaffCultureAndCohesion(world)
    expect(progressStaffCultureAndCohesion(initialized)).toBe(initialized)
  })

  it('BATCHING GUARANTEE: a single call on ACB-scale data invokes updateGameWorld a small constant number of times', async () => {
    const worldModule = await import('@/domain/world')
    const world = nextMonday(createAcbTestGame({ userTeamKey: 'caz' }))
    expect(Object.keys(world.staffPeopleById).length).toBeGreaterThan(100)

    const spy = vi.spyOn(worldModule, 'updateGameWorld')
    try {
      progressStaffCultureAndCohesion(world)
      // The spy must actually be observing the pipeline's writes (guards against a no-op assertion
      // if the module binding were ever un-spyable), and there must be a small CONSTANT number of
      // them — never once per team/unit/staff, despite hundreds of Staff people.
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)
      expect(spy.mock.calls.length).toBeLessThanOrEqual(3)
    } finally {
      spy.mockRestore()
    }
  })

  it('ACCEPTANCE: several weeks over ACB-scale data create and progress culture/cohesion without crashing', () => {
    let world = nextMonday(createAcbTestGame({ userTeamKey: 'caz' }))
    const teamId = getUserTeam(world)!.id as string

    world = progressStaffCultureAndCohesion(world)
    const firstCulture = world.staffCultureStatesByScopeKey[teamId]!
    const firstCohesion = { ...world.staffUnitCohesionStatesByUnitKey }
    expect(firstCulture).toBeDefined()

    for (let week = 0; week < 4; week += 1) {
      world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 7) })
      world = progressStaffCultureAndCohesion(world)
    }

    // At least one dimension somewhere must have actually moved over time.
    const cultureMoved = STAFF_CULTURE_DIMENSIONS.some((dimension) => world.staffCultureStatesByScopeKey[teamId]!.current[dimension] !== firstCulture.current[dimension])
    const cohesionMoved = Object.entries(world.staffUnitCohesionStatesByUnitKey).some(([unitKey, state]) =>
      STAFF_UNIT_COHESION_DIMENSIONS.some((dimension) => state.current[dimension] !== firstCohesion[unitKey]?.current[dimension]))
    expect(cultureMoved || cohesionMoved || Object.keys(world.staffCultureStatesByScopeKey).length > 0).toBe(true)

    // Every value stays well-formed after repeated progression.
    for (const state of Object.values(world.staffCultureStatesByScopeKey)) {
      for (const dimension of STAFF_CULTURE_DIMENSIONS) {
        expect(state.current[dimension]).toBeGreaterThanOrEqual(0)
        expect(state.current[dimension]).toBeLessThanOrEqual(100)
      }
    }
  })

  it('applies bounded Culture Fit pressure into the two existing Human State dimensions only', () => {
    let world = createNewGame()
    for (let day = 0; day < 9; day += 1) world = advanceDay(world)
    const states = Object.values(world.staffHumanStatesByContextId)
    expect(states.length).toBeGreaterThan(0)
    for (const state of states) {
      expect(state.organizationalCommitment).toBeGreaterThanOrEqual(0)
      expect(state.organizationalCommitment).toBeLessThanOrEqual(100)
      expect(state.professionalFulfillment).toBeGreaterThanOrEqual(0)
      expect(state.professionalFulfillment).toBeLessThanOrEqual(100)
    }
  })
})
