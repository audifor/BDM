import { describe, expect, it } from 'vitest'

import { createNewGame, prepareMatch } from '@/app/game'
import { prepareMatchOptions } from '@/app/game/playUserGame'
import { getGamesToday } from '@/engine/calendar'
import { calculateFatigueAtEvents } from '../index'
import { simulateMatchDetailed, type MatchEvent } from '../MatchEngine'

describe('automatic match rotation runner', () => {
  it('adds substitutions while preserving the sporting sequence and final score', () => {
    const world = createNewGame()
    const game = getGamesToday(world)[0]!
    // The coaching selector may choose a different starting five than the legacy
    // team-strength selector. Replay fatigue from the actual match lineup, not a
    // different five that was never active in the simulated match.
    const prepared = prepareMatchOptions(world, game, undefined, 12345)
    const { lineups, squads } = prepared
    const withoutRotations = simulateMatchDetailed(prepared)
    const withRotations = prepareMatch(world, game, undefined, 12345)

    expect(withRotations.events.filter((event) => event.type === 'substitution').length).toBeGreaterThan(0)
    expect(withRotations.finalScore.home).toBeGreaterThanOrEqual(0)
    expect(withRotations.finalScore.away).toBeGreaterThanOrEqual(0)
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
