import { describe, expect, it } from 'vitest'
import { createInjury } from '@/domain/injury'
import { gameIdFromString, injuryIdFromString, playerIdFromString } from '@/domain/ids'
import { createGameWorld, GameWorldValidationError, updateGameWorld } from './index'
import { createValidGameWorldInput } from './testFixtures'

describe('GameWorld injury validation reuse', () => {
  it('preserves the canonical injury collection across unrelated updates', () => {
    const world = createGameWorld(createValidGameWorldInput())
    const injury = createInjury({ id: injuryIdFromString('injury-history-a'), playerId: playerIdFromString('player-home'), kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2032-11-01' as never })
    const injured = updateGameWorld(world, { injuries: [injury] })

    const unchanged = updateGameWorld(injured, { currentDate: injured.currentDate })

    expect(unchanged.injuriesById).toBe(injured.injuriesById)
    expect(unchanged.injuriesById[injury.id]).toBe(injury)
  })

  it('checks a new injury against the existing injuries for that Player', () => {
    const world = createGameWorld(createValidGameWorldInput())
    const first = createInjury({ id: injuryIdFromString('injury-overlap-a'), playerId: playerIdFromString('player-home'), kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2032-11-01' as never })
    const injured = updateGameWorld(world, { injuries: [first] })
    const overlap = createInjury({ id: injuryIdFromString('injury-overlap-b'), playerId: first.playerId, kind: 'kneeSprain', severity: 'minor', injuredOn: world.currentDate, expectedReturnDate: '2032-10-15' as never })

    expect(() => updateGameWorld(injured, { injuries: [...Object.values(injured.injuriesById), overlap] })).toThrow(GameWorldValidationError)
  })

  it('revalidates historical injury links when a referenced Game changes', () => {
    const input = createValidGameWorldInput()
    const world = createGameWorld(input)
    const game = Object.values(world.games)[0]!
    const linked = createInjury({ id: injuryIdFromString('injury-game-link'), playerId: playerIdFromString('player-home'), kind: 'hamstringStrain', severity: 'moderate', injuredOn: game.date, expectedReturnDate: '2032-11-01' as never, source: 'MATCH', sourceGameId: game.id })
    const injured = updateGameWorld(world, { injuries: [linked] })

    expect(() => updateGameWorld(injured, { games: Object.values(injured.games).map(item => item.id === game.id ? { ...item, date: '2032-10-02' as never } : item) })).toThrow('date does not match source Game')
    expect(game.id).toBe(gameIdFromString('game-a'))
  })
})

it('rejects an earlier appended injury overlapping an unchanged later injury', () => {
  const world = createGameWorld(createValidGameWorldInput())
  const later = createInjury({ id: injuryIdFromString('injury-later'), playerId: playerIdFromString('player-home'), kind: 'ankleSprain', severity: 'minor', injuredOn: '2032-10-10' as never, expectedReturnDate: '2032-10-20' as never })
  const injured = updateGameWorld(world, { injuries: [later] })
  const earlier = createInjury({ id: injuryIdFromString('injury-earlier'), playerId: later.playerId, kind: 'kneeSprain', severity: 'minor', injuredOn: '2032-10-01' as never, expectedReturnDate: '2032-10-15' as never })
  expect(() => updateGameWorld(injured, { injuries: [later, earlier] })).toThrow('overlaps another injury')
})
