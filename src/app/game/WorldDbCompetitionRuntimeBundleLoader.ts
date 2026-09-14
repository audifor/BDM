import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { getWorldDbCompetitionRuntimeStateV1 } from '@/domain/worldDb/CompetitionRuntimeState'
import type { GameWorld } from '@/domain/world'
import { createWorldCompetitionCatalog, type WorldCompetitionCatalog } from '@/engine/competition/WorldCompetitionCatalog'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

export interface LoadedWorldDbCompetitionRuntimeBundleV1 {
  readonly bundle: WorldCompetitionRuntimeBundle
  readonly catalog: WorldCompetitionCatalog
}

/**
 * Loads the immutable Phase 1 format recipe and verifies that it can reconstruct every
 * World DB competition season currently referenced by the save. Physical paths remain external.
 */
export async function loadWorldDbCompetitionRuntimeBundleV1(
  world: GameWorld,
  bundlePath: string,
  repository: WorldDatabaseRepository,
): Promise<LoadedWorldDbCompetitionRuntimeBundleV1> {
  const bundle = await repository.loadCompetitionRuntimeBundle(bundlePath)
  const catalog = createWorldCompetitionCatalog(bundle)
  const runtime = getWorldDbCompetitionRuntimeStateV1(world)

  for (const source of runtime.competitionSeasonSources) {
    if (catalog.formatsBySeasonId[source.competitionSeasonId] === undefined) {
      throw new Error(`Competition runtime bundle is missing active season: ${source.competitionSeasonId}`)
    }
  }

  return Object.freeze({ bundle, catalog })
}
