import { describe, expect, it } from 'vitest'

import { ecosystemIdFromString } from '@/domain/ids'
import { createSportsEcosystem, createTradeDeadlinePolicy } from './SportsEcosystem'

describe('SportsEcosystem trade deadline policy', () => {
  it('accepts a regular-season game fraction policy on an NBA-like ecosystem', () => {
    const ecosystem = createSportsEcosystem({ id: ecosystemIdFromString('ecosystem:nba'), name: 'Franchise Basketball', kind: 'nbaLike', category: 'women', tradeDeadlinePolicy: { kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 } })

    expect(ecosystem.tradeDeadlinePolicy).toEqual({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 })
    expect(Object.isFrozen(ecosystem.tradeDeadlinePolicy)).toBe(true)
  })

  it('rejects an unsupported kind or a fraction outside (0, 1]', () => {
    expect(() => createTradeDeadlinePolicy({ kind: 'FIXED_MONTH_DAY' as never, fraction: 0.65 })).toThrow('kind is unsupported')
    expect(() => createTradeDeadlinePolicy({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0 })).toThrow('within (0, 1]')
    expect(() => createTradeDeadlinePolicy({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 1.5 })).toThrow('within (0, 1]')
    expect(() => createTradeDeadlinePolicy({ kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: Number.NaN })).toThrow('within (0, 1]')
  })

  it('keeps the NBA-style mechanism out of ecosystems that must not inherit it', () => {
    expect(() => createSportsEcosystem({ id: ecosystemIdFromString('ecosystem:fiba'), name: 'European League', kind: 'fibaLike', tradeDeadlinePolicy: { kind: 'REGULAR_SEASON_GAME_FRACTION', fraction: 0.65 } })).toThrow('only valid for an NBA-like ecosystem')
    expect(createSportsEcosystem({ id: ecosystemIdFromString('ecosystem:fiba'), name: 'European League', kind: 'fibaLike' }).tradeDeadlinePolicy).toBeUndefined()
  })
})
