import { describe, expect, it } from 'vitest'

import { playerIdFromString, teamIdFromString } from '@/domain/ids'

import {
  createGameWorld,
  GameWorldValidationError,
  getPlayer,
  getTeam,
  getTeamCoach,
  getTeamRoster,
  getUserCoach,
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
})
