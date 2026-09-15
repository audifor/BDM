import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('GameWorldSaveV4 minimal envelope', () => {
  it('round-trips the canonical V3 payload unchanged', () => {
    const world = createNewGame()
    const v3 = serializeGameWorldV3(world, savedAt)
    const v4 = serializeGameWorldV4(world, savedAt)

    expect(v4.schemaVersion).toBe(4)
    expect(v4.savedAt).toBe(v3.savedAt)
    expect(v4.payload).toEqual(v3.payload)
    expect(deserializeGameWorldV4(v4)).toEqual(world)
  })

  it('migrates canonical V3 to V4 without changing its payload semantics', () => {
    const v3 = serializeGameWorldV3(createNewGame(), savedAt)
    const v4 = migrateGameWorldSaveV3ToV4(v3)
    expect(v4.schemaVersion).toBe(4)
    expect(v4.payload).toEqual(v3.payload)
  })

  it('continues to read V3 through the V4 reader', () => {
    const world = createNewGame()
    const legacy = serializeGameWorldV3(world, savedAt)
    expect(deserializeGameWorldSaveV4(legacy)).toEqual(world)
  })

  it('rejects malformed canonical V4 envelopes', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)
    expect(() => deserializeGameWorldV4({ ...valid, extra: true })).toThrow(/unexpected fields/)
    expect(() => deserializeGameWorldV4({ ...valid, savedAt: 'not-a-date' })).toThrow(/ISO-8601/)
    expect(() => deserializeGameWorldV4({ ...valid, schemaVersion: 5 })).toThrow(/Unsupported save version/)
  })
})
