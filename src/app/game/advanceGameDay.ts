import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'

import { simulateAndApplyGame } from './playUserGame'

/** Resolves every remaining game today without changing the calendar date. */
export function simulateRemainingGamesToday(world: GameWorld): GameWorld {
  return getScheduledGamesToday(world).reduce(
    (updatedWorld, game) => simulateAndApplyGame(updatedWorld, game),
    world,
  )
}

/** Resolves today's pending games, then advances the game calendar by one day. */
export function advanceGameDay(world: GameWorld): GameWorld {
  const resolvedWorld = simulateRemainingGamesToday(world)
  const advancedWorld = advanceDay(resolvedWorld)

  const pastScheduledGame = Object.values(advancedWorld.games).find(
    (game) => game.status === 'scheduled' && compareGameDates(game.date, advancedWorld.currentDate) < 0,
  )
  if (pastScheduledGame !== undefined) {
    throw new Error(`Cannot advance with scheduled Game ${pastScheduledGame.id} in the past`)
  }

  return advancedWorld
}
