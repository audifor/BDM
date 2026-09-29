import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { reviewGMPlans } from './GMPlanService'

describe('GM plan review application boundary', () => {
  let base: GameWorld
  beforeAll(() => { base = createNewGame() }, 120_000)

  function team(user: boolean) {
    return Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && (candidate.coachId === base.userCoachId) === user && candidate.rosterPlayerIds.length >= 5)!
  }

  function shortRoster(teamId: TeamId): GameWorld {
    return updateGameWorld(base, { teams: Object.values(base.teams).map((candidate) => candidate.id === teamId ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
  }

  it('persists broad selections for an AI team without mutating action or Governance workflows', () => {
    const ai = team(false)
    const world = shortRoster(ai.id)
    const transactions = world.playerTransactionsById
    const contracts = world.contractsById
    const requests = world.governanceRequestsById
    const events = world.governanceRequestEventsById
    const decisions = world.governanceDecisionEventsById
    const outcomes = world.delegationOutcomesById
    const result = reviewGMPlans(world, ai.id)
    expect(result.kind).toBe('AI_SELECTED')
    expect(result.selectedPlans.length).toBeGreaterThan(0)
    expect(Object.values(result.world.gmPlanStatesById).filter((plan) => plan.teamId === ai.id)).toEqual(result.selectedPlans)
    expect(new Set(result.selectedPlans.map((plan) => plan.needId)).size).toBe(result.selectedPlans.length)
    expect(result.world.playerTransactionsById).toEqual(transactions)
    expect(result.world.contractsById).toEqual(contracts)
    expect(result.world.governanceRequestsById).toEqual(requests)
    expect(result.world.governanceRequestEventsById).toEqual(events)
    expect(result.world.governanceDecisionEventsById).toEqual(decisions)
    expect(result.world.delegationOutcomesById).toEqual(outcomes)
    for (const plan of result.selectedPlans) expect(Object.keys(plan).some((key) => /player|target|rating|valuation/i.test(key))).toBe(false)
    const unrelatedTeam = Object.values(result.world.teams).find((candidate) => candidate.id !== ai.id)!
    const unrelatedChange = updateGameWorld(result.world, { teams: Object.values(result.world.teams).map((candidate) => candidate.id === unrelatedTeam.id ? { ...candidate, name: `${candidate.name} II` } : candidate) })
    const reviewedAgain = reviewGMPlans(unrelatedChange, ai.id)
    expect(reviewedAgain.selectedPlans.map((plan) => [plan.needId, plan.selectedOptionKind, plan.selectedOn])).toEqual(result.selectedPlans.map((plan) => [plan.needId, plan.selectedOptionKind, plan.selectedOn]))
  })

  it('returns a user recommendation without persisting an autonomous plan', () => {
    const user = team(true)
    const world = shortRoster(user.id)
    const result = reviewGMPlans(world, user.id)
    expect(result.kind).toBe('USER_RECOMMENDATION')
    expect(result.recommendations.length).toBeGreaterThan(0)
    expect(result.selectedPlans).toEqual([])
    expect(result.world).toBe(world)
    expect(result.world.gmPlanStatesById).toBe(world.gmPlanStatesById)
  })
})
