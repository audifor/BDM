import { describe, expect, it } from 'vitest'

import { createNewGame, playUserGame } from '@/app/game'
import { calculateAge } from '@/domain/player'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('GameWorldSaveV1', () => {
  it('round-trips canonical world data independently of the runtime object', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV1(world, '2032-10-01T12:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)

    expect(loaded).toEqual(world)
    expect(saved.payload.players).not.toBe(Object.values(world.players))
  })

  it('rejects unsupported schemas and corrupted collections', () => {
    expect(() => deserializeGameWorldV1({ schemaVersion: 2, savedAt: '2032-10-01T12:00:00.000Z', payload: {} })).toThrow('Unsupported save version')
    expect(() => deserializeGameWorldV1({ schemaVersion: 1, savedAt: '2032-10-01T12:00:00.000Z', payload: { countries: {} } })).toThrow('Save seasons')
  })

  it('preserves completed match logs and the deterministic next result', () => {
    const completed = playUserGame(createNewGame())
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(completed, '2032-10-01T12:00:00.000Z'))
    const original = createNewGame()
    const loadedBeforePlay = deserializeGameWorldV1(serializeGameWorldV1(original, '2032-10-01T12:00:00.000Z'))

    expect(loaded.matchStatLogsByGameId).toEqual(completed.matchStatLogsByGameId)
    expect(playUserGame(loadedBeforePlay)).toEqual(playUserGame(original))
  })

  it('enriches legacy players without bio deterministically', () => {
    const envelope = serializeGameWorldV1(createNewGame(), '2032-10-01T12:00:00.000Z')
    const legacy = { ...envelope, payload: { ...envelope.payload, players: envelope.payload.players.map(({ bio: _bio, ...player }) => player) } }
    const first = deserializeGameWorldV1(legacy)
    const second = deserializeGameWorldV1(legacy)

    expect(Object.values(first.players).map((player) => player.bio)).toEqual(Object.values(second.players).map((player) => player.bio))
    expect(Object.values(first.players).every((player) => calculateAge(player.bio.dateOfBirth, first.seasons[first.currentSeasonId]!.startDate) >= 18 && calculateAge(player.bio.dateOfBirth, first.seasons[first.currentSeasonId]!.startDate) <= 35)).toBe(true)
    expect(serializeGameWorldV1(first, envelope.savedAt).payload.players.every((player) => player.bio !== undefined)).toBe(true)
  })
})
