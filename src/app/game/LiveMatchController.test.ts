import { describe, expect, it } from 'vitest'

import { createDefaultTacticalPlan } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { assignLineupSlot, createDefaultTeamLineup } from '@/domain/tactics'
import { updateGameWorld } from '@/domain/world'
import { createLiveUserMatch, prepareUserMatch } from './playUserGame'
import { createNewGame } from './createNewGame'

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

  it('uses the same explicit starting five in instant preparation and live match bootstrap', () => {
    const original = createNewGame()
    const team = getUserTeam(original)!
    const expected = team.rosterPlayerIds.slice(0, 5)
    let lineup = createDefaultTeamLineup(team.id)
    for (const [index, playerId] of expected.entries()) lineup = assignLineupSlot(lineup, (['PG', 'SG', 'SF', 'PF', 'C'] as const)[index]!, playerId)
    const world = updateGameWorld(original, { lineupsByTeamId: { ...original.lineupsByTeamId, [team.id]: lineup } })
    const prepared = prepareUserMatch(world)
    const live = createLiveUserMatch(world).snapshot()
    const game = world.games[prepared.gameId]!
    const side = team.id === game.homeTeamId ? 'home' : 'away'

    expect(prepared.lineups[side]).toEqual(expected)
    expect(live.lineups[side]).toEqual(expected)
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

  it('keeps live coaching disabled for now', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const plan = { ...createDefaultTacticalPlan(), pace: 2 as const }

    expect(controller.applyTactics(userTeam.id, plan)).toEqual(before)
    expect(controller.snapshot()).toEqual(before)
  })

  it('keeps manual substitutions disabled for now', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const playerOutId = userTeam.rosterPlayerIds[0]!
    const playerInId = userTeam.rosterPlayerIds[1]!

    expect(controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])).toEqual(before)
    expect(controller.replacementCandidates(userTeam.id, playerOutId)).toEqual([])
    expect(controller.snapshot()).toEqual(before)
  })
})
