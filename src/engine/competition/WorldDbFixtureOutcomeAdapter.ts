import type { CompletedGame } from '@/domain/game/Game'
import type { WorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import type { WorldDbResolvedFixtureV1 } from './WorldDbFixtureResolver'
import type { WorldDbFixtureOutcomeV1 } from './WorldDbProgressionResolver'
import type { WorldDbGameFixtureBindingIndexV1 } from './WorldDbGameFixtureBinding'

/**
 * Converts completed physical Games into competition-fixture outcomes for one loaded competition
 * season.
 *
 * The adapter is intentionally N:M: one physical Game may realize several competition fixtures,
 * including fixtures from other competition-season runtimes. Foreign fixture bindings are ignored
 * by this runtime. Multiple completed Games realizing the same local fixture are rejected until
 * realization authority/status is carried into the runtime projection.
 */
export function adaptCompletedGamesToWorldDbFixtureOutcomesV1(
  runtime: WorldDbCompetitionRuntimeV1,
  bindingIndex: WorldDbGameFixtureBindingIndexV1,
  resolvedFixtures: readonly WorldDbResolvedFixtureV1[],
  games: readonly CompletedGame[],
): readonly WorldDbFixtureOutcomeV1[] {
  const resolvedFixtureById = uniqueIndex(
    resolvedFixtures,
    (fixture) => fixture.competitionFixtureId,
    'resolved fixture',
  )
  const localFixtureIds = new Set(runtime.bundle.fixtures.map((fixture) => fixture.competitionFixtureId))
  const outcomeByFixtureId: Record<string, WorldDbFixtureOutcomeV1> = {}

  for (const game of games) {
    const fixtureIds = bindingIndex.fixtureIdsByGameId[game.id] ?? []
    for (const fixtureId of fixtureIds) {
      if (!localFixtureIds.has(fixtureId)) continue

      const resolvedFixture = resolvedFixtureById[fixtureId]
      if (resolvedFixture === undefined) throw new Error(`Resolved fixture not found: ${fixtureId}`)
      if (!resolvedFixture.ready) throw new Error(`Fixture is not ready for Game outcome adaptation: ${fixtureId}`)
      if (outcomeByFixtureId[fixtureId] !== undefined) {
        throw new Error(`Multiple completed Games realize fixture ${fixtureId}; authoritative realization is ambiguous`)
      }
      if (game.result.homeScore === game.result.awayScore) {
        throw new Error(`Cannot derive winner and loser from tied Game ${game.id}`)
      }

      const resolvedEntries = resolvedFixture.sides
        .map((side) => side.competitionSeasonEntryId)
        .filter((entryId): entryId is string => entryId !== null)
      if (resolvedEntries.length !== 2) {
        throw new Error(`Fixture ${fixtureId} must resolve exactly two entries before outcome adaptation`)
      }

      const homeEntryId = entryIdForTeam(runtime, resolvedEntries, game.homeTeamId)
      const awayEntryId = entryIdForTeam(runtime, resolvedEntries, game.awayTeamId)
      if (homeEntryId === awayEntryId) {
        throw new Error(`Game ${game.id} maps both teams to the same competition entry`)
      }

      const homeWon = game.result.homeScore > game.result.awayScore
      outcomeByFixtureId[fixtureId] = Object.freeze({
        competitionFixtureId: fixtureId,
        winnerEntryId: homeWon ? homeEntryId : awayEntryId,
        loserEntryId: homeWon ? awayEntryId : homeEntryId,
      })
    }
  }

  return Object.freeze(Object.values(outcomeByFixtureId))
}

function entryIdForTeam(
  runtime: WorldDbCompetitionRuntimeV1,
  candidateEntryIds: readonly string[],
  teamId: string,
): string {
  const matches = candidateEntryIds.filter((entryId) => runtime.entryById[entryId]?.teamId === teamId)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one competition entry for team ${teamId}; found ${matches.length}`)
  }
  return matches[0]!
}

function uniqueIndex<T>(values: readonly T[], keyOf: (value: T) => string, label: string): Record<string, T> {
  const result: Record<string, T> = {}
  for (const value of values) {
    const key = keyOf(value)
    if (result[key] !== undefined) throw new Error(`Duplicate ${label}: ${key}`)
    result[key] = value
  }
  return result
}
