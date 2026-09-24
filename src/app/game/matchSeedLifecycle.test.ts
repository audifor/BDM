import { describe, expect, it } from 'vitest'

import { getGamesToday } from '@/engine/calendar'
import { createMatchSession, simulateMatchWithRotations, stepMatchSession, toMatchSimulation } from '@/engine/match'
import { calculateMatchPlayerStats } from '@/engine/match/PlayerMatchStats'
import { createNewGame } from './createNewGame'
import { createLiveUserMatch, prepareMatchOptions } from './playUserGame'

describe('match seed lifecycle', () => {
  it('replays the same canonical match and session state for the same explicit seed', () => {
    const world = createNewGame()
    const game = getGamesToday(world)[0]!
    const first = runPreparedSession(prepareMatchOptions(world, game, undefined, 12345))
    const replay = runPreparedSession(prepareMatchOptions(world, game, undefined, 12345))
    const firstSimulation = toMatchSimulation(first)
    const replaySimulation = toMatchSimulation(replay)

    expect(firstSimulation.matchSeed).toBe(12345)
    expect(replaySimulation.matchSeed).toBe(12345)
    expect(replaySimulation.finalScore).toEqual(firstSimulation.finalScore)
    expect(replaySimulation.events).toEqual(firstSimulation.events)
    expect(calculateMatchPlayerStats(replaySimulation)).toEqual(calculateMatchPlayerStats(firstSimulation))
    expect(replay.state).toEqual(first.state)
  })

  it('produces a known sporting divergence for two explicit seeds', () => {
    const world = createNewGame()
    const game = getGamesToday(world)[0]!
    const first = toMatchSimulation(runPreparedSession(prepareMatchOptions(world, game, undefined, 101)))
    const second = toMatchSimulation(runPreparedSession(prepareMatchOptions(world, game, undefined, 202)))

    expect(second.events).not.toEqual(first.events)
  })

  it('draws one seed for each new prepared run from the injected source', () => {
    const world = createNewGame()
    const game = getGamesToday(world)[0]!
    const supplied = [31, 32]
    const drawSeed = () => supplied.shift()!
    const first = prepareMatchOptions(world, game, undefined, drawSeed)
    const second = prepareMatchOptions(world, game, undefined, drawSeed)

    expect(first.matchSeed).toBe(31)
    expect(second.matchSeed).toBe(32)
    expect(supplied).toEqual([])
    expect(first.random.next()).not.toBe(second.random.next())
  })

  it('uses the same explicit seed authority for Live and Instant startup', () => {
    const world = createNewGame()
    const live = createLiveUserMatch(world, undefined, 98765)
    const instantInput = prepareMatchOptions(world, world.games[live.gameId]!, undefined, 98765)
    const instant = simulateMatchWithRotations(instantInput)
    while (!live.isComplete) live.advanceOneStep()

    expect(live.matchSeed).toBe(98765)
    expect(live.snapshot()).toEqual(instant)
  })
})

function runPreparedSession(options: ReturnType<typeof prepareMatchOptions>) {
  let session = createMatchSession(options)
  while (!session.state.isComplete) session = stepMatchSession(session).session
  return session
}
