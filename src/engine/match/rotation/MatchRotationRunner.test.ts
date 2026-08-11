import { describe, expect, it } from 'vitest'

import { createNewGame, createPrototypeGameRandom, prepareMatch } from '@/app/game'
import { getGamesToday } from '@/engine/calendar'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateTeamStrength, selectStartingFive } from '@/engine/team'

import { calculateFatigueAtEvents } from '../index'
import { simulateMatchDetailed, type MatchEvent } from '../MatchEngine'

describe('automatic match rotation runner', () => {
  it('adds substitutions while preserving the sporting sequence and final score', () => {
    const world = createNewGame()
    const game = getGamesToday(world)[0]!
    const lineups = { home: selectStartingFive(world, game.homeTeamId), away: selectStartingFive(world, game.awayTeamId) }
    const withoutRotations = simulateMatchDetailed({
      world,
      gameId: game.id,
      homeStrength: calculateTeamStrength(world, game.homeTeamId),
      awayStrength: calculateTeamStrength(world, game.awayTeamId),
      lineups,
      squads: { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds },
      random: createPrototypeGameRandom(game.id),
      actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)),
    })
    const withRotations = prepareMatch(world, game)

    expect(withRotations.events.filter((event) => event.type === 'substitution').length).toBeGreaterThan(0)
    expect(withRotations.finalScore).toEqual(withoutRotations.finalScore)
    expect(withRotations.events.filter((event) => event.type !== 'substitution').map(sportingShape)).toEqual(withoutRotations.events.map(sportingShape))
    const squads = { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
    const rotatedFatigue = calculateFatigueAtEvents(lineups, squads, game.homeTeamId, game.awayTeamId, withRotations.events)
    const uninterruptedFatigue = calculateFatigueAtEvents(lineups, squads, game.homeTeamId, game.awayTeamId, withoutRotations.events)
    expect(Object.values(rotatedFatigue).every((value) => Number.isFinite(value) && value >= 0 && value <= 100)).toBe(true)
    expect(Object.values(rotatedFatigue).some((value) => value > 0)).toBe(true)
    expect(rotatedFatigue[lineups.home[0]!]).not.toBe(uninterruptedFatigue[lineups.home[0]!])
  })
})

function sportingShape(event: MatchEvent) {
  const { sequence: _sequence, playerId: _playerId, assistPlayerId: _assistPlayerId, ...shape } = event as MatchEvent & { readonly playerId?: unknown; readonly assistPlayerId?: unknown }
  return shape
}
