import type { Game } from '@/domain/game'

import { applyWorldDbCompetitionInstanceOutcomesV1 } from './WorldDbCompetitionInstanceProgression'
import type { WorldDbCompetitionInstanceV1, WorldDbInstanceFixtureV1 } from './WorldDbCompetitionInstance'
import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import type { WorldDbGameInstanceFixtureBindingIndexV1 } from './WorldDbGameInstanceFixtureBinding'

export interface WorldDbCompetitionExecutionV1 {
  readonly runtime: WorldDbCompetitionRuntimeV1
  readonly rules: WorldDbCompetitionRulesV1
  readonly instance: WorldDbCompetitionInstanceV1
}

export interface WorldDbCompletedGameRealizationResultV1 {
  readonly executionByCompetitionSeasonId: Readonly<Record<string, WorldDbCompetitionExecutionV1>>
  readonly newInstanceFixtureIdsByCompetitionSeasonId: Readonly<Record<string, readonly string[]>>
}

/**
 * Applies one canonical completed physical Game to every competition instance fixture it realizes.
 * This is the result boundary between MatchEngine/B12 and declarative World DB competition runtime.
 * No scheduling or persistence policy is embedded here.
 */
export function applyCompletedGameToWorldDbCompetitionInstancesV1(
  game: Game,
  executionByCompetitionSeasonId: Readonly<Record<string, WorldDbCompetitionExecutionV1>>,
  bindingIndex: WorldDbGameInstanceFixtureBindingIndexV1,
): WorldDbCompletedGameRealizationResultV1 {
  if (game.status !== 'completed' || game.result === null) {
    throw new Error(`World DB competition realization requires completed Game ${game.id}`)
  }
  if (game.result.homeScore === game.result.awayScore) {
    throw new Error(`World DB competition realization cannot resolve tied Game ${game.id}`)
  }

  const bindings = bindingIndex.bindingsByGameId[game.id] ?? []
  if (bindings.length === 0) {
    return Object.freeze({
      executionByCompetitionSeasonId,
      newInstanceFixtureIdsByCompetitionSeasonId: Object.freeze({}),
    })
  }

  const grouped = groupBindingsByCompetitionSeason(bindings)
  const nextExecutions: Record<string, WorldDbCompetitionExecutionV1> = { ...executionByCompetitionSeasonId }
  const newFixtureIds: Record<string, readonly string[]> = {}

  for (const [competitionSeasonId, seasonBindings] of Object.entries(grouped)) {
    const execution = executionByCompetitionSeasonId[competitionSeasonId]
    if (execution === undefined) {
      throw new Error(`World DB competition execution not found: ${competitionSeasonId}`)
    }
    if (execution.instance.competitionSeasonId !== competitionSeasonId) {
      throw new Error(`World DB competition execution key does not match instance season: ${competitionSeasonId}`)
    }
    if (execution.runtime.bundle.competitionSeason.competitionSeasonId !== competitionSeasonId) {
      throw new Error(`World DB competition execution runtime does not match instance season: ${competitionSeasonId}`)
    }

    const fixtureById = Object.fromEntries(execution.instance.fixtures.map((fixture) => [fixture.instanceFixtureId, fixture]))
    const outcomes = seasonBindings.map((binding) => {
      const fixture = fixtureById[binding.instanceFixtureId]
      if (fixture === undefined) {
        throw new Error(`Bound competition instance fixture not found: ${competitionSeasonId}/${binding.instanceFixtureId}`)
      }
      validateGameMatchesFixture(game, fixture)
      const homeWon = game.result!.homeScore > game.result!.awayScore
      return Object.freeze({
        instanceFixtureId: fixture.instanceFixtureId,
        winnerTeamId: homeWon ? fixture.homeTeamId : fixture.awayTeamId,
        loserTeamId: homeWon ? fixture.awayTeamId : fixture.homeTeamId,
      })
    })

    const beforeFixtureIds = new Set(execution.instance.fixtures.map((fixture) => fixture.instanceFixtureId))
    const instance = applyWorldDbCompetitionInstanceOutcomesV1(
      execution.runtime,
      execution.rules,
      execution.instance,
      { outcomes },
    )
    const created = instance.fixtures
      .map((fixture) => fixture.instanceFixtureId)
      .filter((fixtureId) => !beforeFixtureIds.has(fixtureId))

    nextExecutions[competitionSeasonId] = Object.freeze({ ...execution, instance })
    if (created.length > 0) newFixtureIds[competitionSeasonId] = Object.freeze(created)
  }

  return Object.freeze({
    executionByCompetitionSeasonId: Object.freeze(nextExecutions),
    newInstanceFixtureIdsByCompetitionSeasonId: Object.freeze(newFixtureIds),
  })
}

function validateGameMatchesFixture(game: Game, fixture: WorldDbInstanceFixtureV1): void {
  if (game.homeTeamId !== fixture.homeTeamId || game.awayTeamId !== fixture.awayTeamId) {
    throw new Error(
      `Game ${game.id} teams ${game.homeTeamId}/${game.awayTeamId} do not match instance fixture ${fixture.instanceFixtureId} teams ${fixture.homeTeamId}/${fixture.awayTeamId}`,
    )
  }
}

function groupBindingsByCompetitionSeason(
  bindings: readonly { readonly competitionSeasonId: string; readonly instanceFixtureId: string }[],
): Record<string, typeof bindings[number][]> {
  const result: Record<string, typeof bindings[number][]> = {}
  for (const binding of bindings) (result[binding.competitionSeasonId] ??= []).push(binding)
  return result
}
