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
import { calculateSeasonStandings, type Season, type SeasonHistoryRecord } from '@/domain/season'
import type { Team } from '@/domain/team'
import type { MatchStatLog } from '@/domain/stats/MatchStatLog'

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
  readonly matchStatLogsByGameId: Readonly<Record<GameId, MatchStatLog>>
  readonly seasonHistoryBySeasonId: Readonly<Record<SeasonId, SeasonHistoryRecord>>
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
  matchStatLogs?: readonly MatchStatLog[]
  seasonHistory?: readonly SeasonHistoryRecord[]
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
    matchStatLogsByGameId: indexLogsByGameId(input.matchStatLogs ?? []),
    seasonHistoryBySeasonId: indexHistoryBySeasonId(input.seasonHistory ?? []),
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
  for (const log of Object.values(world.matchStatLogsByGameId)) validateMatchStatLog(world, log)
  for (const history of Object.values(world.seasonHistoryBySeasonId)) validateSeasonHistory(world, history)
}

function validateSeasonHistory(world: GameWorld, history: SeasonHistoryRecord): void {
  const season = requireEntity(world.seasons, history.seasonId, 'Season history season')
  const competition = requireEntity(world.competitions, history.competitionId, 'Season history competition')
  if (season.competitionId !== competition.id) throw new GameWorldValidationError(`Season history ${history.seasonId} competition does not match Season`)
  if (!Object.values(world.games).filter((game) => game.seasonId === season.id).every((game) => game.status === 'completed')) throw new GameWorldValidationError(`Season history ${history.seasonId} requires completed Games`)
  if (!competition.participantTeamIds.includes(history.championTeamId)) throw new GameWorldValidationError(`Season history ${history.seasonId} champion is not a participant`)
  if (history.finalStandings.length !== competition.participantTeamIds.length) throw new GameWorldValidationError(`Season history ${history.seasonId} standings must contain every participant`)
  const teams = new Set<TeamId>(); const positions = new Set<number>()
  for (const line of history.finalStandings) {
    if (!competition.participantTeamIds.includes(line.teamId) || teams.has(line.teamId)) throw new GameWorldValidationError(`Season history ${history.seasonId} has invalid standings teams`)
    if (!Number.isInteger(line.position) || line.position < 1 || line.position > competition.participantTeamIds.length || positions.has(line.position)) throw new GameWorldValidationError(`Season history ${history.seasonId} has invalid standings positions`)
    teams.add(line.teamId); positions.add(line.position)
  }
  if (history.finalStandings.find((line) => line.position === 1)?.teamId !== history.championTeamId) throw new GameWorldValidationError(`Season history ${history.seasonId} champion must be first`)
  const expected = calculateSeasonStandings(world, history.seasonId)
  if (history.finalStandings.length !== expected.length || history.finalStandings.some((line, index) => !sameStanding(line, expected[index]!))) throw new GameWorldValidationError(`Season history ${history.seasonId} standings do not match completed Games`)
}

function sameStanding(a: SeasonHistoryRecord['finalStandings'][number], b: SeasonHistoryRecord['finalStandings'][number]): boolean {
  return a.position === b.position && a.teamId === b.teamId && a.played === b.played && a.wins === b.wins && a.losses === b.losses && a.pointsFor === b.pointsFor && a.pointsAgainst === b.pointsAgainst && a.pointDifference === b.pointDifference
}

function validateMatchStatLog(world: GameWorld, log: MatchStatLog): void {
  const game = requireEntity(world.games, log.gameId, 'MatchStatLog game')
  if (game.status !== 'completed' || game.result === null) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} requires completed Game`)
  if (log.homeTeamId !== game.homeTeamId || log.awayTeamId !== game.awayTeamId || log.competitionId !== game.competitionId || log.seasonId !== game.seasonId || log.gameDate !== game.date) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} metadata does not match Game`)
  if (log.finalScore.home !== game.result.homeScore || log.finalScore.away !== game.result.awayScore) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} score does not match Game`)
  const players = new Set<PlayerId>()
  for (const line of log.playerLines) {
    requireEntity(world.players, line.playerId, `MatchStatLog ${log.gameId} Player`)
    if (players.has(line.playerId)) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} has duplicate Player ${line.playerId}`)
    players.add(line.playerId)
    if (!((line.teamId === log.homeTeamId && line.opponentTeamId === log.awayTeamId && line.isHome) || (line.teamId === log.awayTeamId && line.opponentTeamId === log.homeTeamId && !line.isHome))) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} has invalid Team context`)
  }
  const homeLines = log.playerLines.filter((line) => line.isHome)
  const awayLines = log.playerLines.filter((line) => !line.isHome)
  if (homeLines.reduce((sum, line) => sum + line.stats.points, 0) !== log.finalScore.home || awayLines.reduce((sum, line) => sum + line.stats.points, 0) !== log.finalScore.away) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} player points do not match score`)
  if (homeLines.filter((line) => line.started).length !== 5 || awayLines.filter((line) => line.started).length !== 5) throw new GameWorldValidationError(`MatchStatLog ${log.gameId} requires five starters per Team`)
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

function indexLogsByGameId(logs: readonly MatchStatLog[]): Readonly<Record<GameId, MatchStatLog>> {
  const indexed = Object.create(null) as Record<GameId, MatchStatLog>
  for (const log of logs) {
    if (Object.hasOwn(indexed, log.gameId)) throw new GameWorldValidationError(`Duplicate MatchStatLog Game ID: ${log.gameId}`)
    indexed[log.gameId] = log
  }
  return Object.freeze(indexed)
}

function indexHistoryBySeasonId(history: readonly SeasonHistoryRecord[]): Readonly<Record<SeasonId, SeasonHistoryRecord>> {
  const indexed = Object.create(null) as Record<SeasonId, SeasonHistoryRecord>
  for (const record of history) {
    if (Object.hasOwn(indexed, record.seasonId)) throw new GameWorldValidationError(`Duplicate Season history ID: ${record.seasonId}`)
    indexed[record.seasonId] = record
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
