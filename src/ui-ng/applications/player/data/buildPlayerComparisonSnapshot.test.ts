import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { PLAYER_TRUTH_RATING_KEYS, getPlayerAge } from '@/domain/player'
import { updateGameWorld } from '@/domain/world'

import {
  buildPlayerComparisonSnapshot,
  comparablePlayerOptions,
} from './buildPlayerComparisonSnapshot'

function playerIdOf(world: ReturnType<typeof createNewGame>, index: number) {
  return Object.values(world.players)[index]!.id
}

describe('buildPlayerComparisonSnapshot', () => {
  it('exposes every canonical rating of the rival plus their identity', () => {
    const world = createNewGame()
    const playerId = playerIdOf(world, 3)
    const snapshot = buildPlayerComparisonSnapshot(world, playerId)!

    expect(snapshot.playerId).toBe(playerId)
    expect(snapshot.name.length).toBeGreaterThan(0)
    expect(snapshot.teamName.length).toBeGreaterThan(0)
    expect(snapshot.age).toBe(getPlayerAge(world, playerId))
    expect(Object.keys(snapshot.ratings)).toHaveLength(PLAYER_TRUTH_RATING_KEYS.length)
    expect(snapshot.ratings.THREE_POINT_STATIC).toBe(
      world.players[playerId]!.basketball.ratings.THREE_POINT_STATIC,
    )
  })

  it('returns nothing for a player the world no longer has', () => {
    const world = createNewGame()

    expect(buildPlayerComparisonSnapshot(world, 'player:missing' as never)).toBeUndefined()
  })

  it('offers every other player, sorted, and never the inspected one', () => {
    const world = createNewGame()
    const inspected = playerIdOf(world, 0)
    const options = comparablePlayerOptions(world, inspected)

    expect(options).toHaveLength(Object.keys(world.players).length - 1)
    expect(options.some((option) => option.id === inspected)).toBe(false)
    expect(options.map((option) => option.name)).toEqual(
      [...options.map((option) => option.name)].sort((left, right) => left.localeCompare(right)),
    )
  })

  it('reports a free agent without inventing a club', () => {
    const world = createNewGame()
    const playerId = playerIdOf(world, 1)
    const orphaned = updateGameWorld(world, {
      teams: Object.values(world.teams).map((team) => ({
        ...team,
        rosterPlayerIds: team.rosterPlayerIds.filter((id) => id !== playerId),
      })),
    })

    expect(buildPlayerComparisonSnapshot(orphaned, playerId)!.teamName).toBe('Free agent')
  })
})
