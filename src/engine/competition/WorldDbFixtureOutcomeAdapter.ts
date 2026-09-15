import type { CompletedGame } from '@/domain/game'
import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbGameFixtureBindingIndexV1 } from './WorldDbGameFixtureBinding'
import type { WorldDbFixtureOutcomeV1 } from './WorldDbProgressionResolver'

/**
 * Derives result-driven B04 fixture outcomes for one competition season from completed physical
 * Games and the planner's N:M Game↔Fixture binding index.
 *
 * Fixture sides do not need to be resolved first. This is intentional: after loading a save, a
 * downstream fixture may be waiting on progression positions even though its completed Game is
 * already persisted. The explicit Game↔Fixture realization plus the Game's teams is sufficient to
 * recover the local competition entries without guessing bracket wiring.
 */
export function adaptCompletedGamesToWorldDbFixtureOutcomesV1(
  runtime: WorldDbCompetitionRuntimeV1,
  bindingIndex: WorldDbGameFixtureBindingIndexV1,
  games: readonly CompletedGame[],
): readonly WorldDbFixtureOutcomeV1[] {
  const completedGameById = uniqueIndex(games, (game) => game.id, 'completed Game')
  const entryIdsByTeamId = indexEntryIdsByTeamId(runtime)
  const outcomes: WorldDbFixtureOutcomeV1[] = []

  for (const fixture of [...runtime.bundle.fixtures].sort((left, right) =>
    left.competitionFixtureId.localeCompare(right.competitionFixtureId))) {
    const gameIds = bindingIndex.gameIdsByFixtureId[fixture.competitionFixtureId] ?? []
    const completed = gameIds
      .map((gameId) => completedGameById[gameId])
      .filter((game): game is CompletedGame => game !== undefined)

    if (completed.length === 0) continue
    if (completed.length > 1) {
      throw new Error(
        `Multiple completed Games realize fixture ${fixture.competitionFixtureId}; authoritative realization is ambiguous`,
      )
    }

    const game = completed[0]!
    if (game.result.homeScore === game.result.awayScore) {
      throw new Error(`Cannot derive winner and loser from tied Game ${game.id}`)
    }

    const homeEntryId = requireSingleEntryForTeam(entryIdsByTeamId, game.homeTeamId)
    const awayEntryId = requireSingleEntryForTeam(entryIdsByTeamId, game.awayTeamId)
    if (homeEntryId === awayEntryId) {
      throw new Error(`Game ${game.id} maps both teams to the same competition entry`)
    }

    const homeWon = game.result.homeScore > game.result.awayScore
    outcomes.push(Object.freeze({
      competitionFixtureId: fixture.competitionFixtureId,
      winnerEntryId: homeWon ? homeEntryId : awayEntryId,
      loserEntryId: homeWon ? awayEntryId : homeEntryId,
    }))
  }

  return Object.freeze(outcomes)
}

function indexEntryIdsByTeamId(
  runtime: WorldDbCompetitionRuntimeV1,
): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, string[]> = {}
  for (const entry of runtime.bundle.entries) {
    if (entry.teamId === null) continue
    ;(result[entry.teamId] ??= []).push(entry.competitionSeasonEntryId)
  }
  for (const values of Object.values(result)) values.sort()
  return Object.freeze(result)
}

function requireSingleEntryForTeam(
  entryIdsByTeamId: Readonly<Record<string, readonly string[]>>,
  teamId: string,
): string {
  const matches = entryIdsByTeamId[teamId] ?? []
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one competition entry for team ${teamId}; found ${matches.length}`)
  }
  return matches[0]!
}

function uniqueIndex<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  label: string,
): Readonly<Record<string, T>> {
  const result: Record<string, T> = {}
  for (const value of values) {
    const key = keyOf(value)
    if (result[key] !== undefined) throw new Error(`Duplicate ${label}: ${key}`)
    result[key] = value
  }
  return Object.freeze(result)
}
