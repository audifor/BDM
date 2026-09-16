import { invoke } from '@tauri-apps/api/core'

import {
  parseWorldCompetitionRuntimeBundle,
  type WorldCompetitionRuntimeBundle,
} from '@/domain/competition'
import { assertWorldDbCompetitionBundleV1, type WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { assertWorldDbDatabaseInfoV1, type WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import { assertWorldDbMatchRealizationBundleV1, type WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'

export interface WorldDatabaseRepository {
  inspectDatabase(databasePath: string): Promise<WorldDbDatabaseInfoV1>
  loadCompetitionSeason(databasePath: string, competitionSeasonId: string): Promise<WorldDbCompetitionBundleV1>
  loadMatchRealizations(databasePath: string, competitionSeasonId: string): Promise<WorldDbMatchRealizationBundleV1>
  loadCompetitionRuntimeBundle(bundlePath: string): Promise<WorldCompetitionRuntimeBundle>
}

export const tauriWorldDatabaseRepository: WorldDatabaseRepository = {
  async inspectDatabase(databasePath) {
    const value = await invoke<unknown>('inspect_world_db_v1', { databasePath })
    assertWorldDbDatabaseInfoV1(value)
    return value
  },

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

  async loadCompetitionRuntimeBundle(bundlePath) {
    const value = await invoke<unknown>('load_world_db_competition_runtime_bundle_v1', {
      bundlePath,
    })
    return parseWorldCompetitionRuntimeBundle(value)
  },
}
