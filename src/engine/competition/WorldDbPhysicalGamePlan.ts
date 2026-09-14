import { createGame, type Game, type GameStakes, type ScheduledGame } from '@/domain/game'

import type { WorldDbCompetitionExecutionV1 } from './WorldDbCompletedGameRealization'
import type { WorldDbGameInstanceFixtureBindingV1 } from './WorldDbGameInstanceFixtureBinding'

export interface WorldDbInstanceFixtureRefV1 {
  readonly competitionSeasonId: string
  readonly instanceFixtureId: string
}

export interface WorldDbPhysicalGamePlanV1 {
  readonly primaryCompetitionSeasonId: string
  readonly primaryCompetitionId: string
  readonly primarySeasonId: string
  readonly homeTeamId: string
  readonly awayTeamId: string
  readonly realizations: readonly WorldDbInstanceFixtureRefV1[]
}

export interface MaterializeWorldDbPhysicalGameV1Input {
  readonly gameId: Game['id']
  readonly date: Game['date']
  readonly stakes: GameStakes
}

export interface MaterializedWorldDbPhysicalGameV1 {
  readonly game: ScheduledGame
  readonly bindings: readonly WorldDbGameInstanceFixtureBindingV1[]
}

/**
 * Coalesces one or more competition-instance fixtures into a single physical Game plan.
 * `primaryCompetitionSeasonId` exists only for the legacy singular Game.competitionId/seasonId
 * fields. Every competitive meaning is retained independently in `realizations`.
 */
export function createWorldDbPhysicalGamePlanV1(
  executionByCompetitionSeasonId: Readonly<Record<string, WorldDbCompetitionExecutionV1>>,
  realizations: readonly WorldDbInstanceFixtureRefV1[],
  primaryCompetitionSeasonId: string,
): WorldDbPhysicalGamePlanV1 {
  if (realizations.length === 0) throw new RangeError('Physical Game plan requires at least one competition realization')
  const primarySeason = requireText(primaryCompetitionSeasonId, 'Primary competition season id')
  const normalized = realizations.map((realization) => Object.freeze({
    competitionSeasonId: requireText(realization.competitionSeasonId, 'Realization competition season id'),
    instanceFixtureId: requireText(realization.instanceFixtureId, 'Realization instance fixture id'),
  }))
  const keys = new Set<string>()
  for (const realization of normalized) {
    const key = `${realization.competitionSeasonId}\u0000${realization.instanceFixtureId}`
    if (keys.has(key)) throw new Error(`Duplicate physical Game realization: ${realization.competitionSeasonId}/${realization.instanceFixtureId}`)
    keys.add(key)
  }
  if (!normalized.some((realization) => realization.competitionSeasonId === primarySeason)) {
    throw new Error(`Primary competition season ${primarySeason} is not represented by the physical Game plan`)
  }

  let homeTeamId: string | undefined
  let awayTeamId: string | undefined
  for (const realization of normalized) {
    const execution = executionByCompetitionSeasonId[realization.competitionSeasonId]
    if (execution === undefined) throw new Error(`Competition execution not found: ${realization.competitionSeasonId}`)
    const fixture = execution.instance.fixtures.find((candidate) => candidate.instanceFixtureId === realization.instanceFixtureId)
    if (fixture === undefined) {
      throw new Error(`Competition instance fixture not found: ${realization.competitionSeasonId}/${realization.instanceFixtureId}`)
    }
    if (homeTeamId === undefined) {
      homeTeamId = fixture.homeTeamId
      awayTeamId = fixture.awayTeamId
      continue
    }
    if (fixture.homeTeamId !== homeTeamId || fixture.awayTeamId !== awayTeamId) {
      throw new Error(
        `Physical Game realizations disagree on teams: expected ${homeTeamId}/${awayTeamId}, got ${fixture.homeTeamId}/${fixture.awayTeamId}`,
      )
    }
  }

  const primary = executionByCompetitionSeasonId[primarySeason]
  if (primary === undefined) throw new Error(`Primary competition execution not found: ${primarySeason}`)

  return Object.freeze({
    primaryCompetitionSeasonId: primarySeason,
    primaryCompetitionId: primary.runtime.bundle.competitionSeason.competitionId,
    primarySeasonId: primary.runtime.bundle.competitionSeason.seasonId,
    homeTeamId: homeTeamId!,
    awayTeamId: awayTeamId!,
    realizations: Object.freeze(normalized),
  })
}

/**
 * Materializes a scheduled physical Game only after an external calendar service supplies a date.
 * No competition timing is guessed by this layer.
 */
export function materializeWorldDbPhysicalGameV1(
  plan: WorldDbPhysicalGamePlanV1,
  input: MaterializeWorldDbPhysicalGameV1Input,
): MaterializedWorldDbPhysicalGameV1 {
  const game = createGame({
    id: input.gameId,
    seasonId: plan.primarySeasonId as Game['seasonId'],
    competitionId: plan.primaryCompetitionId as Game['competitionId'],
    date: input.date,
    homeTeamId: plan.homeTeamId as Game['homeTeamId'],
    awayTeamId: plan.awayTeamId as Game['awayTeamId'],
    stakes: input.stakes,
    status: 'scheduled',
    result: null,
  })
  if (game.status !== 'scheduled') throw new Error('Physical Game materialization unexpectedly produced a completed Game')

  return Object.freeze({
    game,
    bindings: Object.freeze(plan.realizations.map((realization) => Object.freeze({
      gameId: game.id,
      competitionSeasonId: realization.competitionSeasonId,
      instanceFixtureId: realization.instanceFixtureId,
    }))),
  })
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
  return value
}
