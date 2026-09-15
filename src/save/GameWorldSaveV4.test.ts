import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { attachWorldDbCompetitionRuntime } from '@/domain/world'
import { serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('GameWorldSaveV4 competition runtime', () => {
  it('writes the required empty runtime for a world created before V4 runtime exists', () => {
    const world = createNewGame()
    const v4 = serializeGameWorldV4(world, savedAt)

    expect(v4.schemaVersion).toBe(4)
    expect(v4.payload.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })

    const restored = deserializeGameWorldV4(v4)
    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('continues to read pre-91 V4 runtime payloads without a bundle pin', () => {
    const current = serializeGameWorldV4(createNewGame(), savedAt)
    const { competitionRuntimeBundle: _pin, ...pre91Runtime } = current.payload.worldDbCompetitionRuntime
    const restored = deserializeGameWorldV4({
      ...current,
      payload: {
        ...current.payload,
        worldDbCompetitionRuntime: pre91Runtime,
      },
    })

    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('round-trips populated competition runtime identities and bundle pin', () => {
    const world = attachWorldDbCompetitionRuntime(createNewGame(), {
      competitionRuntimeBundle: {
        contentId: 'bdm-phase1-competition-runtime-v1',
        contentHash: 'a'.repeat(64),
        worldDbSchema: 'DDL-PHASE1-A',
      },
      competitionPlanIds: ['plan:liga-acb:2032', 'plan:euroleague:2032'],
      competitionSeasonIds: ['competition-season:acb:2032', 'competition-season:euroleague:2032'],
    })

    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))

    expect(restored.worldDbCompetitionRuntime).toEqual(world.worldDbCompetitionRuntime)
  })

  it('migrates canonical V3 by preserving V3 fields and adding empty runtime state', () => {
    const v3 = serializeGameWorldV3(createNewGame(), savedAt)
    const v4 = migrateGameWorldSaveV3ToV4(v3)
    const { worldDbCompetitionRuntime, ...v4CompatibilityPayload } = v4.payload

    expect(v4.schemaVersion).toBe(4)
    expect(v4CompatibilityPayload).toEqual(v3.payload)
    expect(worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('continues to read V3 through the V4 reader with an empty runtime projection', () => {
    const world = createNewGame()
    const legacy = serializeGameWorldV3(world, savedAt)
    const restored = deserializeGameWorldSaveV4(legacy)

    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
    const { worldDbCompetitionRuntime: _runtime, ...legacyCompatibleWorld } = restored
    expect(legacyCompatibleWorld).toEqual(world)
  })

  it('rejects malformed canonical V4 runtime payloads', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)

    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: { ...valid.payload, worldDbCompetitionRuntime: undefined },
    })).toThrow(/must be an object/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: null,
          competitionPlanIds: ['duplicate', 'duplicate'],
          competitionSeasonIds: [],
        },
      },
    })).toThrow(/duplicates/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: null,
          competitionPlanIds: [],
          competitionSeasonIds: [42],
        },
      },
    })).toThrow(/non-empty strings/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: {
            contentId: 'bdm-phase1-competition-runtime-v1',
            contentHash: 'not-a-hash',
            worldDbSchema: 'DDL-PHASE1-A',
          },
          competitionPlanIds: [],
          competitionSeasonIds: [],
        },
      },
    })).toThrow(/64-character lowercase hex digest/)
  })

  it('rejects malformed canonical V4 envelopes', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)
    expect(() => deserializeGameWorldV4({ ...valid, extra: true })).toThrow(/unexpected fields/)
    expect(() => deserializeGameWorldV4({ ...valid, savedAt: 'not-a-date' })).toThrow(/ISO-8601/)
    expect(() => deserializeGameWorldV4({ ...valid, schemaVersion: 5 })).toThrow(/Unsupported save version/)
  })
})
