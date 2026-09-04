import { describe, expect, it } from 'vitest'

import { createConfiguredGame, createNewGame } from '@/app/game'
import { ACB_QUICK_START_TEAM_KEY, ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import type { PlayerId } from '@/domain/ids'

import {
  aggregateCategoryValue,
  buildOverviewRatingKeys,
  ratingCategory,
} from './ratingCatalog'
import {
  buildPlayerWorkspaceModel,
  defaultPlayerIdForNg,
  rosterPlayerOptions,
} from './buildPlayerWorkspaceModel'

describe('buildPlayerWorkspaceModel', () => {
  it('builds a real presentation model from canonical player ratings', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)
    expect(playerId).toBeDefined()

    const model = buildPlayerWorkspaceModel(world, playerId!)
    expect(model).toBeDefined()
    expect(model!.ratings.length).toBeGreaterThan(0)
    expect(model!.ratings.every((rating) => rating.value >= 1 && rating.value <= 100)).toBe(true)
    expect(model!.strengths).toHaveLength(3)
    expect(model!.limitations).toHaveLength(3)
    expect(model!.shotProfile.status).toBe('unavailable')
    expect(model!.roleProfile.isDerived).toBe(true)
    expect(model!.identity.jerseyNumber.status).toBe('unavailable')
  })

  it('aggregates radar categories as the mean of canonical ratings in each family', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const expected = aggregateCategoryValue('shooting', player.basketball.ratings)
    const model = buildPlayerWorkspaceModel(world, playerId)
    expect(model!.radarAxes.find((axis) => axis.key === 'shooting')?.value).toBe(expected)
  })

  it('selects a representative overview subset capped at twelve ratings', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const keys = buildOverviewRatingKeys(world.players[playerId]!.basketball.ratings)
    expect(keys.length).toBeLessThanOrEqual(12)
    expect(keys.every((key) => ratingCategory(key))).toBeTruthy()
  })

  it('supports switching across roster players without inventing domain fields', () => {
    const world = createConfiguredGame({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: ACB_QUICK_START_TEAM_KEY })
    const options = rosterPlayerOptions(world)
    expect(options.length).toBeGreaterThan(0)

    const guard = options.find((option) => option.label.includes('PG')) ?? options[0]
    const big = options.find((option) => option.label.includes('C ') || option.label.endsWith('· C')) ?? options.at(-1)

    const guardModel = buildPlayerWorkspaceModel(world, guard!.id as PlayerId)
    const bigModel = buildPlayerWorkspaceModel(world, big!.id as PlayerId)

    expect(guardModel!.identity.firstName).not.toEqual(bigModel!.identity.firstName)
    expect(guardModel!.ratings.some((rating) => rating.label.length > 0)).toBe(true)
  })
})
