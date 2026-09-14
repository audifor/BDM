import {
  resolvedEntryIdByStructurePositionIdV1,
  type WorldDbCompetitionRuntimeStateV1,
} from '@/domain/worldDb/CompetitionRuntimeState'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

/** Reloads immutable B04/B12 context for the competition editions persisted by Save V4. */
export async function loadWorldDbCompetitionPlanningContextsV1(
  repository: WorldDatabaseRepository,
  databasePath: string,
  runtime: WorldDbCompetitionRuntimeStateV1,
): Promise<readonly WorldDbCompetitionPlanningContextV1[]> {
  if (typeof databasePath !== 'string' || databasePath.trim().length === 0) {
    throw new TypeError('World DB databasePath must be a non-empty string')
  }

  const resolvedPositions = resolvedEntryIdByStructurePositionIdV1(runtime)
  const contexts = await Promise.all(runtime.competitionSeasonSources.map(async (source) => {
    const [bundle, matchRealizations] = await Promise.all([
      repository.loadCompetitionSeason(databasePath, source.competitionSeasonId),
      repository.loadMatchRealizations(databasePath, source.competitionSeasonId),
    ])

    if (bundle.source.databaseId !== source.databaseId) {
      throw new Error(`World DB identity mismatch for ${source.competitionSeasonId}: expected ${source.databaseId}, received ${bundle.source.databaseId}`)
    }
    if (bundle.competitionSeason.competitionSeasonId !== source.competitionSeasonId) {
      throw new Error(`World DB competition season mismatch: expected ${source.competitionSeasonId}, received ${bundle.competitionSeason.competitionSeasonId}`)
    }
    if (matchRealizations.competitionSeasonId !== source.competitionSeasonId) {
      throw new Error(`World DB B12 competition season mismatch: expected ${source.competitionSeasonId}, received ${matchRealizations.competitionSeasonId}`)
    }

    return Object.freeze({
      bundle,
      matchRealizations,
      resolvedEntryIdByStructurePositionId: resolvedPositions,
    })
  }))

  return Object.freeze(contexts)
}
