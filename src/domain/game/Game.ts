import { parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, GameId, SeasonId, TeamId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export type GameStatus = 'scheduled' | 'completed'
export type GameClassification = 'conference' | 'nonConference'

export interface GameResult {
  readonly homeScore: number
  readonly awayScore: number
}

interface GameBase {
  readonly id: GameId
  readonly seasonId: SeasonId
  readonly competitionId: CompetitionId
  readonly date: GameDate
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly classification?: GameClassification
}

export interface ScheduledGame extends GameBase {
  readonly status: 'scheduled'
  readonly result: null
}

export interface CompletedGame extends GameBase {
  readonly status: 'completed'
  readonly result: GameResult
}

export type Game = ScheduledGame | CompletedGame

export interface CreateGameInput {
  id: GameId
  seasonId: SeasonId
  competitionId: CompetitionId
  date: GameDate
  homeTeamId: TeamId
  awayTeamId: TeamId
  status: GameStatus
  result: GameResult | null
  classification?: GameClassification
}

export function createGame(input: CreateGameInput): Game {
  const homeTeamId = requireNonEmptyString(input.homeTeamId, 'Game home team id') as TeamId
  const awayTeamId = requireNonEmptyString(input.awayTeamId, 'Game away team id') as TeamId

  if (homeTeamId === awayTeamId) {
    throw new RangeError('Game home and away teams must differ')
  }

  const base: GameBase = {
    id: requireNonEmptyString(input.id, 'Game id') as GameId,
    seasonId: requireNonEmptyString(input.seasonId, 'Game season id') as SeasonId,
    competitionId: requireNonEmptyString(input.competitionId, 'Game competition id') as CompetitionId,
    date: parseGameDate(input.date),
    homeTeamId,
    awayTeamId,
    ...(input.classification === undefined ? {} : { classification: input.classification === 'conference' || input.classification === 'nonConference' ? input.classification : (() => { throw new TypeError('Game classification is invalid') })() }),
  }

  if (input.status === 'scheduled') {
    if (input.result !== null) {
      throw new RangeError('Scheduled games must not have a result')
    }

    return { ...base, status: 'scheduled', result: null }
  }

  if (input.status === 'completed') {
    if (input.result === null) {
      throw new RangeError('Completed games require a result')
    }

    return { ...base, status: 'completed', result: validateResult(input.result) }
  }

  throw new TypeError('Game status must be scheduled or completed')
}

function validateResult(result: GameResult): GameResult {
  if (!Number.isInteger(result.homeScore) || result.homeScore < 0) {
    throw new RangeError('Game home score must be a non-negative integer')
  }

  if (!Number.isInteger(result.awayScore) || result.awayScore < 0) {
    throw new RangeError('Game away score must be a non-negative integer')
  }

  return { homeScore: result.homeScore, awayScore: result.awayScore }
}
