import { expect, it } from 'vitest'
import { attachWorldDbCompetitionRuntime } from '@/domain/world'
import { readWorldDbV2Provenance, type WorldDbV2Provenance } from '@/domain/world/WorldDbCompetitionRuntime'
import { createNewGame } from './createNewGame'
import { simulationDetailFor } from './matchResolution'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'

const provenance: WorldDbV2Provenance = {
  masterSha256: 'a'.repeat(64),
  sourceDate: '2025-07-01', startDate: '2025-07-01', seed: 'league-detail-test',
  sourceCompetitionId: 'pbm:DYN_championnat:5',
  nativeCompetitionId: 'competition:ESP:liga-endesa',
  activeCompetitionIds: ['pbm:DYN_championnat:5', 'pbm:DYN_championnat:2'],
  reducedCompetitionIds: ['pbm:DYN_championnat:2'],
  fictional: true, profiles: 'BDM_GENERATED_CANONICAL', economy: 'BDM_GAME_BALANCE_NOT_PBM',
}

it('validates unique reduced leagues and requires them to be active', () => {
  expect(readWorldDbV2Provenance(provenance).reducedCompetitionIds).toEqual(['pbm:DYN_championnat:2'])
  expect(() => readWorldDbV2Provenance({ ...provenance, reducedCompetitionIds: ['pbm:DYN_championnat:999'] })).toThrow()
  expect(() => readWorldDbV2Provenance({ ...provenance, reducedCompetitionIds: ['pbm:DYN_championnat:2', 'pbm:DYN_championnat:2'] })).toThrow()
})

it('retains reduced league selection in the existing Save V4 runtime without modifying the master', () => {
  const base = createNewGame()
  const world = attachWorldDbCompetitionRuntime(base, {
    competitionRuntimeBundle: null,
    competitionPlanIds: [],
    competitionSeasonIds: [],
    worldDbV2: provenance,
  })
  const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-11-01T00:00:00Z'))))
  expect(restored.worldDbCompetitionRuntime?.worldDbV2?.reducedCompetitionIds).toEqual(provenance.reducedCompetitionIds)
  expect(restored.worldDbCompetitionRuntime?.worldDbV2?.activeCompetitionIds).toEqual(provenance.activeCompetitionIds)
  expect(simulationDetailFor(restored).level).toBe('DETAILED')
})
