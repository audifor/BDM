import type { BasketballProfile } from './Player'

export function createTestBasketballProfile(): BasketballProfile {
  return {
    primaryPosition: 'PG',
    ratings: {
      finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50,
      interiorDefense: 50, rebounding: 50, athleticism: 50,
    },
  }
}
