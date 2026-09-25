import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media'
import { getUserTeam } from '@/engine/calendar'

import { createMatchSeed, simulateAndApplyGame, type MatchSeedFactory } from './playUserGame'

/** Resolves every remaining game today without changing the calendar date. */
export function simulateRemainingGamesToday(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed): GameWorld {
  return getScheduledGamesToday(world).reduce(
    (updatedWorld, game) => simulateAndApplyGame(updatedWorld, game, createSeed()),
    world,
  )
}

/** Resolves today's pending games, then advances the game calendar by one day. */
export function advanceGameDay(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed): GameWorld {
  const resolvedWorld = simulateRemainingGamesToday(world, createSeed)
  const advancedWorld = advanceDay(resolvedWorld)

  const pastScheduledGame = Object.values(advancedWorld.games).find(
    (game) => game.status === 'scheduled' && compareGameDates(game.date, advancedWorld.currentDate) < 0,
  )
  if (pastScheduledGame !== undefined) {
    throw new Error(`Cannot advance with scheduled Game ${pastScheduledGame.id} in the past`)
  }

  const userTeam = getUserTeam(advancedWorld)
  const userGame = userTeam === undefined ? undefined : getScheduledGamesToday(advancedWorld).find((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)
  return userGame === undefined ? advancedWorld : createPreMatchMediaOpportunity(advancedWorld, userGame.id)
}
