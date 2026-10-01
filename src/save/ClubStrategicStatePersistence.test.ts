import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'
import { serializeGameWorldV3 } from './GameWorldSaveV3'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('Club strategic state Save V4', () => {
  let world: ReturnType<typeof createNewGame>
  beforeAll(() => { world = createNewGame() }, 120_000)

  it('preserves accepted modes and review timing', () => {
    const saved = serializeGameWorldV4(world, savedAt)
    const loaded = deserializeGameWorldV4(saved)
    expect(loaded.clubStrategicStatesByTeamId).toEqual(world.clubStrategicStatesByTeamId)
  })

  it('defaults older V4 payloads without strategic memory to an empty collection', () => {
    const saved = serializeGameWorldV4(world, savedAt)
    const { clubStrategicStates: _states, ...legacyPayload } = saved.payload
    const loaded = deserializeGameWorldV4({ ...saved, payload: legacyPayload })
    expect(loaded.clubStrategicStatesByTeamId).toEqual({})
  })

  it('migrates V3 saves with neutral strategy memory', () => {
    const migrated = migrateGameWorldSaveV3ToV4(serializeGameWorldV3(world, savedAt))
    expect(migrated.payload.clubStrategicStates).toEqual([])
    expect(deserializeGameWorldV4(migrated).clubStrategicStatesByTeamId).toEqual({})
  })
})
