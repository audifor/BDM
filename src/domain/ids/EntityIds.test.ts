import { describe, expect, it } from 'vitest'

import {
  createPlayerId,
  createTeamId,
  playerIdFromString,
  teamIdFromString,
  type PlayerId,
} from './index'

describe('entity IDs', () => {
  it('creates serializable player and team IDs', () => {
    const playerId = createPlayerId()
    const teamId = createTeamId()

    expect(typeof playerId).toBe('string')
    expect(typeof teamId).toBe('string')
    expect(JSON.parse(JSON.stringify({ playerId, teamId }))).toEqual({ playerId, teamId })
  })

  it('reconstructs IDs from saved strings', () => {
    expect(playerIdFromString('player-123')).toBe('player-123')
    expect(teamIdFromString('team-456')).toBe('team-456')
  })

  it('rejects empty ID values', () => {
    expect(() => playerIdFromString('')).toThrow(TypeError)
    expect(() => teamIdFromString('   ')).toThrow(TypeError)
  })

  it('keeps entity ID types distinct', () => {
    const playerId: PlayerId = playerIdFromString('player-123')
    const teamId = teamIdFromString('team-456')

    // @ts-expect-error TeamId must not be assignable to PlayerId.
    const invalidPlayerId: PlayerId = teamId

    expect(playerId).toBe('player-123')
    expect(invalidPlayerId).toBe('team-456')
  })
})
