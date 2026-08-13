import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import { countryIdFromString, playerIdFromString, seasonIdFromString } from '@/domain/ids'
import { createPlayer } from '@/domain/player'

import { developPlayerForSeason, getBaseDevelopmentTrend } from './PlayerDevelopment'

const context = { fromSeasonId: seasonIdFromString('season-1'), toSeasonId: seasonIdFromString('season-2'), targetDate: createGameDate(2033, 10, 1) }
function player(birthDate: string, rating = 50) { return createPlayer({ id: playerIdFromString(`player-${birthDate}-${rating}`), firstName: 'Test', lastName: 'Player', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'PG', ratings: { finishing: rating, shooting: rating, playmaking: rating, perimeterDefense: rating, interiorDefense: rating, rebounding: rating, athleticism: rating } }, bio: { dateOfBirth: birthDate, heightCm: 188, weightKg: 86 } }) }

describe('PlayerDevelopment', () => {
  it('uses the provisional age curve', () => {
    expect(getBaseDevelopmentTrend(18)).toBe(3.5); expect(getBaseDevelopmentTrend(21)).toBe(2.5); expect(getBaseDevelopmentTrend(24)).toBe(1.5); expect(getBaseDevelopmentTrend(27)).toBe(0.5); expect(getBaseDevelopmentTrend(29)).toBe(-0.5); expect(getBaseDevelopmentTrend(31)).toBe(-1.5); expect(getBaseDevelopmentTrend(33)).toBe(-2.5); expect(getBaseDevelopmentTrend(35)).toBe(-3.5)
  })

  it('is deterministic, immutable, bounded, and keeps non-rating player data unchanged', () => {
    const original = player('2013-10-01')
    const first = developPlayerForSeason(original, context)
    const second = developPlayerForSeason(original, context)
    expect(first).toEqual(second)
    expect(original.basketball.ratings).toEqual({ finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 })
    expect(first.player.bio).toEqual(original.bio)
    expect(first.result.ratings.every((item) => item.after >= 0 && item.after <= 100 && item.delta >= -5 && item.delta <= 4 && item.after - item.before === item.delta)).toBe(true)
  })

  it('gives high ratings less positive growth room and clamps endpoints', () => {
    const young = player('2013-10-01', 99)
    const developed = developPlayerForSeason(young, context)
    expect(developed.result.ratings.every((item) => item.after <= 100)).toBe(true)
    const old = developPlayerForSeason(player('1990-01-01', 0), context)
    expect(old.result.ratings.every((item) => item.after >= 0)).toBe(true)
  })
})
