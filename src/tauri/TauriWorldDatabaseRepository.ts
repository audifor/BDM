import { invoke } from '@tauri-apps/api/core'

import { assertWorldDbCompetitionBundleV1, type WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { assertWorldDbMatchRealizationBundleV1, type WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'

export interface WorldDatabaseRepository {
  loadCompetitionSeason(databasePath: string, competitionSeasonId: string): Promise<WorldDbCompetitionBundleV1>
  loadMatchRealizations(databasePath: string, competitionSeasonId: string): Promise<WorldDbMatchRealizationBundleV1>
}

export const tauriWorldDatabaseRepository: WorldDatabaseRepository = {
  async loadCompetitionSeason(databasePath, competitionSeasonId) {
    const value = await invoke<unknown>('load_world_db_competition_bundle_v1', {
      databasePath,
      competitionSeasonId,
    })
    assertWorldDbCompetitionBundleV1(value)
    return value
  },

  async loadMatchRealizations(databasePath, competitionSeasonId) {
    const value = await invoke<unknown>('load_world_db_match_realizations_v1', {
      databasePath,
      competitionSeasonId,
    })
    assertWorldDbMatchRealizationBundleV1(value)
    return value
  },
}
