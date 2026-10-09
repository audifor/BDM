import { describe, expect, it } from 'vitest'
import { createGameWorld, canTeamAffordAdditionalSalary, canTeamAffordAdditionalStaffSalary } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { teamIdFromString } from '@/domain/ids'
import { createOrganizationFinancialProfile, createTeamFinances, evaluateFinancialCommitment, reserveFinancialCommitment } from '@/domain/finance'

const teamId = teamIdFromString('team-home')
const ANNUAL_SALARY = 250_000
const PLAYER_BUDGET = 1_000_000
const STAFF_BUDGET = 500_000

function legacyWorld(overrides: { readonly playerSalaryBudget?: number; readonly staffSalaryBudget?: number } = {}) {
  return createGameWorld({
    ...createValidGameWorldInput(),
    teamFinances: [
      createTeamFinances({
        teamId,
        playerSalaryBudget: overrides.playerSalaryBudget ?? PLAYER_BUDGET,
        staffSalaryBudget: overrides.staffSalaryBudget ?? STAFF_BUDGET,
      }),
    ],
  })
}

function organizationProfileFor(world: ReturnType<typeof legacyWorld>) {
  return createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' })
}

/**
 * BS16C legacy parity characterization. Legacy `TeamFinances` affordability is a pure budget/payroll
 * rule with no notion of cash, obligations or reservations. The canonical authority adds liquidity,
 * authoritative commitments and reserved capacity. Both are evaluated side by side; the legacy
 * authority keeps running live gameplay and nothing is switched here.
 */
describe('BS16C legacy parity characterization', () => {
  it('legacy salary allows and canonical liquidity allows', () => {
    const world = legacyWorld()
    const canonical = evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' }),
      organizationId: world.teams[teamId]!.organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: PLAYER_BUDGET },
    })

    expect(canTeamAffordAdditionalSalary(world, teamId, ANNUAL_SALARY)).toBe(true)
    expect(canonical.status).toBe('AFFORDABLE_NOW')
  })

  it('legacy salary allows while canonical liquidity is insufficient', () => {
    const world = legacyWorld()
    const canonical = evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' }),
      organizationId: world.teams[teamId]!.organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: 100_000 },
    })

    expect(canTeamAffordAdditionalSalary(world, teamId, ANNUAL_SALARY)).toBe(true)
    expect(canonical.status).toBe('INSUFFICIENT_LIQUIDITY')
  })

  it('legacy salary blocks on budget while canonical liquidity is available', () => {
    const world = legacyWorld({ playerSalaryBudget: 100_000 })
    const canonical = evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' }),
      organizationId: world.teams[teamId]!.organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: PLAYER_BUDGET },
    })

    expect(canTeamAffordAdditionalSalary(world, teamId, ANNUAL_SALARY)).toBe(false)
    expect(canonical.status).toBe('AFFORDABLE_NOW')
  })

  it('a canonical reservation consumes capacity while legacy remains unaware', () => {
    const world = legacyWorld()
    const organizationId = world.teams[teamId]!.organizationId
    const profile = organizationProfileFor(world)
    const held = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: { currencyCode: 'EUR', minorUnits: 900_000 },
      currentCash: { currencyCode: 'EUR', minorUnits: 1_000_000 },
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:project-1',
      createdOn: '2032-10-01',
    })
    const canonicalAfterReservation = evaluateFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: 1_000_000 },
      activeReservations: held.reservations,
    })

    expect(held.outcome).toBe('CREATED')
    expect(canTeamAffordAdditionalSalary(world, teamId, ANNUAL_SALARY)).toBe(true)
    expect(canonicalAfterReservation.status).toBe('RESERVED_CAPACITY_CONFLICT')
  })

  it('legacy staff salary allows and canonical liquidity allows', () => {
    const world = legacyWorld()
    const canonical = evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' }),
      organizationId: world.teams[teamId]!.organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: STAFF_BUDGET },
    })

    expect(canTeamAffordAdditionalStaffSalary(world, teamId, ANNUAL_SALARY)).toBe(true)
    expect(canonical.status).toBe('AFFORDABLE_NOW')
  })

  it('legacy staff salary blocks on budget while canonical liquidity is available', () => {
    const world = legacyWorld({ staffSalaryBudget: 100_000 })
    const canonical = evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' }),
      organizationId: world.teams[teamId]!.organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: STAFF_BUDGET },
    })

    expect(canTeamAffordAdditionalStaffSalary(world, teamId, ANNUAL_SALARY)).toBe(false)
    expect(canonical.status).toBe('AFFORDABLE_NOW')
  })

  it('legacy staff salary allows while canonical liquidity is insufficient', () => {
    const world = legacyWorld()
    const canonical = evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: world.teams[teamId]!.organizationId, baseCurrencyCode: 'EUR' }),
      organizationId: world.teams[teamId]!.organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: 10_000 },
    })

    expect(canTeamAffordAdditionalStaffSalary(world, teamId, ANNUAL_SALARY)).toBe(true)
    expect(canonical.status).toBe('INSUFFICIENT_LIQUIDITY')
  })

  it('legacy player and staff budgets are separate while canonical capacity is one pooled resource', () => {
    const world = legacyWorld({ playerSalaryBudget: 1, staffSalaryBudget: STAFF_BUDGET })
    const organizationId = world.teams[teamId]!.organizationId

    // Divergence reason: legacy splits player and staff budget pools; canonical cash is organization-wide.
    expect(canTeamAffordAdditionalSalary(world, teamId, ANNUAL_SALARY)).toBe(false)
    expect(canTeamAffordAdditionalStaffSalary(world, teamId, ANNUAL_SALARY)).toBe(true)
    expect(evaluateFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' }),
      organizationId,
      amount: { currencyCode: 'EUR', minorUnits: ANNUAL_SALARY },
      currentCash: { currencyCode: 'EUR', minorUnits: STAFF_BUDGET },
      commitmentCategory: 'PLAYER_SALARY',
    }).status).toBe('AFFORDABLE_NOW')
  })
})
