import type { Coach } from '@/domain/coach'
import type { Competition } from '@/domain/competition'
import type { Country } from '@/domain/country'
import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import type {
  CoachId,
  CompetitionId,
  CountryId,
  GameId,
  PlayerId,
  SeasonId,
  TeamId,
} from '@/domain/ids'
import type { Player } from '@/domain/player'
import type { Season } from '@/domain/season'
import type { Team } from '@/domain/team'

export const GAME_WORLD_SCHEMA_VERSION = 1 as const

export interface GameWorld {
  readonly schemaVersion: typeof GAME_WORLD_SCHEMA_VERSION
  readonly currentDate: GameDate
  readonly userCoachId: CoachId
  readonly countries: Readonly<Record<CountryId, Country>>
  readonly coaches: Readonly<Record<CoachId, Coach>>
  readonly players: Readonly<Record<PlayerId, Player>>
  readonly teams: Readonly<Record<TeamId, Team>>
  readonly competitions: Readonly<Record<CompetitionId, Competition>>
  readonly seasons: Readonly<Record<SeasonId, Season>>
  readonly games: Readonly<Record<GameId, Game>>
}

export interface CreateGameWorldInput {
  currentDate: GameDate
  userCoachId: CoachId
  countries: readonly Country[]
  coaches: readonly Coach[]
  players: readonly Player[]
  teams: readonly Team[]
  competitions: readonly Competition[]
  seasons: readonly Season[]
  games: readonly Game[]
}

export class GameWorldValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'GameWorldValidationError'
  }
}

export function createGameWorld(input: CreateGameWorldInput): GameWorld {
  const world: GameWorld = {
    schemaVersion: GAME_WORLD_SCHEMA_VERSION,
    currentDate: parseGameDate(input.currentDate),
    userCoachId: input.userCoachId,
    countries: indexById(input.countries, 'Country'),
    coaches: indexById(input.coaches, 'Coach'),
    players: indexById(input.players, 'Player'),
    teams: indexById(input.teams, 'Team'),
    competitions: indexById(input.competitions, 'Competition'),
    seasons: indexById(input.seasons, 'Season'),
    games: indexById(input.games, 'Game'),
  }

  validateWorld(world)
  return world
}

function validateWorld(world: GameWorld): void {
  requireEntity(world.coaches, world.userCoachId, 'User coach')

  for (const coach of Object.values(world.coaches)) {
    requireEntity(world.countries, coach.nationalityId, `Coach ${coach.id} nationality`)
  }

  for (const player of Object.values(world.players)) {
    requireEntity(world.countries, player.nationalityId, `Player ${player.id} nationality`)
  }

  const rosteredPlayerIds = new Set<PlayerId>()
  const assignedCoachIds = new Set<CoachId>()

  for (const team of Object.values(world.teams)) {
    requireEntity(world.countries, team.countryId, `Team ${team.id} country`)

    for (const playerId of team.rosterPlayerIds) {
      const player = requireEntity(world.players, playerId, `Team ${team.id} roster`)
      if (player.gender !== team.gender) {
        throw new GameWorldValidationError(
          `Team ${team.id} has Player ${player.id} with a different gender`,
        )
      }
      if (rosteredPlayerIds.has(playerId)) {
        throw new GameWorldValidationError(`Player ${playerId} belongs to more than one team roster`)
      }
      rosteredPlayerIds.add(playerId)
    }

    if (team.coachId !== undefined) {
      requireEntity(world.coaches, team.coachId, `Team ${team.id} coach`)
      if (assignedCoachIds.has(team.coachId)) {
        throw new GameWorldValidationError(`Coach ${team.coachId} is assigned to more than one team`)
      }
      assignedCoachIds.add(team.coachId)
    }
  }

  for (const competition of Object.values(world.competitions)) {
    for (const teamId of competition.participantTeamIds) {
      const team = requireEntity(world.teams, teamId, `Competition ${competition.id} participant`)
      if (team.gender !== competition.gender) {
        throw new GameWorldValidationError(
          `Competition ${competition.id} has Team ${team.id} with a different gender`,
        )
      }
    }
  }

  for (const season of Object.values(world.seasons)) {
    requireEntity(world.competitions, season.competitionId, `Season ${season.id} competition`)
  }

  for (const game of Object.values(world.games)) {
    const season = requireEntity(world.seasons, game.seasonId, `Game ${game.id} season`)
    const competition = requireEntity(world.competitions, game.competitionId, `Game ${game.id} competition`)
    const homeTeam = requireEntity(world.teams, game.homeTeamId, `Game ${game.id} home team`)
    const awayTeam = requireEntity(world.teams, game.awayTeamId, `Game ${game.id} away team`)

    if (season.competitionId !== competition.id) {
      throw new GameWorldValidationError(`Game ${game.id} competition does not match its season`)
    }
    if (!competition.participantTeamIds.includes(homeTeam.id)) {
      throw new GameWorldValidationError(`Game ${game.id} home Team ${homeTeam.id} is not a participant`)
    }
    if (!competition.participantTeamIds.includes(awayTeam.id)) {
      throw new GameWorldValidationError(`Game ${game.id} away Team ${awayTeam.id} is not a participant`)
    }
    if (homeTeam.gender !== competition.gender || awayTeam.gender !== competition.gender) {
      throw new GameWorldValidationError(`Game ${game.id} teams must match the competition gender`)
    }
    if (
      compareGameDates(game.date, season.startDate) < 0 ||
      compareGameDates(game.date, season.endDate) > 0
    ) {
      throw new GameWorldValidationError(`Game ${game.id} date is outside its season range`)
    }
  }
}

function indexById<Id extends string, Entity extends { readonly id: Id }>(
  entities: readonly Entity[],
  entityName: string,
): Readonly<Record<Id, Entity>> {
  const indexed = Object.create(null) as Record<Id, Entity>

  for (const entity of entities) {
    if (Object.hasOwn(indexed, entity.id)) {
      throw new GameWorldValidationError(`Duplicate ${entityName} ID: ${entity.id}`)
    }
    indexed[entity.id] = entity
  }

  return Object.freeze(indexed)
}

function requireEntity<Id extends string, Entity>(
  collection: Readonly<Record<Id, Entity>>,
  id: Id,
  referenceName: string,
): Entity {
  const entity = collection[id]
  if (entity === undefined) {
    throw new GameWorldValidationError(`${referenceName} references missing ID ${id}`)
  }

  return entity
}
