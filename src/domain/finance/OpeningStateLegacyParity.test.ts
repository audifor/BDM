import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { createFinancialCommitment, ensureCanonicalFinanceFoundation, evaluateOrganizationFinancialCommitment, getOrganizationFinancialAuthorization, legacyMajorUnitsToMoney, type OpeningEconomicStateSource } from '@/domain/finance'
import { canTeamAffordAdditionalSalary, canTeamAffordAdditionalStaffSalary, updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * BS16H read-only parity characterization (not a switch gate). Legacy affordability is a budget-vs-payroll
 * comparison: it has no notion of cash, authorization periods, commitments or reservations. Canonical Finance
 * answers with liquidity, permission and capacity protection. This file documents the exact divergences on
 * representative shipped clubs; it does not make canonical Finance imitate legacy and does not switch a
 * consumer.
 */
function acbClub(world: GameWorld) {
  const team = Object.values(world.teams)[0]!
  const finances = world.teamFinancesByTeamId[team.id]!
  return { team, finances }
}

function legacySnapshot(world: GameWorld, teamId: string, amount: number): readonly [boolean, boolean] {
  return [canTeamAffordAdditionalSalary(world, teamId as never, amount), canTeamAffordAdditionalStaffSalary(world, teamId as never, amount)]
}

function ownerCapital(organizationId: string, minorUnits: number): OpeningEconomicStateSource {
  return { sourceAuthority: 'OWNERSHIP', sourceEntityId: 'owner:parity', organizationId, currencyCode: 'EUR', effectiveOn: '2026-09-19', cashMinorUnits: minorUnits, counterpartKind: 'OWNER_CAPITAL', counterpartId: 'person:parity-owner' }
}

describe('BS16H legacy affordability parity characterization', () => {
  it('diverges on liquidity: legacy allows a salary inside budget while canonical has no cash', () => {
    const world = ensureCanonicalFinanceFoundation(createAcbTestGame())
    const { team, finances } = acbClub(world)
    const salary = legacyMajorUnitsToMoney(1_000_000, 'EUR')

    // Legacy: the salary fits the standing player budget, so it is affordable.
    expect(canTeamAffordAdditionalSalary(world, team.id, 1_000_000)).toBe(true)
    expect(finances.playerSalaryBudget).toBeGreaterThan(1_000_000)

    // Canonical: permission exists but no liquidity does, and the reason is visible.
    const decision = evaluateOrganizationFinancialCommitment(world, { organizationId: team.organizationId, currency: 'EUR', amount: salary, category: 'PLAYER_SALARY', asOfDate: world.currentDate })
    expect(decision.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(decision.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(decision.liquidity.fundingGap).toEqual(salary)
  })

  it('agrees once a legitimate opening position funds the club, and leaves legacy untouched', () => {
    const world = ensureCanonicalFinanceFoundation(createAcbTestGame())
    const { team } = acbClub(world)
    const legacyBefore = legacySnapshot(world, team.id, 1_000_000)

    const funded = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(team.organizationId, legacyMajorUnitsToMoney(2_000_000, 'EUR').minorUnits)] })
    const decision = evaluateOrganizationFinancialCommitment(funded, { organizationId: team.organizationId, currency: 'EUR', amount: legacyMajorUnitsToMoney(1_000_000, 'EUR'), category: 'PLAYER_SALARY', asOfDate: funded.currentDate })

    expect(decision.status).toBe('AFFORDABLE_NOW')
    // Characterization: canonical facts never change the legacy verdict, because the legacy authority is
    // still the shipped one — this is exactly why the switch cannot happen before the lifecycle exists.
    expect(legacySnapshot(funded, team.id, 1_000_000)).toEqual(legacyBefore)
  })

  it('diverges on authorization: legacy blocks on budget while canonical reasons about permission and scope', () => {
    const world = ensureCanonicalFinanceFoundation(createAcbTestGame())
    const { team, finances } = acbClub(world)
    const overBudget = finances.playerSalaryBudget + 5_000_000

    expect(canTeamAffordAdditionalSalary(world, team.id, overBudget)).toBe(false)
    const funded = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(team.organizationId, legacyMajorUnitsToMoney(overBudget, 'EUR').minorUnits)] })
    const decision = evaluateOrganizationFinancialCommitment(funded, { organizationId: team.organizationId, currency: 'EUR', amount: legacyMajorUnitsToMoney(overBudget, 'EUR'), category: 'PLAYER_SALARY', asOfDate: funded.currentDate })

    // Both block, for different reasons: legacy has no authorization concept beyond the standing budget pool,
    // while canonical reports the approval scope that is being exceeded. A shipped ACB career already carries
    // canonical payroll commitments for its roster, so canonical headroom is the approval minus those
    // obligations — legacy cannot see them at all.
    const playerLine = getOrganizationFinancialAuthorization(funded, { organizationId: team.organizationId, currencyCode: 'EUR', asOfDate: funded.currentDate }).lines.find((line) => line.category === 'PLAYER_SALARY')!
    expect(decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(playerLine.authorizedMinorUnits).toBe(legacyMajorUnitsToMoney(finances.playerSalaryBudget, 'EUR').minorUnits)
    expect(decision.availableAuthorizedHeadroom?.minorUnits).toBe(playerLine.availableHeadroomMinorUnits)
  })

  it('diverges on commitments: an outstanding canonical obligation reduces capacity while legacy is unaware', () => {
    const world = ensureCanonicalFinanceFoundation(createAcbTestGame())
    const { team } = acbClub(world)
    const funded = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(team.organizationId, legacyMajorUnitsToMoney(2_000_000, 'EUR').minorUnits)] })
    const committed = updateGameWorld(funded, {
      financialCommitments: [createFinancialCommitment({
        id: 'commitment:bs16h-parity',
        organizationId: team.organizationId,
        amount: legacyMajorUnitsToMoney(1_500_000, 'EUR'),
        startsOn: funded.currentDate,
        dueOn: funded.currentDate,
        category: 'PLAYER_SALARY',
        provenance: { kind: 'TEST_PARITY', id: 'bs16h' },
      })],
    })

    const decision = evaluateOrganizationFinancialCommitment(committed, { organizationId: team.organizationId, currency: 'EUR', amount: legacyMajorUnitsToMoney(1_000_000, 'EUR'), category: 'PLAYER_SALARY', asOfDate: committed.currentDate })
    expect(decision.status).toBe('INSUFFICIENT_LIQUIDITY')
    // Legacy still answers only from the budget pools, so it stays unaware of the canonical obligation.
    expect(legacySnapshot(committed, team.id, 1_000_000)).toEqual(legacySnapshot(funded, team.id, 1_000_000))
  })

  it('characterizes a prototype club the same way, including the staff budget check', () => {
    const world = ensureCanonicalFinanceFoundation(createNewGame())
    const team = Object.values(world.teams).find((candidate) => world.organizationFinancialProfilesById[candidate.organizationId] !== undefined)!
    const profile = world.organizationFinancialProfilesById[team.organizationId]!
    const currency = String(profile.baseCurrencyCode)

    expect(canTeamAffordAdditionalStaffSalary(world, team.id, 100_000)).toBe(true)
    const decision = evaluateOrganizationFinancialCommitment(world, { organizationId: team.organizationId, currency, amount: legacyMajorUnitsToMoney(100_000, currency), category: 'STAFF_SALARY', asOfDate: world.currentDate })
    expect(decision.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(decision.reasonCodes).not.toContain('CURRENCY_MISMATCH')
  })
})
