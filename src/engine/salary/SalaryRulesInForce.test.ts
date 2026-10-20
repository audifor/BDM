import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { parseGameDate } from '@/domain/date'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { salaryRulesInForce } from './SalaryRulesInForce'

describe('F3 · salaryRulesInForce', () => {
  const world = createAcbTestGame({ userTeamKey: 'ucm', careerStartDate: parseGameDate('2026-07-01'), playableMarket: true })
  const teamId = getUserTeam(world)!.id
  const season = world.seasons[world.currentSeasonId]!

  it('resolves the season rules inside the season window', () => {
    expect(salaryRulesInForce(world, teamId, season.startDate)).toEqual([world.salaryRulesBySeasonId[season.id]])
    expect(salaryRulesInForce(world, teamId, season.endDate)).toHaveLength(1)
  })

  it('keeps the last ended season\'s rules in force through the off-season (a contract that starts or expires on 1 July)', () => {
    expect(salaryRulesInForce(world, teamId, parseGameDate('2028-07-01'))).toEqual([world.salaryRulesBySeasonId[season.id]])
  })

  it('has nothing in force before the first season or when the governing season carries no rules (callers keep failing closed)', () => {
    expect(salaryRulesInForce(world, teamId, parseGameDate('2026-07-01'))).toHaveLength(0)
    expect(salaryRulesInForce(updateGameWorld(world, { salaryRulesBySeasonId: {} }), teamId, season.startDate)).toHaveLength(0)
    expect(salaryRulesInForce(updateGameWorld(world, { salaryRulesBySeasonId: {} }), teamId, parseGameDate('2028-07-01'))).toHaveLength(0)
  })

  it('the ACB demo rules are explicitly uncapped, with contract-length bounds equal to what the universe\'s own generators produce', () => {
    const rules = world.salaryRulesBySeasonId[season.id]!
    expect(rules).toMatchObject({ capModel: 'none', capAccounting: 'NOT_APPLICABLE', contractLength: { minimumYears: 1, maximumYears: 5 } })
    expect(rules.minimumSalaryBands).toHaveLength(0)
    expect(rules.exceptionRules).toHaveLength(0)
    expect(createAcbTestGame({ userTeamKey: 'ucm' }).salaryRulesBySeasonId).toEqual({}) // development fixtures keep shipping no rules
  })
})
