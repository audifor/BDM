import { parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, GameId, SeasonId, TeamId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export type GameStatus = 'scheduled' | 'completed'
export type GameClassification = 'conference' | 'nonConference'
/** Canonical competitive stakes. Schedulers default to regular until a format supplies a higher phase. */
export type GameStakes = 'regular' | 'important' | 'elimination' | 'final'

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
  readonly neutralSite?: boolean
  readonly classification?: GameClassification
  readonly stakes: GameStakes
  /** Key of the B04 competition-format node represented by this game. */
  readonly competitionStageKey?: string
  /** Deterministic virtual bracket fixture for a dynamically materialized series game. */
  readonly postseasonFixtureId?: string
  readonly postseasonGameNo?: number
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
  neutralSite?: boolean
  status: GameStatus
  result: GameResult | null
  classification?: GameClassification
  stakes?: GameStakes
  competitionStageKey?: string
  postseasonFixtureId?: string
  postseasonGameNo?: number
}

export function createGame(input: CreateGameInput): Game {
  if (input.neutralSite !== undefined && typeof input.neutralSite !== 'boolean') throw new TypeError('Game neutralSite must be boolean')
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
    ...(input.neutralSite === undefined ? {} : { neutralSite: input.neutralSite }),
    ...(input.classification === undefined ? {} : { classification: input.classification === 'conference' || input.classification === 'nonConference' ? input.classification : (() => { throw new TypeError('Game classification is invalid') })() }),
    stakes: input.stakes ?? 'regular',
    ...(input.competitionStageKey === undefined ? {} : { competitionStageKey: requireNonEmptyString(input.competitionStageKey, 'Game competition stage key') }),
    ...(input.postseasonFixtureId === undefined ? {} : { postseasonFixtureId: requireNonEmptyString(input.postseasonFixtureId, 'Game postseason fixture id') }),
    ...(input.postseasonGameNo === undefined ? {} : { postseasonGameNo: input.postseasonGameNo }),
  }

  if (!['regular', 'important', 'elimination', 'final'].includes(base.stakes)) throw new TypeError('Game stakes are invalid')
  if ((base.postseasonFixtureId === undefined) !== (base.postseasonGameNo === undefined)) throw new TypeError('Postseason fixture and game number must be provided together')
  if (base.postseasonGameNo !== undefined && (!Number.isInteger(base.postseasonGameNo) || base.postseasonGameNo < 1)) throw new RangeError('Postseason game number must be a positive integer')
  if (base.postseasonFixtureId !== undefined && base.competitionStageKey === undefined) throw new TypeError('Postseason games require a competition stage key')


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
