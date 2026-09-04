import type { Player } from '@/domain/player'

export type RosterPositionFilter = 'ALL' | Player['basketball']['primaryPosition']

export const ROSTER_POSITION_FILTERS: readonly RosterPositionFilter[] = [
  'ALL',
  'PG',
  'SG',
  'SF',
  'PF',
  'C',
]

export function filterRosterByPosition<T extends { readonly basketball: { readonly primaryPosition: Player['basketball']['primaryPosition'] } }>(
  rows: readonly T[],
  positionFilter: RosterPositionFilter,
): readonly T[] {
  if (positionFilter === 'ALL') return rows
  return rows.filter((player) => player.basketball.primaryPosition === positionFilter)
}
