import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import {
  competitionIdFromString,
  gameIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'

import { createGame } from './index'

describe('Game', () => {
  const input = {
    id: gameIdFromString('game-a'),
    seasonId: seasonIdFromString('season-a'),
    competitionId: competitionIdFromString('competition-a'),
    date: createGameDate(2032, 10, 1),
    homeTeamId: teamIdFromString('team-home'),
    awayTeamId: teamIdFromString('team-away'),
  }

  it('creates a scheduled game with no result', () => {
    expect(createGame({ ...input, status: 'scheduled', result: null })).toEqual({
      ...input,
      status: 'scheduled',
      result: null,
      stakes: 'regular',
    })
  })

  it('enforces result consistency with game status', () => {
    expect(() => createGame({ ...input, status: 'scheduled', result: { homeScore: 1, awayScore: 0 } })).toThrow(
      RangeError,
    )
    expect(() => createGame({ ...input, status: 'completed', result: null })).toThrow(RangeError)
  })

  it('creates a completed game with a final result', () => {
    expect(createGame({ ...input, status: 'completed', result: { homeScore: 82, awayScore: 79 } })).toEqual({
      ...input,
      status: 'completed',
      result: { homeScore: 82, awayScore: 79 },
      stakes: 'regular',
    })
  })

  it('preserves explicit canonical competitive stakes', () => {
    expect(createGame({ ...input, status: 'scheduled', result: null, stakes: 'elimination' }).stakes).toBe('elimination')
  })

  it('rejects invalid teams and scores', () => {
    expect(() => createGame({ ...input, awayTeamId: input.homeTeamId, status: 'scheduled', result: null })).toThrow(
      RangeError,
    )
    expect(() => createGame({ ...input, status: 'completed', result: { homeScore: -1, awayScore: 0 } })).toThrow(
      RangeError,
    )
    expect(() => createGame({ ...input, status: 'completed', result: { homeScore: 1.5, awayScore: 0 } })).toThrow(
      RangeError,
    )
  })
})
