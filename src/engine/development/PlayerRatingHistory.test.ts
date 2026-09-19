import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { CANONICAL_RATING_KEYS, legacyCanonicalRatingSignals } from '@/domain/player'
import { playerIdFromString, seasonIdFromString, type PlayerId } from '@/domain/ids'
import { ratingHistorySeries } from '@/domain/development/PlayerRatingHistory'

import { applyOffseasonDevelopment } from './OffseasonDevelopment'

const context = {
  fromSeasonId: seasonIdFromString('season-1'),
  toSeasonId: seasonIdFromString('season-2'),
  targetDate: createGameDate(2033, 10, 1),
}

describe('applyOffseasonDevelopment rating history', () => {
  it('records the canonical movement of one transition per player', () => {
    const world = createNewGame()
    const result = applyOffseasonDevelopment(world, context)

    const recordedIds = Object.keys(result.world.playerRatingHistoryByPlayerId) as PlayerId[]
    expect(recordedIds.length).toBeGreaterThan(0)

    for (const playerId of recordedIds.slice(0, 25)) {
      const history = result.world.playerRatingHistoryByPlayerId[playerId]!
      expect(history).toHaveLength(1)
      expect(history[0]!.seasonId).toBe(context.fromSeasonId)

      const before = legacyCanonicalRatingSignals(world.players[playerId]!.basketball.ratings)
      const after = legacyCanonicalRatingSignals(result.world.players[playerId]!.basketball.ratings)
      for (const key of CANONICAL_RATING_KEYS) {
        const delta = history[0]!.deltas[key] ?? 0
        expect(after[key] - before[key]).toBe(delta)
      }
    }
  })

  it('reconstructs the pre-transition rating through the recorded chain', () => {
    const world = createNewGame()
    const result = applyOffseasonDevelopment(world, context)
    const playerId = playerIdFromString(Object.keys(result.world.playerRatingHistoryByPlayerId)[0]!)
    const key = CANONICAL_RATING_KEYS.find(
      (candidate) => (result.world.playerRatingHistoryByPlayerId[playerId]![0]!.deltas[candidate] ?? 0) !== 0,
    )!

    const series = ratingHistorySeries(
      result.world.players[playerId]!.basketball.ratings,
      result.world.playerRatingHistoryByPlayerId[playerId]!,
      key,
      context.toSeasonId,
    )

    expect(series).toHaveLength(2)
    expect(series[0]).toEqual({
      seasonId: context.fromSeasonId,
      value: legacyCanonicalRatingSignals(world.players[playerId]!.basketball.ratings)[key],
    })
    expect(series[1]!.seasonId).toBe(context.toSeasonId)
    expect(series[1]!.value).toBe(
      legacyCanonicalRatingSignals(result.world.players[playerId]!.basketball.ratings)[key],
    )
  })

  it('appends a second season instead of replacing the first', () => {
    const first = applyOffseasonDevelopment(createNewGame(), context)
    const playerId = playerIdFromString(Object.keys(first.world.playerRatingHistoryByPlayerId)[0]!)
    const second = applyOffseasonDevelopment(first.world, {
      fromSeasonId: seasonIdFromString('season-2'),
      toSeasonId: seasonIdFromString('season-3'),
      targetDate: context.targetDate,
    })

    const history = second.world.playerRatingHistoryByPlayerId[playerId]!
    expect(history.map((entry) => entry.seasonId)).toEqual(['season-1', 'season-2'])
  })

  it('keeps a player without canonical movement out of the history', () => {
    const world = createNewGame()
    const result = applyOffseasonDevelopment(world, context)

    for (const [rawPlayerId, history] of Object.entries(result.world.playerRatingHistoryByPlayerId)) {
      const playerId = playerIdFromString(rawPlayerId)
      expect(history.length).toBeGreaterThan(0)
      expect(Object.keys(history[0]!.deltas).length).toBeGreaterThan(0)
      const before = legacyCanonicalRatingSignals(world.players[playerId]!.basketball.ratings)
      const after = legacyCanonicalRatingSignals(result.world.players[playerId]!.basketball.ratings)
      expect(CANONICAL_RATING_KEYS.some((key) => before[key] !== after[key])).toBe(true)
    }
  })
})
