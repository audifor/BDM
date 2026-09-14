import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import {
  getWorldDbCompetitionRuntimeStateV1,
  withWorldDbCompetitionRuntimeStateV1,
  type WorldDbCompetitionRuntimeBundlePinV1,
} from '@/domain/worldDb/CompetitionRuntimeState'
import type { GameWorld } from '@/domain/world'
import { createWorldCompetitionCatalog, type WorldCompetitionCatalog } from '@/engine/competition/WorldCompetitionCatalog'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

export interface LoadedWorldDbCompetitionRuntimeBundleV1 {
  readonly world: GameWorld
  readonly bundle: WorldCompetitionRuntimeBundle
  readonly catalog: WorldCompetitionCatalog
}

/**
 * Loads the immutable Phase 1 format recipe, pins/verifies its content identity, and verifies that
 * it can reconstruct every World DB competition season currently referenced by the save.
 * Physical paths remain external.
 */
export async function loadWorldDbCompetitionRuntimeBundleV1(
  world: GameWorld,
  bundlePath: string,
  repository: WorldDatabaseRepository,
): Promise<LoadedWorldDbCompetitionRuntimeBundleV1> {
  const bundle = await repository.loadCompetitionRuntimeBundle(bundlePath)
  const catalog = createWorldCompetitionCatalog(bundle)
  const runtime = getWorldDbCompetitionRuntimeStateV1(world)
  const pin: WorldDbCompetitionRuntimeBundlePinV1 = Object.freeze({
    contentId: bundle.contentId,
    contentHash: bundle.contentHash,
    worldDbSchema: bundle.worldDbSchema,
  })

  if (runtime.competitionRuntimeBundle !== null) assertSamePin(runtime.competitionRuntimeBundle, pin)

  for (const source of runtime.competitionSeasonSources) {
    if (catalog.formatsBySeasonId[source.competitionSeasonId] === undefined) {
      throw new Error(`Competition runtime bundle is missing active season: ${source.competitionSeasonId}`)
    }
  }

  const pinnedWorld = runtime.competitionRuntimeBundle === null
    ? withWorldDbCompetitionRuntimeStateV1(world, { ...runtime, competitionRuntimeBundle: pin })
    : world

  return Object.freeze({ world: pinnedWorld, bundle, catalog })
}

function assertSamePin(
  expected: WorldDbCompetitionRuntimeBundlePinV1,
  actual: WorldDbCompetitionRuntimeBundlePinV1,
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
