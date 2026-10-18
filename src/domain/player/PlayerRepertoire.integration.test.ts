import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createPlayerRepertoire, WORLDDB_PLAYER_REPERTOIRE_VERSION } from './PlayerRepertoire'

const sample = {
  playerId: 'player:sample',
  version: WORLDDB_PLAYER_REPERTOIRE_VERSION,
  contextualTraits: [
    { code: 'CLUTCH_PERFORMER', strength: 86, startedOn: '2026-07-01' },
    { code: 'HIGH_MOTOR', strength: 72, startedOn: '2026-07-01' },
  ],
  technicalMoves: [
    { code: 'STEPBACK', proficiency: 74, usageTendency: 21, asOfOn: '2026-07-01' },
    { code: 'CROSSOVER', proficiency: 81, usageTendency: 65, asOfOn: '2026-07-01' },
  ],
  basketballSpecializationTraits: [{ code: 'SHOOTING_GRAVITY', startedOn: '2026-07-01' }],
}

describe('PLAYER 2.4-D3 canonical repertoire', () => {
  it('retains separate technique proficiency and usage, character traits and sports specialty', () => {
    const profile = createPlayerRepertoire(sample)
    expect(profile.contextualTraits.map(x => x.code)).toEqual(['CLUTCH_PERFORMER', 'HIGH_MOTOR'])
    expect(profile.technicalMoves[0]).toMatchObject({ code: 'CROSSOVER', proficiency: 81, usageTendency: 65 })
    expect(profile.basketballSpecializationTraits).toHaveLength(1)
    expect(createPlayerRepertoire(JSON.parse(JSON.stringify(profile)))).toEqual(profile)
  })
  it('rejects unknown keys, duplicates, invalid range, missing versions and mixed traits', () => {
    expect(() => createPlayerRepertoire({ ...sample, version: 'EXPERIMENTAL' })).toThrow()
    expect(() => createPlayerRepertoire({ ...sample, technicalMoves: [sample.technicalMoves[0], sample.technicalMoves[0]] })).toThrow(/duplicate/)
    expect(() => createPlayerRepertoire({ ...sample, contextualTraits: [{ ...sample.contextualTraits[0], strength: 101 }] })).toThrow()
    expect(() => createPlayerRepertoire({ ...sample, contextualTraits: [{ ...sample.contextualTraits[0], startedOn: 'invalid' }] })).toThrow()
    expect(() => createPlayerRepertoire({ ...sample, invented: true })).toThrow()
    expect(() => createPlayerRepertoire({ ...sample, basketballSpecializationTraits: [{ code: 'CLUTCH_PERFORMER', startedOn: '2026-07-01' }] })).toThrow()
  })
  it('round-trips independently through GameWorld and Save V4 without modifying PLAYER V2 fields', () => {
    const world = createNewGame()
    const player = Object.values(world.players)[0]!
    const beforeBasketball = JSON.stringify(player.basketball)
    const profile = createPlayerRepertoire({ ...sample, playerId: player.id })
    const withRepertoire = updateGameWorld(world, { playerRepertoireByPlayerId: { [player.id]: profile } })
    expect(JSON.stringify(withRepertoire.players[player.id]!.basketball)).toBe(beforeBasketball)
    const saved = serializeGameWorldV4(withRepertoire, '2026-10-17T12:00:00.000Z')
    expect(saved.payload.playerRepertoire).toEqual([profile])
    const roundtrip = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(roundtrip.playerRepertoireByPlayerId[player.id]).toEqual(profile)
    expect(JSON.stringify(roundtrip.players[player.id]!.basketball)).toBe(beforeBasketball)
    expect(serializeGameWorldV4(roundtrip, '2026-10-17T12:00:00.000Z').payload.playerRepertoire).toEqual([profile])
    expect(() => updateGameWorld(withRepertoire, { playerRepertoireByPlayerId: {} })).toThrow(/cannot remove/)
    expect(() => updateGameWorld(withRepertoire, { playerRepertoireByPlayerId: { [player.id]: createPlayerRepertoire({ ...sample, playerId: player.id, technicalMoves: [{ ...sample.technicalMoves[0], proficiency: 3 }] }) } })).toThrow(/must not overwrite/)
  })
  it('old Save V4 defaults to no repertoire; malformed or duplicate payloads are rejected', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV4(world, '2026-10-17T12:00:00.000Z')
    const { playerRepertoire: _empty, ...oldPayload } = saved.payload
    const loaded = deserializeGameWorldV4({ ...saved, payload: oldPayload })
    expect(Object.keys(loaded.playerRepertoireByPlayerId)).toEqual([])
    const player = Object.values(world.players)[0]!
    const entry = createPlayerRepertoire({ ...sample, playerId: player.id })
    expect(() => deserializeGameWorldV4({ ...saved, payload: { ...saved.payload, playerRepertoire: [entry, entry] } })).toThrow(/duplicate/)
    expect(() => deserializeGameWorldV4({ ...saved, payload: { ...saved.payload, playerRepertoire: [{ ...entry, technicalMoves: [{ ...entry.technicalMoves[0], usageTendency: 120 }] }] } })).toThrow()
    expect(() => deserializeGameWorldV4({ ...saved, payload: { ...saved.payload, playerRepertoire: [{ ...entry, playerId: 'player:unknown' }] } })).toThrow(/unknown PLAYER/)
  })
})
