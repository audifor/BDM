import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { addYears } from '@/domain/date'
import { getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { staffHumanContextIdFor, createStaffHumanContext } from '@/domain/staffHumanState'
import { initializeStaffExpectationProfile, initializeStaffHumanState } from '@/engine/staff/StaffHumanAppraisalEngine'
import { getStaffDynamicsForTeam, explainStaffHumanState, classifySatisfactionBand, classifyIntensityBand } from './staffHumanStatePresentation'
import type { StaffPersonId, TeamId } from '@/domain/ids'

function baseWorld(): GameWorld { return createNewGame() }
function pickStaff(world: GameWorld, teamId: TeamId, role: string): StaffPersonId {
  return getTeamStaffAssignments(world, teamId).find((assignment) => assignment.role === role)!.staffPersonId
}

function seedContext(world: GameWorld, staffId: StaffPersonId, teamId: TeamId) {
  const contextId = staffHumanContextIdFor(staffId, teamId, world.currentDate)
  const context = createStaffHumanContext({ id: contextId, staffId, teamId, startedOn: world.currentDate })
  const expectations = initializeStaffExpectationProfile(world, context)
  const state = initializeStaffHumanState(world, context, expectations.current)
  const seeded = updateGameWorld(world, { staffHumanContexts: [context], staffHumanStates: [state], staffExpectationProfiles: [expectations] })
  return { world: seeded, contextId }
}

describe('classifySatisfactionBand / classifyIntensityBand', () => {
  it('produces exactly one of the 7 canonical bands, monotonic with value', () => {
    const values = [0, 15, 35, 50, 65, 80, 100]
    const bands = values.map(classifySatisfactionBand)
    expect(new Set(bands).size).toBeGreaterThan(1)
  })
  it('never exposes raw decimals — bands are qualitative labels only', () => {
    expect(typeof classifySatisfactionBand(72)).toBe('string')
    expect(typeof classifyIntensityBand(72)).toBe('string')
  })
})

describe('getStaffDynamicsForTeam', () => {
  it('only includes Staff with a live Human Context for the requested Team', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== teamId)!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const { world: seeded } = seedContext(world, staffId, teamId)
    const items = getStaffDynamicsForTeam(seeded, teamId)
    expect(items.some((item) => item.staffId === staffId)).toBe(true)
    expect(getStaffDynamicsForTeam(seeded, otherTeamId).some((item) => item.staffId === staffId)).toBe(false)
  })

  it('never exposes raw 0-100 numbers on the presentation item — only bands/labels', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const { world: seeded } = seedContext(world, staffId, teamId)
    const item = getStaffDynamicsForTeam(seeded, teamId).find((entry) => entry.staffId === staffId)!
    for (const value of Object.values(item.bands)) expect(typeof value).toBe('string')
    expect(typeof item.overallSatisfaction).toBe('string')
  })

  it('interpreted state is not a trivial alias of overall satisfaction (STRAINED can occur with a mid-range overall score under real overload)', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    // Stack real delegated Responsibilities to force genuine overload (calculateStaffWorkload-derived).
    let overloaded = world
    for (const kind of ['createTeamTrainingPlan', 'assignIndividualDevelopment', 'defensiveGamePlan', 'offensivePreparation'] as const) {
      overloaded = setTeamResponsibility(overloaded, { teamId, kind, mode: 'delegated', holderStaffId: staffId })
    }
    const contextId = staffHumanContextIdFor(staffId, teamId, overloaded.currentDate)
    const context = createStaffHumanContext({ id: contextId, staffId, teamId, startedOn: overloaded.currentDate })
    const expectations = { ...initializeStaffExpectationProfile(overloaded, context), establishedOn: addYears(overloaded.currentDate, -1) }
    const strainedState = {
      contextId, staffId,
      roleSatisfaction: 55, responsibilitySatisfaction: 55, autonomySatisfaction: 55, influenceSatisfaction: 55,
      contractSatisfaction: 55, workloadSatisfaction: 40, professionalFulfillment: 50, recognitionSatisfaction: 55,
      frustration: 30, stress: 78, organizationalCommitment: 55,
      lastEvaluatedOn: overloaded.currentDate,
    }
    const seeded = updateGameWorld(overloaded, { staffHumanContexts: [context], staffHumanStates: [strainedState], staffExpectationProfiles: [expectations] })
    const item = getStaffDynamicsForTeam(seeded, teamId).find((entry) => entry.staffId === staffId)!
    expect(item.interpretedState).toBe('STRAINED')
  })
})

describe('explainStaffHumanState', () => {
  it('returns undefined for a Staff person with no Human Context yet', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    expect(explainStaffHumanState(world, staffId)).toBeUndefined()
  })

  it('reflects a real granted Responsibility as a recent development after the fact', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const { world: seeded } = seedContext(world, staffId, teamId)
    const granted = setTeamResponsibility(seeded, { teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: staffId })
    const explanation = explainStaffHumanState(granted, staffId)
    expect(explanation).toBeDefined()
    expect(explanation!.recentDevelopments.some((entry) => entry.includes('Responsibility'))).toBe(true)
  })

  it('never fabricates positives/concerns/memories/relationships that do not exist', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const { world: seeded } = seedContext(world, staffId, teamId)
    const explanation = explainStaffHumanState(seeded, staffId)!
    expect(explanation.memories).toEqual([])
    expect(explanation.relationships).toEqual([])
  })

  it('expectation gaps only include non-MATCHED dimensions', () => {
    const world = baseWorld()
    const teamId = Object.values(world.teams)[0]!.id
    const staffId = pickStaff(world, teamId, 'assistantCoach')
    const { world: seeded } = seedContext(world, staffId, teamId)
    const explanation = explainStaffHumanState(seeded, staffId)!
    for (const gap of explanation.expectationGaps) expect(gap.band).not.toBe('MATCHED')
  })
})
