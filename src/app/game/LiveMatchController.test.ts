import { describe, expect, it } from 'vitest'

import { createDefaultTacticalPlan } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { resolveActiveMatchLineups } from '@/ui/matchViewer'
import { createLiveUserMatch, createNewGame, prepareUserMatch } from './index'

/**
 * The real on-court lineup, exactly as presentation derives it (MG2B Test B):
 * MatchSimulation.lineups only ever holds the historical initial five while a
 * match is live, so the current active five must be replayed from events via
 * resolveActiveMatchLineups — the same function NgMatchViewer/MatchViewerScreen
 * use. This proves presentation observes runtime state rather than owning it.
 */
function activeAndBench(world: ReturnType<typeof createNewGame>, controller: ReturnType<typeof createLiveUserMatch>) {
  const userTeam = getUserTeam(world)!
  const snapshot = controller.snapshot()
  const isHome = snapshot.homeTeamId === userTeam.id
  const activeLineups = resolveActiveMatchLineups(snapshot, snapshot.events)
  const active = isHome ? activeLineups.home : activeLineups.away
  const squad = isHome ? snapshot.squads.home : snapshot.squads.away
  const bench = squad.filter((playerId) => !active.includes(playerId))
  return { userTeam, active, bench }
}

describe('LiveMatchController', () => {
  it('starts without future sporting events and reaches the batch result through the same steps', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    expect(controller.snapshot().events).toHaveLength(1)
    while (!controller.isComplete) controller.advanceOneStep()
    expect(controller.snapshot()).toEqual(prepareUserMatch(world))
  })

  it('returns presentation snapshots around exactly one live sporting step', () => {
    const controller = createLiveUserMatch(createNewGame())
    const step = controller.advanceOneStepWithSnapshots()

    expect(step.before.events).toHaveLength(1)
    expect(step.after.events.length).toBeGreaterThan(step.before.events.length)
    expect(step.after.events.at(-1)!.clockSecondsRemaining).toBeLessThan(step.before.events.at(-1)!.clockSecondsRemaining)
  })

  it('simulates only the remainder of the current quarter', () => {
    const controller = createLiveUserMatch(createNewGame())
    controller.advanceOneStep()
    const after = controller.skipToEndOfPeriod()

    expect(after.events).toContainEqual(expect.objectContaining({ type: 'periodEnd', period: 1, clockSecondsRemaining: 0 }))
    expect(after.events.at(-1)).toMatchObject({ type: 'periodStart', period: 2, clockSecondsRemaining: 600 })
    expect(after.events.some((event) => event.period > 2)).toBe(false)
    expect(controller.isComplete).toBe(false)
  })

  // MG2B Test A: a real substitution changes the canonical runtime lineup.
  it('Test A: a valid manual substitution replaces the outgoing player with the incoming player in the real active lineup', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const { userTeam, active, bench } = activeAndBench(world, controller)
    const playerOutId = active[4]!
    const playerInId = bench[0]!

    const result = controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])

    expect(result).toEqual({ status: 'applied' })
    const after = activeAndBench(world, controller)
    expect(after.active).not.toContain(playerOutId)
    expect(after.active).toContain(playerInId)
    expect(new Set(after.active)).toEqual(new Set([...active.slice(0, 4), playerInId]))
  })

  // MG2B Test B: presentation derives the active lineup from runtime events (resolveActiveMatchLineups);
  // it never owns or separately simulates a lineup of its own.
  it('Test B: the presentation-derived active lineup reflects the runtime substitution', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const { userTeam, active, bench } = activeAndBench(world, controller)
    const playerOutId = active[0]!
    const playerInId = bench[0]!

    controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])
    const { active: activeAfter } = activeAndBench(world, controller)
    const snapshot = controller.snapshot()

    expect(activeAfter).toContain(playerInId)
    expect(activeAfter).not.toContain(playerOutId)
    expect(snapshot.events.at(-1)).toMatchObject({ type: 'substitution', teamId: userTeam.id, playerOutId, playerInId })
  })

  // MG2B Test C: a player already on court cannot be brought in — rejected, no state change.
  it('Test C: substituting in a player who is already on court is rejected and does not change the lineup', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const { userTeam, active } = activeAndBench(world, controller)
    const before = controller.snapshot()

    const result = controller.applyManualSubstitutions(userTeam.id, [{ playerOutId: active[0]!, playerInId: active[1]! }])

    expect(result.status).toBe('rejected')
    expect(controller.snapshot()).toEqual(before)
  })

  // MG2B Test D: a player not currently on court cannot be substituted out — rejected.
  it('Test D: substituting out a player who is not on court is rejected and does not change the lineup', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const { userTeam, bench } = activeAndBench(world, controller)
    const before = controller.snapshot()
    const playerOutId = bench[0]!
    const playerInId = bench[1]!

    const result = controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])

    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.reason).toBe('PLAYER_NOT_ON_COURT')
    expect(controller.snapshot()).toEqual(before)
  })

  it('a valid live tactical change is applied and genuinely updates the coaching state', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const userTeam = getUserTeam(world)!
    const plan = { ...createDefaultTacticalPlan(), pace: 2 as const }

    const result = controller.applyTactics(userTeam.id, plan)

    expect(result).toEqual({ status: 'applied' })
    const isHome = controller.snapshot().homeTeamId === userTeam.id
    expect(controller.currentPlans[isHome ? 'home' : 'away'].currentTacticalPlan).toMatchObject({ pace: 2 })
  })

  it('rejects a tactical change for a team not in this game', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const plan = createDefaultTacticalPlan()

    const result = controller.applyTactics('not-a-real-team-id' as never, plan)

    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.reason).toBe('INVALID_TEAM')
  })

  it('rejects a substitution batch once the match has finished', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const { userTeam, active, bench } = activeAndBench(world, controller)
    while (!controller.isComplete) controller.advanceOneStep()

    const result = controller.applyManualSubstitutions(userTeam.id, [{ playerOutId: active[0]!, playerInId: bench[0]! }])

    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.reason).toBe('MATCH_NOT_ACTIVE')
  })

  it('replacementCandidates returns the real bench for an on-court player and an empty list otherwise', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const { userTeam, active, bench } = activeAndBench(world, controller)

    expect(new Set(controller.replacementCandidates(userTeam.id, active[0]!))).toEqual(new Set(bench))
    expect(controller.replacementCandidates(userTeam.id, bench[0]!)).toEqual([])
  })

  // MG2B Test G: play/pause/speed lifecycle (advance, skip, complete) keeps working alongside the command boundary.
  it('Test G: the match lifecycle (advance, skip-to-end-of-period, skip-to-end, completion) is unaffected by the command boundary', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    controller.advanceOneStep()
    const midPeriod = controller.snapshot()
    expect(midPeriod.events.length).toBeGreaterThan(1)

    const endOfPeriod = controller.skipToEndOfPeriod()
    expect(endOfPeriod.events.some((event) => event.type === 'periodEnd')).toBe(true)
    expect(controller.isComplete).toBe(false)

    const final = controller.skipToEnd()
    expect(controller.isComplete).toBe(true)
    expect(final.finalScore.home + final.finalScore.away).toBeGreaterThan(0)
  })

  it('determinism: the same seed, initial state, and command sequence/timing produce the same final result', () => {
    function playOneSubstitutionAndFinish() {
      const world = createNewGame()
      const controller = createLiveUserMatch(world)
      const { userTeam, active, bench } = activeAndBench(world, controller)
      controller.advanceOneStep()
      controller.advanceOneStep()
      const result = controller.applyManualSubstitutions(userTeam.id, [{ playerOutId: active[0]!, playerInId: bench[0]! }])
      return { result, final: controller.skipToEnd() }
    }

    const first = playOneSubstitutionAndFinish()
    const second = playOneSubstitutionAndFinish()

    expect(first.result).toEqual(second.result)
    expect(first.final).toEqual(second.final)
  })
})
