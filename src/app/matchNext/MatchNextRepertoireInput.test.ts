import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createPlayerRepertoire, WORLDDB_PLAYER_REPERTOIRE_VERSION } from '@/domain/player/PlayerRepertoire'
import { updateGameWorld } from '@/domain/world'
import { createMatchState } from '@/engine/match-next'
import { createMatchEnginePort } from './MatchEnginePortFactory'

describe('PLAYER 2.4-D5B Match Next technical facts and legacy compatibility', () => {
  function setup() {
    const world = createNewGame()
    const game = Object.values(world.games).find(game => game.status === 'scheduled')!
    const port = createMatchEnginePort('match-next')
    const before = port.prepare(world, game, 653113119)
    const playerId = before.homeSquad[0]!
    const repertoire = createPlayerRepertoire({
      playerId,
      version: WORLDDB_PLAYER_REPERTOIRE_VERSION,
      contextualTraits: [{ code: 'HIGH_MOTOR', strength: 88, startedOn: world.currentDate }],
      technicalMoves: [
        { code: 'CROSSOVER', proficiency: 71, usageTendency: 83, asOfOn: world.currentDate },
        { code: 'STEPBACK', proficiency: 56, usageTendency: 29, asOfOn: world.currentDate },
      ],
      basketballSpecializationTraits: [{ code: 'SHOOTING_GRAVITY', startedOn: world.currentDate }],
    })
    const withRepertoire = updateGameWorld(world, { playerRepertoireByPlayerId: { [playerId]: repertoire } })
    const after = port.prepare(withRepertoire, game, 653113119)
    return { world, game, port, before, after, repertoire, playerId }
  }

  it('passes source-verified 40/60/8 to the exact player input for both squads, and leaves legacy matches unchanged', () => {
    const { before, after, repertoire, playerId } = setup()
    expect(before.players.every(player => player.repertoire === undefined)).toBe(true)
    expect(after.players.find(player => player.playerId === playerId)?.repertoire).toEqual(repertoire)
    expect(after.players.filter(player => player.repertoire !== undefined)).toHaveLength(1)
    expect(after.players.map(({ repertoire: _repertoire, ...legacy }) => legacy))
      .toEqual(before.players)
    const base = createMatchState(before)
    const withData = createMatchState(after)
    const { players: basePlayers, ...baseRuntime } = base
    const { players: dataPlayers, ...dataRuntime } = withData
    expect(dataRuntime).toEqual(baseRuntime)
    expect(dataPlayers.map(({ repertoire: _repertoire, ...player }) => player)).toEqual(basePlayers)
    expect(dataPlayers.find(player => player.playerId === playerId)?.repertoire).toEqual(repertoire)
  }, 20_000)

  it('rejects mismatched player keys and corrupted source metrics before Match Next starts', () => {
    const { after, playerId } = setup()
    const source = after.players.find(player => player.playerId === playerId)!
    const replaced = (repertoire: unknown) => ({
      ...after,
      players: after.players.map(player => player.playerId === playerId
        ? { ...player, repertoire: repertoire as typeof source.repertoire }
        : player),
    })
    expect(() => createMatchState(replaced({ ...source.repertoire, playerId: 'player:other' })))
      .toThrow(/mismatched repertoire identity/)
    expect(() => createMatchState(replaced({
      ...source.repertoire,
      technicalMoves: [{ code: 'CROSSOVER', proficiency: 120, usageTendency: 83, asOfOn: source.repertoire!.technicalMoves[0]!.asOfOn }],
    }))).toThrow(/0..100/)
    expect(() => createMatchState(replaced({
      ...source.repertoire, version: 'UNVERIFIED',
    }))).toThrow(/Unsupported WorldDB Player repertoire version/)
  }, 20_000)

  it('keeps legacy behavior deterministic and FULL/FAST equivalent with an optional active move', () => {
    const { before, after, port } = setup()
    const shortened = (source: typeof before) => ({
      ...source,
      clockRules: { ...source.clockRules, periodCount: 2, periodSeconds: 45, overtimeSeconds: 20 },
    })
    const legacy = shortened(before)
    const enhanced = shortened(after)
    const fastLegacy = port.simulate(legacy, 'FAST')
    const fastEnhanced = port.simulate(enhanced, 'FAST')
    const fullEnhanced = port.simulate(enhanced, 'FULL')
    expect(port.simulate(legacy, 'FAST').events).toEqual(fastLegacy.events)
    expect(port.simulate(enhanced, 'FAST').events).toEqual(fastEnhanced.events)
    expect(fullEnhanced.events).toEqual(fastEnhanced.events)
    expect(fullEnhanced.playerStats).toEqual(fastEnhanced.playerStats)
  }, 40_000)
})
