import { describe, expect, it } from 'vitest'

import { createDefaultTacticalPlan } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { createLiveUserMatch, createNewGame, prepareUserMatch } from './index'

describe('LiveMatchController', () => {
  it('starts without future sporting events and reaches the batch result through the same steps', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    expect(controller.snapshot().events).toHaveLength(1)
    while (!controller.isComplete) controller.advanceOneStep()
    expect(controller.snapshot()).toEqual(prepareUserMatch(world))
  })

  it('records atomic tactical changes without advancing sporting state and applies no-op changes silently', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const plan = { ...createDefaultTacticalPlan(), pace: 2 as const }
    const after = controller.applyTactics(userTeam.id, plan)
    const event = after.events.at(-1)!
    expect(event).toMatchObject({ type: 'tacticalChange', teamId: userTeam.id, period: before.events.at(-1)!.period, clockSecondsRemaining: before.events.at(-1)!.clockSecondsRemaining, homeScore: 0, awayScore: 0 })
    expect(after.events).toHaveLength(before.events.length + 1)
    expect(controller.applyTactics(userTeam.id, plan).events).toHaveLength(after.events.length)
  })
  it('applies a manual substitution atomically without advancing the sporting clock', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const userTeam = getUserTeam(world)!
    const before = controller.snapshot()
    const playerOutId = before.lineups.home.includes(userTeam.rosterPlayerIds[0]!) ? userTeam.rosterPlayerIds[0]! : before.lineups.away[0]!
    const playerInId = userTeam.rosterPlayerIds.find((playerId) => !before.lineups.home.includes(playerId) && !before.lineups.away.includes(playerId))!
    const after = controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])
    expect(after.events.at(-1)).toMatchObject({ type: 'substitution', source: 'manual', playerOutId, playerInId, clockSecondsRemaining: before.events.at(-1)!.clockSecondsRemaining })
    expect(after.events).toHaveLength(before.events.length + 1)
  })
})
