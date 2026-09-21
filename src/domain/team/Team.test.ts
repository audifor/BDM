import { describe, expect, it } from 'vitest'

import { coachIdFromString, countryIdFromString, organizationIdForTeam, organizationIdFromString, organizationSectionIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'

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

    expect(team).toEqual({
      ...input,
      organizationId: organizationIdForTeam(input.id),
      organizationSectionId: organizationSectionIdFromString('legacy-section:team-a'),
    })
    expect(team.rosterPlayerIds).not.toBe(input.rosterPlayerIds)
  })

  it('preserves explicit canonical Organization and Section IDs', () => {
    const organizationId = organizationIdFromString('organization:physical-42')
    const organizationSectionId = organizationSectionIdFromString('section:physical-7')
    const team = createTeam({ ...input, organizationId, organizationSectionId })

    expect(team.organizationId).toBe(organizationId)
    expect(team.organizationSectionId).toBe(organizationSectionId)
  })

  it('rejects duplicate roster players and empty names', () => {
    expect(() => createTeam({ ...input, rosterPlayerIds: [playerOne, playerOne] })).toThrow(RangeError)
    expect(() => createTeam({ ...input, name: '' })).toThrow(TypeError)
  })
})
