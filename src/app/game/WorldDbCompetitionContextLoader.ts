import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import {
  EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  attachWorldDbCompetitionRuntime,
  createWorldDbCompetitionRuntime,
  type GameWorld,
  type WorldDbCompetitionRuntime,
} from '@/domain/world'
import {
  createWorldCompetitionCatalog,
  type WorldCompetitionCatalog,
} from '@/engine/competition/WorldCompetitionCatalog'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

export interface LoadedWorldDbCompetitionRuntimeCatalogV1 {
  readonly world: GameWorld
  readonly bundle: WorldCompetitionRuntimeBundle
  readonly catalog: WorldCompetitionCatalog
}

/** Reloads immutable B04/B12 context for the competition seasons persisted by Save V4. */
export async function loadWorldDbCompetitionPlanningContextsV1(
  repository: WorldDatabaseRepository,
  databasePath: string,
  runtime: WorldDbCompetitionRuntime,
): Promise<readonly WorldDbCompetitionPlanningContextV1[]> {
  if (typeof databasePath !== 'string' || databasePath.trim().length === 0) {
    throw new TypeError('World DB databasePath must be a non-empty string')
  }

  const contexts = await Promise.all(runtime.competitionSeasonIds.map(async (competitionSeasonId) => {
    const [bundle, matchRealizations] = await Promise.all([
      repository.loadCompetitionSeason(databasePath, competitionSeasonId),
      repository.loadMatchRealizations(databasePath, competitionSeasonId),
    ])

    if (bundle.competitionSeason.competitionSeasonId !== competitionSeasonId) {
      throw new Error(`World DB competition season mismatch: expected ${competitionSeasonId}, received ${bundle.competitionSeason.competitionSeasonId}`)
    }
    if (matchRealizations.competitionSeasonId !== competitionSeasonId) {
      throw new Error(`World DB B12 competition season mismatch: expected ${competitionSeasonId}, received ${matchRealizations.competitionSeasonId}`)
    }

    return Object.freeze({
      bundle,
      matchRealizations,
    })
  }))

  return Object.freeze(contexts)
}

/**
 * Loads the immutable competition-format bundle, verifies every active Save V4 season is present,
 * and pins its logical content/schema identity. Physical paths remain external to the save.
 */
export async function loadWorldDbCompetitionRuntimeCatalogV1(
  repository: WorldDatabaseRepository,
  bundlePath: string,
  world: GameWorld,
): Promise<LoadedWorldDbCompetitionRuntimeCatalogV1> {
  if (typeof bundlePath !== 'string' || bundlePath.trim().length === 0) {
    throw new TypeError('World DB runtime bundlePath must be a non-empty string')
  }

  const bundle = await repository.loadCompetitionRuntimeBundle(bundlePath)
  const catalog = createWorldCompetitionCatalog(bundle)
  const runtime = createWorldDbCompetitionRuntime(
    world.worldDbCompetitionRuntime ?? EMPTY_WORLD_DB_COMPETITION_RUNTIME,
  )
  const pin = Object.freeze({
    contentId: bundle.contentId,
    contentHash: bundle.contentHash,
    worldDbSchema: bundle.worldDbSchema,
  })
  const existingPin = runtime.competitionRuntimeBundle ?? null

  if (existingPin !== null) {
    assertSameRuntimeBundlePin(existingPin, pin)
  }

  for (const competitionSeasonId of runtime.competitionSeasonIds) {
    if (catalog.formatsBySeasonId[competitionSeasonId] === undefined) {
      throw new Error(
        `Competition runtime bundle is missing active season: ${competitionSeasonId}`,
      )
    }
  }

  return Object.freeze({
    world: attachWorldDbCompetitionRuntime(
      world,
      createWorldDbCompetitionRuntime({
        ...runtime,
        competitionRuntimeBundle: pin,
      }),
    ),
    bundle,
    catalog,
  })
}

function assertSameRuntimeBundlePin(
  expected: NonNullable<WorldDbCompetitionRuntime['competitionRuntimeBundle']>,
  actual: NonNullable<WorldDbCompetitionRuntime['competitionRuntimeBundle']>,
): void {
  if (
    expected.contentId !== actual.contentId
    || expected.contentHash !== actual.contentHash
    || expected.worldDbSchema !== actual.worldDbSchema
  ) {
    throw new Error(
      `Competition runtime bundle drift: expected ${expected.contentId}/${expected.contentHash}/${expected.worldDbSchema}, received ${actual.contentId}/${actual.contentHash}/${actual.worldDbSchema}`,
    )
  }
}
