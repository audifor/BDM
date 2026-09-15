import type { WorldDbCompetitionRuntime } from '@/domain/world'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

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
