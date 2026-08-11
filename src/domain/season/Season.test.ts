import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import { competitionIdFromString, seasonIdFromString } from '@/domain/ids'

import { createSeason } from './index'

describe('Season', () => {
  const input = {
    id: seasonIdFromString('season-a'),
    competitionId: competitionIdFromString('competition-a'),
    label: '2032-33',
    startDate: createGameDate(2032, 10, 1),
    endDate: createGameDate(2033, 5, 31),
  }

  it('creates a valid season and permits a one-day season', () => {
    expect(createSeason(input)).toEqual(input)
    expect(
      createSeason({
        ...input,
        startDate: createGameDate(2032, 10, 1),
        endDate: createGameDate(2032, 10, 1),
      }),
    ).toMatchObject({ label: '2032-33' })
  })

  it('rejects an end date before the start date', () => {
    expect(() => createSeason({ ...input, startDate: input.endDate, endDate: input.startDate })).toThrow(
      RangeError,
    )
  })
})
