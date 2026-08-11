export type BasketballPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C'

export const BASKETBALL_POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']

export function requireBasketballPosition(value: string): BasketballPosition {
  if (!BASKETBALL_POSITIONS.includes(value as BasketballPosition)) {
    throw new TypeError(`Invalid BasketballPosition: ${value}`)
  }

  return value as BasketballPosition
}
