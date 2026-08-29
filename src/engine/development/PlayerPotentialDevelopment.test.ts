import { describe, expect, it } from 'vitest'
import { createGameDate } from '@/domain/date'
import { playerIdFromString, seasonIdFromString } from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { calculatePotentialGrowthFactor, developPlayerForSeason } from './PlayerDevelopment'

const ratings = { finishing: 60, shooting: 60, playmaking: 60, perimeterDefense: 60, interiorDefense: 60, rebounding: 60, athleticism: 60 }
const context = { fromSeasonId: seasonIdFromString('season-1'), toSeasonId: seasonIdFromString('season-2'), targetDate: createGameDate(2032, 10, 1) }
function player(ceiling: number, dateOfBirth = '2013-01-01') { return createPlayer({ id: playerIdFromString('potential-player'), firstName: 'Potential', lastName: 'Player', gender: 'male', nationalityId: 'country-1' as never, basketball: { primaryPosition: 'PG', ratings }, bio: { dateOfBirth, heightCm: 180, weightKg: 80 }, potential: { ceiling } }) }

describe('potential development', () => {
  it('keeps the factor in range and handles ability above its ceiling', () => {
    expect(calculatePotentialGrowthFactor(player(60))).toBe(0.25)
    expect(calculatePotentialGrowthFactor(player(100))).toBe(1)
    expect(calculatePotentialGrowthFactor(player(80))).toBeGreaterThan(0.25)
    expect(calculatePotentialGrowthFactor(player(80))).toBeLessThan(1)
  })

  it('gives equivalent young players with higher potential at least as much growth', () => {
    const low = developPlayerForSeason(player(60), context).result.ratings
    const high = developPlayerForSeason(player(100), context).result.ratings
    expect(high.every((entry, index) => entry.delta >= low[index]!.delta)).toBe(true)
  })

  it('does not let potential prevent veteran decline', () => {
    const elite = developPlayerForSeason(player(100, '1990-01-01'), context).result.ratings
    const limited = developPlayerForSeason(player(60, '1990-01-01'), context).result.ratings
    expect(elite).toEqual(limited)
  })
})
