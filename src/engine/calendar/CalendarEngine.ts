import { addDays } from '@/domain/date'
import { createGameWorld, type GameWorld } from '@/domain/world'

/** Advances only the simulation date, leaving game resolution to other services. */
export function advanceDay(world: GameWorld): GameWorld {
  return createGameWorld({
    currentDate: addDays(world.currentDate, 1),
    userCoachId: world.userCoachId,
    countries: Object.values(world.countries),
    coaches: Object.values(world.coaches),
    players: Object.values(world.players),
    teams: Object.values(world.teams),
    competitions: Object.values(world.competitions),
    seasons: Object.values(world.seasons),
    games: Object.values(world.games),
  })
}
