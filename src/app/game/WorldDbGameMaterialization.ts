import { parseGameDate } from '@/domain/date'
import { createGame, type Game, type GameStakes } from '@/domain/game'
import {
  competitionIdFromString,
  gameIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import {
  getWorldDbCompetitionRuntimeStateV1,
  withWorldDbCompetitionRuntimeStateV1,
  type WorldDbCompetitionGameFixtureBindingV1,
  type WorldDbCompetitionRuntimeStateV1,
  type WorldDbCompetitionSeasonSourceV1,
} from '@/domain/worldDb/CompetitionRuntimeState'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createWorldDbCompetitionRulesV1 } from '@/engine/competition/WorldDbCompetitionRules'
import {
  planWorldDbPhysicalGamesV1,
  type WorldDbCompetitionPlanningContextV1,
  type WorldDbPhysicalGamePlanningResultV1,
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
  /** Virtual SERIES/AGGREGATE fixtures that must be expanded before physical Games can exist. */
  readonly deferredCompetitionFixtureIds: readonly string[]
}

/**
 * Materializes currently executable B04/B12 physical games into GameWorld.
 * Immutable World DB structure stays external; only runtime bindings/sources are persisted in Save V4.
 * Virtual multi-game contests are never collapsed into one Game.
 */
export function materializeWorldDbPhysicalGamesV1(
  world: GameWorld,
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  asOf: string,
): WorldDbGameMaterializationResultV1 {
  const plan = planWorldDbPhysicalGamesV1(contexts, asOf)
  const gamesById = { ...world.games } as Record<string, Game>
  const materializedGameIds = new Set(Object.keys(gamesById))
  const deferredFixtureIds = new Set<string>()

  for (const planned of plan.games) {
    if (planned.localDate === null) continue
    const expansionRequired = planned.sourceMatchId === null
      ? planned.competitionFixtureIds.filter((fixtureId) => fixtureRequiresPhysicalExpansion(contexts, fixtureId))
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
    const stakes = deriveWorldDbPhysicalGameStakesV1(contexts, planned.competitionFixtureIds)
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
    materializedGameIds.add(planned.gameId)
  }

  const runtime = getWorldDbCompetitionRuntimeStateV1(world)
  const nextRuntime: WorldDbCompetitionRuntimeStateV1 = Object.freeze({
    schemaVersion: 1,
    competitionSeasonSources: mergeCompetitionSeasonSources(runtime.competitionSeasonSources, contexts),
    gameFixtureBindings: mergeGameFixtureBindings(
      runtime.gameFixtureBindings,
      plan.bindings.filter((binding) => materializedGameIds.has(binding.gameId)),
    ),
    resolvedStructurePositions: runtime.resolvedStructurePositions,
    fixtureOutcomes: runtime.fixtureOutcomes,
  })

  const updatedWorld = updateGameWorld(world, { games: Object.values(gamesById) })
  return Object.freeze({
    world: withWorldDbCompetitionRuntimeStateV1(updatedWorld, nextRuntime),
    plan,
    deferredCompetitionFixtureIds: Object.freeze([...deferredFixtureIds].sort()),
  })
}

/** Derives Game stakes from B04 structure, never from human-facing round names. */
export function deriveWorldDbPhysicalGameStakesV1(
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
  competitionFixtureIds: readonly string[],
): GameStakes {
  if (competitionFixtureIds.length === 0) throw new Error('Physical game requires at least one competition fixture')
  const fixtureIndex = buildFixtureIndex(contexts)
  let result: GameStakes = 'regular'

  for (const fixtureId of competitionFixtureIds) {
    const ref = fixtureIndex[fixtureId]
    if (ref === undefined) throw new Error(`Physical game references unloaded competition fixture: ${fixtureId}`)
    const fixture = ref.context.bundle.fixtures.find((row) => row.competitionFixtureId === fixtureId)!
    if (fixture.structureNodeId === null) continue
    const node = ref.context.bundle.structureNodes.find((row) => row.competitionStructureNodeId === fixture.structureNodeId)
    if (node === undefined) throw new Error(`Competition fixture ${fixtureId} references missing structure node ${fixture.structureNodeId}`)

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
  if (ref === undefined) throw new Error(`Physical expansion references unloaded competition fixture: ${competitionFixtureId}`)
  const fixture = ref.context.bundle.fixtures.find((row) => row.competitionFixtureId === competitionFixtureId)!
  if (fixture.structureNodeId === null) return false
  const formats = createWorldDbCompetitionRulesV1(ref.context.bundle).contestFormats.filter(
    (rule) => rule.scopeStructureNodeId === fixture.structureNodeId,
  )
  if (formats.length > 1) throw new Error(`Structure node ${fixture.structureNodeId} has multiple contest formats`)
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
        throw new Error(`Duplicate competition fixture across planning contexts: ${fixture.competitionFixtureId}`)
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

function mergeCompetitionSeasonSources(
  existing: readonly WorldDbCompetitionSeasonSourceV1[],
  contexts: readonly WorldDbCompetitionPlanningContextV1[],
): readonly WorldDbCompetitionSeasonSourceV1[] {
  const bySeasonId = new Map<string, WorldDbCompetitionSeasonSourceV1>()
  for (const source of existing) bySeasonId.set(source.competitionSeasonId, source)
  for (const context of contexts) {
    const source = Object.freeze({
      databaseId: context.bundle.source.databaseId,
      competitionSeasonId: context.bundle.competitionSeason.competitionSeasonId,
    })
    const previous = bySeasonId.get(source.competitionSeasonId)
    if (previous !== undefined && previous.databaseId !== source.databaseId) {
      throw new Error(`Competition season ${source.competitionSeasonId} changed World DB identity`)
    }
    bySeasonId.set(source.competitionSeasonId, source)
  }
  return Object.freeze([...bySeasonId.values()].sort((left, right) => left.competitionSeasonId.localeCompare(right.competitionSeasonId)))
}

function mergeGameFixtureBindings(
  existing: readonly WorldDbCompetitionGameFixtureBindingV1[],
  additions: readonly WorldDbCompetitionGameFixtureBindingV1[],
): readonly WorldDbCompetitionGameFixtureBindingV1[] {
  const byPair = new Map<string, WorldDbCompetitionGameFixtureBindingV1>()
  for (const binding of [...existing, ...additions]) {
    const key = `${binding.gameId}\u0000${binding.competitionFixtureId}`
    byPair.set(key, Object.freeze({ ...binding }))
  }
  return Object.freeze([...byPair.values()].sort(
    (left, right) => left.gameId.localeCompare(right.gameId) || left.competitionFixtureId.localeCompare(right.competitionFixtureId),
  ))
}
