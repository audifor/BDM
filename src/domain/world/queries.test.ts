import { describe, expect, it } from 'vitest'

import { competitionIdFromString, gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { NCAA_MEN_GAME_FORMAT } from '@/domain/competition'

import {
  createGameWorld,
  GameWorldValidationError,
  getGame,
  getPlayer,
  getTeam,
  getTeamCoach,
  getTeamRoster,
  getUserCoach,
  resolveGameClockRules,
  resolveGameClockRulesForGame,
} from './index'
import { createValidGameWorldInput } from './testFixtures'

describe('GameWorld queries', () => {
  const world = createGameWorld(createValidGameWorldInput())

  it('gets entities and the user coach by ID', () => {
    expect(getPlayer(world, playerIdFromString('player-home'))).toMatchObject({ id: 'player-home' })
    expect(getTeam(world, teamIdFromString('team-home'))).toMatchObject({ id: 'team-home' })
    expect(getUserCoach(world)).toMatchObject({ id: 'coach-user' })
  })

  it('resolves a team roster and optional coach', () => {
    expect(getTeamRoster(world, teamIdFromString('team-home'))).toEqual([
      expect.objectContaining({ id: 'player-home' }),
    ])
    expect(getTeamCoach(world, teamIdFromString('team-home'))).toMatchObject({ id: 'coach-user' })
    expect(getTeamCoach(world, teamIdFromString('team-away'))).toBeUndefined()
  })

  it('fails explicitly for missing IDs', () => {
    expect(() => getPlayer(world, playerIdFromString('missing-player'))).toThrow(GameWorldValidationError)
  })

  it('resolves seconds-based game clock rules from the competition\'s own gameFormat, defaulting to FIBA-style 4x10', () => {
    const rules = resolveGameClockRules(world, competitionIdFromString('competition-a'))
    expect(rules).toEqual({ periodCount: 4, periodSeconds: 600, overtimeSeconds: 300 })

    const game = getGame(world, gameIdFromString('game-a'))
    expect(resolveGameClockRulesForGame(world, game)).toEqual(rules)
  })

  it('resolves a different competition\'s explicitly configured gameFormat without any ecosystem/brand branching', () => {
    const worldWithNcaaMen = createGameWorld({
      ...createValidGameWorldInput(),
      competitions: [{ ...world.competitions[competitionIdFromString('competition-a')]!, rules: { ...world.competitions[competitionIdFromString('competition-a')]!.rules, gameFormat: NCAA_MEN_GAME_FORMAT } }],
    })
    expect(resolveGameClockRules(worldWithNcaaMen, competitionIdFromString('competition-a'))).toEqual({ periodCount: 2, periodSeconds: 1200, overtimeSeconds: 300 })
  })
})
