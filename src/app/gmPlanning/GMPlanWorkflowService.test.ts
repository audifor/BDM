import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createGMPlanState } from '@/domain/gmPlanning'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { reviewGMPlanWorkflows } from './GMPlanWorkflowService'

describe('GM plan workflow review boundary', () => {
  let base: GameWorld
  beforeAll(() => { base = createNewGame() }, 120_000)

  function team(user: boolean) {
    return Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && (candidate.coachId === base.userCoachId) === user && candidate.rosterPlayerIds.length >= 5)!
  }

  function shortRoster(teamId: TeamId): GameWorld {
    return updateGameWorld(base, { teams: Object.values(base.teams).map((candidate) => candidate.id === teamId ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
  }

  it('revalidates an AI plan using current readiness and returns a market route without creating work', () => {
    const ai = team(false)
    const world = shortRoster(ai.id)
    const context = assessGMDecisionContext(world, ai.id)
    const option = context.options.find((item) => item.kind === 'EXTERNAL_ACQUISITION' && item.planningEligibility === 'SELECTABLE')!
    const stored = createGMPlanState({ id: `${ai.id}:${option.needId}`, teamId: ai.id, needId: option.needId, selectedOptionKind: option.kind, selectedOn: world.currentDate, lastReviewedOn: world.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: 'AUTHORIZED', strategyAtSelection: context.strategy, originalOptionPriority: option.priority })
    const plannedWorld = updateGameWorld(world, { gmPlanStates: [stored] })
    const before = {
      transactions: plannedWorld.playerTransactionsById,
      contracts: plannedWorld.contractsById,
      requests: plannedWorld.governanceRequestsById,
      governanceEvents: plannedWorld.governanceDecisionEventsById,
      scouting: plannedWorld.scoutingAssignmentsById,
      finance: plannedWorld.financeDecisionProposalsById,
      advisories: plannedWorld.delegationOutcomesById,
    }
    const result = reviewGMPlanWorkflows(plannedWorld, ai.id)
    const decision = result.decisions.find((item) => item.planId === stored.id && item.responseFamily === 'EXTERNAL_ACQUISITION')
    expect(result.kind).toBe('AI_PLANNED_WORKFLOW')
    expect(decision).toMatchObject({ currentValidity: 'CURRENT', route: 'MARKET_INTELLIGENCE_REQUIRED', currentExecutionReadiness: option.executionReadiness, status: 'WAITING_INFORMATION' })
    expect(result.world.playerTransactionsById).toEqual(before.transactions)
    expect(result.world.contractsById).toEqual(before.contracts)
    expect(result.world.governanceRequestsById).toEqual(before.requests)
    expect(result.world.governanceDecisionEventsById).toEqual(before.governanceEvents)
    expect(result.world.scoutingAssignmentsById).toEqual(before.scouting)
    expect(result.world.financeDecisionProposalsById).toEqual(before.finance)
    expect(result.world.delegationOutcomesById).toEqual(before.advisories)
    const externalPlayerId = Object.keys(world.players)[0]!
    expect(JSON.stringify(result.decisions)).not.toContain(externalPlayerId)
  })

  it('returns a user recommendation without mutating the world and is repeatable for AI review', () => {
    const user = team(true)
    const userWorld = shortRoster(user.id)
    const userResult = reviewGMPlanWorkflows(userWorld, user.id)
    expect(userResult.kind).toBe('USER_RECOMMENDED_WORKFLOW')
    expect(userResult.decisions.length).toBeGreaterThan(0)
    expect(userResult.world).toBe(userWorld)

    const ai = team(false)
    const aiWorld = shortRoster(ai.id)
    const first = reviewGMPlanWorkflows(aiWorld, ai.id)
    const repeated = reviewGMPlanWorkflows(first.world, ai.id)
    expect(repeated.decisions).toEqual(first.decisions)
    expect(repeated.world.gmPlanStatesById).toEqual(first.world.gmPlanStatesById)
  })
})
