import { describe, expect, it } from 'vitest'

import { competitionIdFromString, teamIdFromString } from '@/domain/ids'

import { createCompetition } from './index'

describe('Competition', () => {
  const teamOne = teamIdFromString('team-a')
  const teamTwo = teamIdFromString('team-b')
  const input = {
    id: competitionIdFromString('competition-a'),
    name: 'Continental Cup',
    gender: 'female' as const,
    participantTeamIds: [teamOne, teamTwo],
  }

  it('creates a valid competition and preserves participants', () => {
    const competition = createCompetition(input)

    expect(competition).toEqual(input)
    expect(competition.participantTeamIds).not.toBe(input.participantTeamIds)
  })

  it('rejects duplicate participants and empty names', () => {
    expect(() => createCompetition({ ...input, participantTeamIds: [teamOne, teamOne] })).toThrow(RangeError)
    expect(() => createCompetition({ ...input, name: ' ' })).toThrow(TypeError)
  })
})
