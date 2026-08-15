import { describe, expect, it } from 'vitest'

import { competitionIdFromString, teamIdFromString } from '@/domain/ids'

import { createCompetition, createCompetitionRules, defaultLeagueCompetitionRules } from './index'

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

    expect(competition).toMatchObject({ ...input, rules: defaultLeagueCompetitionRules })
    expect(competition.participantTeamIds).not.toBe(input.participantTeamIds)
  })

  it('validates only deterministic, balanced round-robin rules', () => {
    expect(createCompetitionRules(defaultLeagueCompetitionRules)).toEqual(defaultLeagueCompetitionRules)
    expect(() => createCompetitionRules({ ...defaultLeagueCompetitionRules, schedule: { ...defaultLeagueCompetitionRules.schedule, meetingsPerPair: 3 } })).toThrow('even')
    expect(() => createCompetitionRules({ ...defaultLeagueCompetitionRules, standings: { tiebreakers: ['wins'] } })).toThrow('teamId')
  })

  it('rejects duplicate participants and empty names', () => {
    expect(() => createCompetition({ ...input, participantTeamIds: [teamOne, teamOne] })).toThrow(RangeError)
    expect(() => createCompetition({ ...input, name: ' ' })).toThrow(TypeError)
  })
})
