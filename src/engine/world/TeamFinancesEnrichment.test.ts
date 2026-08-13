import { createNewGame } from '@/app/game'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { describe, expect, it } from 'vitest'

import { ensureTeamFinances } from './TeamFinancesEnrichment'

describe('ensureTeamFinances', () => {
  it('deterministically completes only missing profiles while preserving existing ones', () => {
    const world = createNewGame()
    const existing = Object.values(world.teamFinancesByTeamId).slice(0, -1)
    const input = {
      currentDate: world.currentDate,
      teams: Object.values(world.teams),
      contracts: Object.values(world.contractsById),
      teamFinances: existing,
    }

    const first = ensureTeamFinances(input)
    const second = ensureTeamFinances(input)

    expect(first).toEqual(second)
    expect(first).toHaveLength(Object.keys(world.teams).length)
    expect(first.slice(0, existing.length)).toEqual(existing)
    expect(ensureTeamFinances({ ...input, teamFinances: first })).toEqual(first)
    for (const team of Object.values(world.teams)) {
      const enrichedWorld = { ...world, teamFinancesByTeamId: Object.fromEntries(first.map((finance) => [finance.teamId, finance])) }
      expect(() => getTeamFinancialSnapshot(enrichedWorld, team.id)).not.toThrow()
    }
  })
})
