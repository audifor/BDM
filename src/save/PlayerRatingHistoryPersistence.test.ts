import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { applyOffseasonDevelopment } from '@/engine/development'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

const savedAt = '2033-10-01T00:00:00.000Z'

function developedWorld() {
  return applyOffseasonDevelopment(createNewGame(), {
    fromSeasonId: seasonIdFromString('generated-season-0001'),
    toSeasonId: seasonIdFromString('generated-season-0004'),
    targetDate: createGameDate(2033, 10, 1),
  }).world
}

describe('player rating history persistence', () => {
  it('round-trips the recorded deltas', () => {
    const world = developedWorld()
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(serializeGameWorldV1(world, savedAt))) as unknown)

    expect(Object.keys(world.playerRatingHistoryByPlayerId).length).toBeGreaterThan(0)
    expect(loaded.playerRatingHistoryByPlayerId).toEqual(world.playerRatingHistoryByPlayerId)
  })

  it('defaults a legacy save without the field to an empty history', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV1(world, savedAt)
    const legacy = { ...saved.payload } as Record<string, unknown>
    delete legacy.playerRatingHistory

    expect(deserializeGameWorldV1({ ...saved, payload: legacy }).playerRatingHistoryByPlayerId).toEqual({})
    expect(world.playerRatingHistoryByPlayerId).toEqual({})
  })

  it('rejects a corrupted delta rather than reconstructing a wrong curve', () => {
    const saved = serializeGameWorldV1(developedWorld(), savedAt)
    const payload = JSON.parse(JSON.stringify(saved.payload)) as {
      playerRatingHistory: { playerId: string; seasons: { seasonId: string; deltas: Record<string, number> }[] }[]
      [key: string]: unknown
    }
    payload.playerRatingHistory[0]!.seasons[0]!.deltas.threePointShooting = 1.5

    expect(() => deserializeGameWorldV1({ ...saved, payload })).toThrow(TypeError)
  })
})
