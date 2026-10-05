/**
 * WSR1 world-scale fixture: a large world made of K independent copies of the prototype world (every id namespaced per copy, so no
 * entity is shared), merged into one GameWorld, with each copy's next fixtures (every team at most once) moved to the current date. It
 * gives one realistic world day with hundreds of independent Games: the volume the future world will have, built from canonical data.
 */
import { createNewGame } from '@/app/game/createNewGame'
import type { Game } from '@/domain/game'
import { createPlayer } from '@/domain/player'
import { compareGameDates } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'

function namespaced(world: GameWorld, copy: number): GameWorld {
  if (copy === 0) return world
  const text = JSON.stringify(world).replaceAll('generated-', `c${copy}-generated-`).replaceAll('women-', `c${copy}-women-`)
  const parsed = JSON.parse(text) as GameWorld
  // JSON drops the non-enumerable, factory-derived Player.potential: rebuild Players through their factory (as createNewGame does).
  return { ...parsed, players: Object.fromEntries(Object.entries(parsed.players).map(([id, player]) => [id, createPlayer(player)])) }
}

function merge(primary: GameWorld, secondary: GameWorld): GameWorld {
  const merged: Record<string, unknown> = { ...primary }
  for (const [key, value] of Object.entries(secondary)) {
    if (key === 'schemaVersion' || key === 'currentDate' || key === 'currentSeasonId' || key === 'userCoachId') continue
    const current = primary[key as keyof GameWorld]
    if (Array.isArray(value)) merged[key] = [...(current as readonly unknown[]), ...value]
    else if (typeof value === 'object' && value !== null) merged[key] = { ...(current as object), ...value }
  }
  return merged as unknown as GameWorld
}

/** Each team's next scheduled Game in started seasons, greedily (schedule order), every team at most once. */
function nextIndependentGames(world: GameWorld): Game[] {
  const used = new Set<string>()
  const chosen: Game[] = []
  const games = Object.values(world.games).filter((game) => game.status === 'scheduled' && compareGameDates(world.seasons[game.seasonId]!.startDate, world.currentDate) <= 0)
    .sort((a, b) => compareGameDates(a.date, b.date) || String(a.id).localeCompare(String(b.id)))
  for (const game of games) {
    if (used.has(game.homeTeamId) || used.has(game.awayTeamId)) continue
    used.add(game.homeTeamId); used.add(game.awayTeamId); chosen.push(game)
  }
  return chosen
}

export function createWorldScaleFixture(copies: number): { world: GameWorld; todayGames: number } {
  let base = createNewGame()
  while (getScheduledGamesToday(base).length === 0) base = advanceDay(base)
  // Every season is open from today (fixture: all competitions in season at once), then each copy's next fixtures come to today.
  const today = base.currentDate
  base = { ...base, seasons: Object.fromEntries(Object.entries(base.seasons).map(([id, season]) => [id, compareGameDates(season.startDate, today) > 0 ? { ...season, startDate: today } : season])) }
  const moved = new Set(nextIndependentGames(base).map((game) => game.id))
  base = { ...base, games: Object.fromEntries(Object.entries(base.games).map(([id, game]) => [id, moved.has(game.id) ? { ...game, date: base.currentDate } : game])) }
  let world = base
  for (let copy = 1; copy < copies; copy += 1) world = merge(world, namespaced(base, copy))
  world = updateGameWorld(world, {})
  return { world, todayGames: getScheduledGamesToday(world).length }
}
