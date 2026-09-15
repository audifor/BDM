import { parseGameDate } from '@/domain/date'
import { createGame, type CompletedGame, type Game, type GameStakes } from '@/domain/game'
import {
  competitionIdFromString,
  gameIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import {
  attachWorldDbCompetitionRuntime,
  EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  updateGameWorld,
  type GameWorld,
  type WorldDbCompetitionRuntime,
} from '@/domain/world'
import { createWorldDbCompetitionRulesV1 } from '@/engine/competition/WorldDbCompetitionRules'
import { reconstructWorldDbCompetitionProgressionV1 } from '@/engine/competition/WorldDbCompetitionProgressionReconstructor'
import type {
  WorldDbCompetitionPlanningContextV1,
  WorldDbPhysicalGamePlanningResultV1,
} from '@/engine/competition/WorldDbPhysicalGamePlanner'

const STAKES_PRIORITY: Readonly<Record<GameStakes, number>> = Object.freeze({
  regular: 0,
  important: 1,
  elimination: 2,
  final: 3,
})

export interface WorldDbGameMaterializationResultV1 {
  readonly world: GameWorld
  readonly plan: WorldDbPhysicalGamePlanningResultV1
  /** Virtual SERIES/AGGREGATE fixtures that must expand before physical Games can exist. */
  readonly deferredCompetitionFixtureIds: readonly string[]
}

/**
 * Materializes executable B04/B12 physical games into GameWorld.
 *
 * Before the final plan is materialized, result-driven B04 structure positions are reconstructed
 * from completed Games already present in the save. The reconstruction is deterministic and does
 * not persist derived Game↔Fixture bindings or bracket positions in Save V4.
 *
 * The physical planner remains the source of deterministic Game identity and in-memory N:M
 * Game↔Fixture bindings. Virtual SERIES/AGGREGATE fixtures are deferred until an expansion layer
 * creates their physical games.
 */
export function materializeWorldDbPhysicalGamesV1(
  world: GameWorld,
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  asOf: string,
): WorldDbGameMaterializationResultV1 {
  const completedGames = Object.values(world.games)
    .filter((game): game is CompletedGame => game.status === 'completed')
  const reconstruction = reconstructWorldDbCompetitionProgressionV1(
    contexts,
    completedGames,
    asOf,
  )
  const resolvedContexts = reconstruction.contexts
  const plan = reconstruction.plan
  const gamesById = { ...world.games } as Record<string, Game>
  const deferredFixtureIds = new Set<string>()

  for (const planned of plan.games) {
    if (planned.localDate === null) continue

    // A canonical B12 physical match already represents a concrete game. Expansion is required only
    // for newly planned virtual fixtures that still represent a multi-game contest.
    const expansionRequired = planned.sourceMatchId === null
      ? planned.competitionFixtureIds.filter((fixtureId) =>
          fixtureRequiresPhysicalExpansion(resolvedContexts, fixtureId),
        )
      : []

    if (expansionRequired.length > 0) {
      for (const fixtureId of expansionRequired) deferredFixtureIds.add(fixtureId)
      continue
    }

    const id = gameIdFromString(planned.gameId)
    const seasonId = seasonIdFromString(planned.seasonId)
    const competitionId = competitionIdFromString(planned.competitionId)
    const date = parseGameDate(planned.localDate)
    const homeTeamId = teamIdFromString(planned.homeTeamId)
    const awayTeamId = teamIdFromString(planned.awayTeamId)
    const stakes = deriveWorldDbPhysicalGameStakesV1(resolvedContexts, planned.competitionFixtureIds)
    const existing = world.games[id]

    if (existing !== undefined) {
      assertSamePhysicalGame(existing, { seasonId, competitionId, date, homeTeamId, awayTeamId })
      gamesById[id] = createGame({
        id,
        seasonId,
        competitionId,
        date,
        homeTeamId,
        awayTeamId,
        status: existing.status,
        result: existing.result,
        ...(existing.classification === undefined ? {} : { classification: existing.classification }),
        stakes,
      })
    } else {
      gamesById[id] = createGame({
        id,
        seasonId,
        competitionId,
        date,
        homeTeamId,
        awayTeamId,
        status: 'scheduled',
        result: null,
        stakes,
      })
    }
  }

  const updatedWorld = updateGameWorld(world, { games: Object.values(gamesById) })
  const runtime = world.worldDbCompetitionRuntime ?? EMPTY_WORLD_DB_COMPETITION_RUNTIME
  const nextRuntime: WorldDbCompetitionRuntime = Object.freeze({
    competitionRuntimeBundle: runtime.competitionRuntimeBundle,
    competitionPlanIds: runtime.competitionPlanIds,
    competitionSeasonIds: mergeCompetitionSeasonIds(runtime.competitionSeasonIds, resolvedContexts),
  })

  return Object.freeze({
    world: attachWorldDbCompetitionRuntime(updatedWorld, nextRuntime),
    plan,
    deferredCompetitionFixtureIds: Object.freeze([...deferredFixtureIds].sort()),
  })
}

/** Derives Game stakes from B04 structure/progression, never from display names. */
export function deriveWorldDbPhysicalGameStakesV1(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  competitionFixtureIds: readonly string[],
): GameStakes {
  if (competitionFixtureIds.length === 0) {
    throw new Error('Physical game requires at least one competition fixture')
  }

  const fixtureIndex = buildFixtureIndex(contexts)
  let result: GameStakes = 'regular'

  for (const fixtureId of competitionFixtureIds) {
    const ref = fixtureIndex[fixtureId]
    if (ref === undefined) {
      throw new Error(`Physical game references unloaded competition fixture: ${fixtureId}`)
    }

    const fixture = ref.context.bundle.fixtures.find(
      (row) => row.competitionFixtureId === fixtureId,
    )!
    if (fixture.structureNodeId === null) continue

    const node = ref.context.bundle.structureNodes.find(
      (row) => row.competitionStructureNodeId === fixture.structureNodeId,
    )
    if (node === undefined) {
      throw new Error(
        `Competition fixture ${fixtureId} references missing structure node ${fixture.structureNodeId}`,
      )
    }

    const nodeType = node.nodeType.toUpperCase()
    let stakes: GameStakes

    if (nodeType === 'STAGE' || nodeType === 'GROUP' || nodeType === 'SUBDIVISION') {
      stakes = 'regular'
    } else if (nodeType === 'ROUND' || nodeType === 'SERIES' || nodeType === 'BRACKET') {
      const rules = createWorldDbCompetitionRulesV1(ref.context.bundle)
      const hasOutgoingProgression = rules.progressionRules.some(
        (rule) => rule.scopeStructureNodeId === node.competitionStructureNodeId,
      )
      stakes = hasOutgoingProgression ? 'elimination' : 'final'
    } else {
      throw new Error(`Unsupported B04 structure node type for Game stakes: ${node.nodeType}`)
    }

    if (STAKES_PRIORITY[stakes] > STAKES_PRIORITY[result]) result = stakes
  }

  return result
}

/** True when a virtual competition fixture represents a multi-game contest, not one physical Game. */
export function fixtureRequiresPhysicalExpansion(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  competitionFixtureId: string,
): boolean {
  const ref = buildFixtureIndex(contexts)[competitionFixtureId]
  if (ref === undefined) {
    throw new Error(`Physical expansion references unloaded competition fixture: ${competitionFixtureId}`)
  }

  const fixture = ref.context.bundle.fixtures.find(
    (row) => row.competitionFixtureId === competitionFixtureId,
  )!
  if (fixture.structureNodeId === null) return false

  const formats = createWorldDbCompetitionRulesV1(ref.context.bundle).contestFormats.filter(
    (rule) => rule.scopeStructureNodeId === fixture.structureNodeId,
  )
  if (formats.length > 1) {
    throw new Error(`Structure node ${fixture.structureNodeId} has multiple contest formats`)
  }

  const type = formats[0]?.type?.toUpperCase()
  return type === 'SERIES' || type === 'AGGREGATE'
}

function buildFixtureIndex(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
): Readonly<Record<string, { readonly context: WorldDbCompetitionPlanningContextV1 }>> {
  const result: Record<string, { readonly context: WorldDbCompetitionPlanningContextV1 }> = {}
  for (const context of contexts) {
    for (const fixture of context.bundle.fixtures) {
      if (result[fixture.competitionFixtureId] !== undefined) {
        throw new Error(
          `Duplicate competition fixture across planning contexts: ${fixture.competitionFixtureId}`,
        )
      }
      result[fixture.competitionFixtureId] = Object.freeze({ context })
    }
  }
  return Object.freeze(result)
}

function assertSamePhysicalGame(
  existing: Game,
  expected: Pick<Game, 'seasonId' | 'competitionId' | 'date' | 'homeTeamId' | 'awayTeamId'>,
): void {
  if (
    existing.seasonId !== expected.seasonId
    || existing.competitionId !== expected.competitionId
    || existing.date !== expected.date
    || existing.homeTeamId !== expected.homeTeamId
    || existing.awayTeamId !== expected.awayTeamId
  ) {
    throw new Error(`World DB physical game identity conflicts with existing Game: ${existing.id}`)
  }
}

function mergeCompetitionSeasonIds(
  existing: readonly string[],
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
): readonly string[] {
  const ids = new Set(existing)
  for (const context of contexts) {
    ids.add(context.bundle.competitionSeason.competitionSeasonId)
  }
  return Object.freeze([...ids].sort())
}
