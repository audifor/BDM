import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'

import { simulateAndApplyGame } from './playUserGame'
import { getCurrentSeason } from './selectors'
import { isSeasonComplete } from '@/engine/season'

/** Resolves every remaining game today without changing the calendar date. */
export function simulateRemainingGamesToday(world: GameWorld): GameWorld {
  return getScheduledGamesToday(world).reduce(
    (updatedWorld, game) => simulateAndApplyGame(updatedWorld, game),
    world,
  )
}

/** Resolves today's pending games, then advances the game calendar by one day. */
export function advanceGameDay(world: GameWorld): GameWorld {
  if (isSeasonComplete(world, getCurrentSeason(world).id)) {
    throw new Error('Season is complete')
  }
  const resolvedWorld = simulateRemainingGamesToday(world)
  if (isSeasonComplete(resolvedWorld, getCurrentSeason(resolvedWorld).id)) {
    return resolvedWorld
  }
  const advancedWorld = advanceDay(resolvedWorld)

  const pastScheduledGame = Object.values(advancedWorld.games).find(
    (game) => game.status === 'scheduled' && compareGameDates(game.date, advancedWorld.currentDate) < 0,
  )
  if (pastScheduledGame !== undefined) {
    throw new Error(`Cannot advance with scheduled Game ${pastScheduledGame.id} in the past`)
  }

  return advancedWorld
}
