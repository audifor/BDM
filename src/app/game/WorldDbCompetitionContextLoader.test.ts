import { describe, expect, it } from 'vitest'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import type { WorldDbCompetitionRuntimeStateV1 } from '@/domain/worldDb/CompetitionRuntimeState'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { loadWorldDbCompetitionPlanningContextsV1 } from './WorldDbCompetitionContextLoader'

const runtime: WorldDbCompetitionRuntimeStateV1 = {
  schemaVersion: 1,
  competitionSeasonSources: [
    { databaseId: 'world.db', competitionSeasonId: 'season:regular' },
    { databaseId: 'world.db', competitionSeasonId: 'season:cup' },
  ],
  gameFixtureBindings: [],
  resolvedStructurePositions: [
    { competitionStructurePositionId: 'position:1', competitionSeasonEntryId: 'entry:1' },
  ],
  fixtureOutcomes: [],
}

function competitionBundle(competitionSeasonId: string, databaseId = 'world.db'): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId, schemaId: 'DDL-PHASE1-A' },
    competitionSeason: { competitionSeasonId, competitionId: `competition:${competitionSeasonId}`, seasonId: 'season:2026', editionNumber: 1 },
    entries: [], structureNodes: [], structureEdges: [], structureEntryAssignments: [], fixtures: [], fixtureSides: [], rulePayloads: {},
  }
}

function matchBundle(competitionSeasonId: string): WorldDbMatchRealizationBundleV1 {
  return { schemaVersion: 1, competitionSeasonId, matches: [], realizations: [] }
}

function repository(databaseId = 'world.db'): WorldDatabaseRepository {
  return {
    async loadCompetitionSeason(_databasePath, competitionSeasonId) { return competitionBundle(competitionSeasonId, databaseId) },
    async loadMatchRealizations(_databasePath, competitionSeasonId) { return matchBundle(competitionSeasonId) },
  }
}

describe('WorldDbCompetitionContextLoader', () => {
  it('reloads every persisted competition season with B04, B12, and resolved positions', async () => {
    const contexts = await loadWorldDbCompetitionPlanningContextsV1(repository(), 'C:/BDM_DB/world.db', runtime)
    expect(contexts.map((context) => context.bundle.competitionSeason.competitionSeasonId)).toEqual(['season:regular', 'season:cup'])
    expect(contexts[0]?.matchRealizations?.competitionSeasonId).toBe('season:regular')
    expect(contexts[1]?.resolvedEntryIdByStructurePositionId).toEqual({ 'position:1': 'entry:1' })
  })

  it('rejects a different database identity instead of continuing against the wrong World DB', async () => {
    await expect(loadWorldDbCompetitionPlanningContextsV1(repository('other.db'), 'C:/BDM_DB/world.db', runtime)).rejects.toThrow('World DB identity mismatch')
  })

  it('rejects an empty physical path before repository access', async () => {
    await expect(loadWorldDbCompetitionPlanningContextsV1(repository(), ' ', runtime)).rejects.toThrow('databasePath')
  })
})
