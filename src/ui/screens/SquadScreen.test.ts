import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { getTeamFinancialSnapshot } from '@/domain/world'
import { formatMoney, formatPercentage } from '@/ui/formatters'

import { SquadScreen } from './SquadScreen'

describe('SquadScreen', () => {
  it('renders the canonical user-team financial snapshot without removing squad content', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
    const finances = getTeamFinancialSnapshot(world, team.id)
    const markup = renderToStaticMarkup(createElement(SquadScreen, { world }))

    expect(markup).toContain('PLAYER SALARY FINANCES')
    expect(markup).toContain('SALARY BUDGET')
    expect(markup).toContain(formatMoney(finances.playerSalaryBudget))
    expect(markup).toContain('PAYROLL')
    expect(markup).toContain(formatMoney(finances.currentPlayerPayroll))
    expect(markup).toContain('REMAINING')
    expect(markup).toContain(formatMoney(finances.remainingPlayerSalaryBudget))
    expect(markup).toContain('BUDGET USED')
    expect(markup).toContain(formatPercentage(finances.budgetUsageRatio))
    expect(markup).toContain('STATUS')
    expect(markup).toContain(finances.status.toUpperCase())
    expect(markup).toContain('SEASON STATS')
    expect(markup).toContain('PLAYER HISTORY')
    expect(markup).toContain('RELEASE')
  })

  it('renders updated finance projections after a release and preserves negative remaining values', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
    const released = releasePlayer(world, team.id, team.rosterPlayerIds[0]!)
    const releasedFinances = getTeamFinancialSnapshot(released, team.id)
    const overBudget = {
      ...world,
      teamFinancesByTeamId: { ...world.teamFinancesByTeamId, [team.id]: { ...world.teamFinancesByTeamId[team.id]!, playerSalaryBudget: 1 } },
    }

    expect(releasedFinances.currentPlayerPayroll).toBeLessThan(getTeamFinancialSnapshot(world, team.id).currentPlayerPayroll)
    expect(renderToStaticMarkup(createElement(SquadScreen, { world: released }))).toContain(formatMoney(releasedFinances.currentPlayerPayroll))
    const overBudgetFinances = getTeamFinancialSnapshot(overBudget, team.id)
    const overBudgetMarkup = renderToStaticMarkup(createElement(SquadScreen, { world: overBudget }))
    expect(overBudgetMarkup).toContain(formatMoney(overBudgetFinances.remainingPlayerSalaryBudget))
    expect(overBudgetMarkup).toContain('OVER BUDGET')
  })
})
