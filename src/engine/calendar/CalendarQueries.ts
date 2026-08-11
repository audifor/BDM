import { compareGameDates, type GameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import type { TeamId } from '@/domain/ids'
import type { Team } from '@/domain/team'
import type { GameWorld } from '@/domain/world'

export interface CurrentDateStatus {
  readonly date: GameDate
  readonly scheduledGames: readonly Game[]
  readonly hasGames: boolean
  readonly userGame?: Game
}

export function getGamesOnDate(world: GameWorld, date: GameDate): Game[] {
  return Object.values(world.games)
    .filter((game) => game.date === date)
    .sort((a, b) => compareGameIds(a.id, b.id))
}

export function getGamesToday(world: GameWorld): Game[] {
  return getGamesOnDate(world, world.currentDate)
}

export function getScheduledGamesToday(world: GameWorld): Game[] {
  return getGamesToday(world).filter((game) => game.status === 'scheduled')
}

export function getUserTeam(world: GameWorld): Team | undefined {
  return Object.values(world.teams).find((team) => team.coachId === world.userCoachId)
}

export function getNextScheduledGameForTeam(world: GameWorld, teamId: TeamId): Game | undefined {
  return Object.values(world.games)
    .filter(
      (game) =>
        game.status === 'scheduled' &&
        compareGameDates(game.date, world.currentDate) >= 0 &&
        (game.homeTeamId === teamId || game.awayTeamId === teamId),
    )
    .sort(compareGamesByDateThenId)[0]
}

export function getNextUserGame(world: GameWorld): Game | undefined {
  const userTeam = getUserTeam(world)
  return userTeam === undefined ? undefined : getNextScheduledGameForTeam(world, userTeam.id)
}

/** `userGame` includes today's user game even after completion; `scheduledGames` does not. */
export function inspectCurrentDate(world: GameWorld): CurrentDateStatus {
  const gamesToday = getGamesToday(world)
  const userTeam = getUserTeam(world)

  return {
    date: world.currentDate,
    scheduledGames: gamesToday.filter((game) => game.status === 'scheduled'),
    hasGames: gamesToday.length > 0,
    ...(userTeam === undefined
      ? {}
      : {
          userGame: gamesToday.find(
            (game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id,
          ),
        }),
  }
}

function compareGamesByDateThenId(a: Game, b: Game): number {
  return compareGameDates(a.date, b.date) || compareGameIds(a.id, b.id)
}

function compareGameIds(a: Game['id'], b: Game['id']): number {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}
