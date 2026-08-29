import type { CreatePlayerInput, LegacyPlayerRatings } from './Player'

export function createTestBasketballProfile(): Pick<CreatePlayerInput['basketball'], 'primaryPosition' | 'ratings'> {
  return {
    primaryPosition: 'PG',
    ratings: {
      finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50,
      interiorDefense: 50, rebounding: 50, athleticism: 50,
    } satisfies LegacyPlayerRatings,
  }
}

export function createTestPlayerBio() {
  return { dateOfBirth: '2008-06-14' as import('@/domain/date').GameDate, heightCm: 188, weightKg: 86 }
}
