import { describe, expect, it } from 'vitest'

import { coachIdFromString, countryIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'

import { createTeam } from './index'

describe('Team', () => {
  const playerOne = playerIdFromString('player-a')
  const playerTwo = playerIdFromString('player-b')
  const input = {
    id: teamIdFromString('team-a'),
    name: 'Arcadia Owls',
    gender: 'female' as const,
    countryId: countryIdFromString('country-a'),
    rosterPlayerIds: [playerOne, playerTwo],
    coachId: coachIdFromString('coach-a'),
  }

  it('creates a valid team and preserves its roster', () => {
    const team = createTeam(input)

    expect(team).toEqual(input)
    expect(team.rosterPlayerIds).not.toBe(input.rosterPlayerIds)
  })

  it('rejects duplicate roster players and empty names', () => {
    expect(() => createTeam({ ...input, rosterPlayerIds: [playerOne, playerOne] })).toThrow(RangeError)
    expect(() => createTeam({ ...input, name: '' })).toThrow(TypeError)
  })
})
