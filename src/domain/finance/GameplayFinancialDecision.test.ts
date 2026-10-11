import { describe, expect, it } from 'vitest'
import { PROTOTYPE_GAME_CONFIGURATION, createAcbTestGame, createNewGame } from '@/app/game'
import type { TeamId } from '@/domain/ids'
import { generateWorld } from '@/engine/world'
import { resolveOrganizationCurrency } from './FinanceCurrencyPolicy'
import type { GameWorld } from '@/domain/world'
import {
  GAMEPLAY_FINANCIAL_ACTION_CATEGORY,
  evaluateGameplayFinancialDecision,
  evaluateTeamGameplayFinancialDecision,
  gameplayFinancialBlockReason,
} from './GameplayFinancialDecision'
import { authorizeTeamSalaryForTest, cashMinorUnitsForTest, commitTeamLiquidityForTest, financingDrawdownForTest, fundTeamWithOpeningCapital } from './financeTestFixture'
import { createFinancialReservation } from './FinancialAuthority'
import { updateGameWorld } from '@/domain/world'

/**
 * BS16M-A certification of the single gameplay Finance seam: it maps gameplay actions onto canonical
 * commitment categories, delegates every judgement to the canonical candidate-commitment authority, and
 * never becomes an authority of its own.
 */
const EUR = 'EUR'

function club(): { readonly world: GameWorld; readonly teamId: import('@/domain/ids').TeamId } {
  const world = createAcbTestGame()
  return { world, teamId: Object.values(world.teams)[0]!.id }
}

function fundedClub(): { readonly world: GameWorld; readonly teamId: import('@/domain/ids').TeamId } {
  const base = club()
  return {
    teamId: base.teamId,
    world: authorizeTeamSalaryForTest(
      fundTeamWithOpeningCapital(base.world, base.teamId, { currencyCode: EUR, cashMinorUnits: 500_000_000 }),
      base.teamId,
      { currencyCode: EUR, playerSalaryMinorUnits: 200_000_000_000, staffSalaryMinorUnits: 200_000_000_000 },
    ),
  }
}

function decision(world: GameWorld, teamId: import('@/domain/ids').TeamId, action: keyof typeof GAMEPLAY_FINANCIAL_ACTION_CATEGORY, majorUnits = 500_000) {
  return evaluateTeamGameplayFinancialDecision(world, { teamId, action, legacyAnnualAmountMajorUnits: majorUnits, sourceAuthority: 'TEST', sourceEntityId: 'test' })
}

describe('BS16M-A gameplay finance gateway', () => {
  it('maps every gameplay action onto an existing canonical category and never invents one', () => {
    expect(GAMEPLAY_FINANCIAL_ACTION_CATEGORY).toEqual({
      PLAYER_SIGNING: 'PLAYER_SALARY',
      MARKET_OFFER: 'PLAYER_SALARY',
      PLAYER_RETENTION: 'PLAYER_SALARY',
      STAFF_HIRING: 'STAFF_SALARY',
    })
    const { world, teamId } = fundedClub()
    expect(decision(world, teamId, 'PLAYER_SIGNING').category).toBe('PLAYER_SALARY')
    expect(decision(world, teamId, 'MARKET_OFFER').category).toBe('PLAYER_SALARY')
    expect(decision(world, teamId, 'PLAYER_RETENTION').category).toBe('PLAYER_SALARY')
    expect(decision(world, teamId, 'STAFF_HIRING').category).toBe('STAFF_SALARY')
  })

  it('converts legacy whole-major-unit salaries once and preserves the canonical currency and amount', () => {
    const { world, teamId } = fundedClub()
    const result = decision(world, teamId, 'PLAYER_SIGNING', 1_234_567)
    expect(result.currency).toBe(EUR)
    expect(result.amount).toEqual({ currencyCode: EUR, minorUnits: 123_456_700 })
  })

  it('delegates to the canonical authority instead of deciding anything itself', () => {
    const { world, teamId } = fundedClub()
    const organizationId = world.teams[teamId]!.organizationId
    const organization = evaluateGameplayFinancialDecision(world, {
      organizationId,
      action: 'PLAYER_SIGNING',
      amount: { currencyCode: EUR, minorUnits: 500_000 * 100 },
      sourceAuthority: 'TEST',
      sourceEntityId: 'test',
    })
    const team = decision(world, teamId, 'PLAYER_SIGNING')
    expect(team.status).toBe(organization.status)
    expect(team.outcome).toBe(organization.outcome)
    expect(team.reasons).toEqual(organization.reasons)
    expect(team.liquidity).toEqual(organization.liquidity)
  })

  it('allows only the canonical AFFORDABLE_NOW status and keeps every canonical reason code', () => {
    const { world, teamId } = fundedClub()
    const allowed = decision(world, teamId, 'PLAYER_SIGNING')
    expect(allowed.allowed).toBe(true)
    expect(allowed.status).toBe('AFFORDABLE_NOW')
    expect(allowed.outcome).toBe('CAN_AFFORD')
    expect(allowed.reasons).toEqual(['AFFORDABLE_NOW'])

    const blocked = decision(world, teamId, 'PLAYER_SIGNING', 100_000_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(blocked.reasons).toContain('INSUFFICIENT_LIQUIDITY')
    expect(gameplayFinancialBlockReason(blocked)).toBe(blocked.status + ':' + blocked.reasons.join('|'))
  })

  it('reports canonical liquidity truth and the funding gap for an unaffordable club', () => {
    const { world, teamId } = club()
    const result = decision(world, teamId, 'PLAYER_SIGNING')
    expect(result.allowed).toBe(false)
    expect(result.outcome).toBe('HAS_AUTHORIZATION_BUT_NO_LIQUIDITY')
    expect(result.liquidity?.availableCash?.minorUnits).toBe(0)
    expect(result.fundingGap?.minorUnits).toBeGreaterThan(0)
    expect(result.reasons).toContain('REQUIRES_FINANCING')
  })

  it('never invents money: a blocked decision creates no ledger fact, financing agreement or capital contribution', () => {
    const { world, teamId } = club()
    const before = {
      transactions: Object.keys(world.financialTransactionsById).length,
      agreements: Object.keys(world.financingAgreementsById).length,
      drawdowns: Object.keys(world.financingDrawdownsById).length,
      contributions: Object.keys(world.capitalContributionsById).length,
    }
    const result = decision(world, teamId, 'PLAYER_SIGNING')
    expect(result.allowed).toBe(false)
    expect(Object.keys(world.financialTransactionsById)).toHaveLength(before.transactions)
    expect(Object.keys(world.financingAgreementsById)).toHaveLength(before.agreements)
    expect(Object.keys(world.financingDrawdownsById)).toHaveLength(before.drawdowns)
    expect(Object.keys(world.capitalContributionsById)).toHaveLength(before.contributions)
    expect(cashMinorUnitsForTest(world, world.teams[teamId]!.organizationId)).toBe(0)
  })

  it('reads canonical reservations instead of subtracting capacity itself', () => {
    const { world, teamId } = fundedClub()
    const organizationId = world.teams[teamId]!.organizationId
    const reservation = createFinancialReservation({
      id: 'financial-reservation:test-capacity',
      organizationId,
      currency: EUR,
      amount: { currencyCode: EUR, minorUnits: 499_000_000 },
      sourceAuthority: 'TEST',
      sourceEntityId: 'test-capacity',
      createdOn: world.currentDate,
    })
    const withReservation = updateGameWorld(world, { financialReservations: [...Object.values(world.financialReservationsById), reservation] })
    const result = decision(withReservation, teamId, 'PLAYER_SIGNING')
    expect(result.allowed).toBe(false)
    expect(result.status).toBe('RESERVED_CAPACITY_CONFLICT')
    expect(result.outcome).toBe('RESERVED_CAPACITY_CONFLICT')
    expect(result.reservations.map((item) => item.id)).toEqual([reservation.id])
  })

  it('reports a currency mismatch as an invalid Finance state rather than comparing across currencies', () => {
    const { world, teamId } = fundedClub()
    const result = evaluateTeamGameplayFinancialDecision(world, {
      teamId,
      action: 'PLAYER_SIGNING',
      amount: { currencyCode: 'USD', minorUnits: 100_000 },
      sourceAuthority: 'TEST',
      sourceEntityId: 'test',
    })
    expect(result.status).toBe('CURRENCY_MISMATCH')
    expect(result.outcome).toBe('INVALID_FINANCE_STATE')
    expect(result.allowed).toBe(false)
  })

  it('reports an organization without canonical Finance as an explicit invalid state instead of falling back', () => {
    // A world that was never provisioned has no canonical currency for its fictional clubs, so gameplay
    // reports an explicit invalid state instead of falling back to the legacy spending authority.
    const world = generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, gender: 'male', includeNbaLike: true, includeNcaaLike: true })
    const teamId = Object.values(world.teams).find((team) => world.organizationFinancialProfilesById[team.organizationId] === undefined && resolveOrganizationCurrency(world, team.organizationId).status === 'FINANCE_CURRENCY_UNAVAILABLE')!.id
    expect(world.organizationFinancialProfilesById[world.teams[teamId]!.organizationId]).toBeUndefined()
    const result = evaluateTeamGameplayFinancialDecision(world, {
      teamId,
      action: 'PLAYER_SIGNING',
      legacyAnnualAmountMajorUnits: 500_000,
      sourceAuthority: 'TEST',
      sourceEntityId: 'test',
    })
    expect(result.status).toBe('FINANCE_PROFILE_UNAVAILABLE')
    expect(result.outcome).toBe('INVALID_FINANCE_STATE')
    expect(result.allowed).toBe(false)
    expect(result.currency).toBeNull()
  })

  it('separates HAS_LIQUIDITY_BUT_NO_AUTHORIZATION from INSUFFICIENT_AUTHORIZATION_AND_LIQUIDITY', () => {
    const { world, teamId } = fundedClub()
    // A replacement APPROVED authorization that is far too small for the salary, with liquidity untouched.
    const narrow = evaluateTeamGameplayFinancialDecision(
      authorizeTeamSalaryForTest(world, teamId, { currencyCode: EUR, playerSalaryMinorUnits: 100_000, staffSalaryMinorUnits: 100_000 }),
      { teamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: 50_000, sourceAuthority: 'TEST', sourceEntityId: 'test' },
    )
    expect(narrow.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(narrow.outcome).toBe('HAS_LIQUIDITY_BUT_NO_AUTHORIZATION')

    const alsoPoor = commitTeamLiquidityForTest(world, teamId, 500_000_000)
    const both = evaluateTeamGameplayFinancialDecision(
      authorizeTeamSalaryForTest(alsoPoor, teamId, { currencyCode: EUR, playerSalaryMinorUnits: 100_000, staffSalaryMinorUnits: 100_000 }),
      { teamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: 50_000, sourceAuthority: 'TEST', sourceEntityId: 'test' },
    )
    expect(both.outcome).toBe('INSUFFICIENT_AUTHORIZATION_AND_LIQUIDITY')
  })

  it('sees legitimate canonical financing cash immediately while authorization stays unchanged', () => {
    const { world, teamId } = fundedClub()
    // The club's whole liquidity is already committed canonically, so the same salary is unaffordable.
    const committed = commitTeamLiquidityForTest(world, teamId, 500_000_000)
    const before = decision(committed, teamId, 'PLAYER_SIGNING')
    expect(before.allowed).toBe(false)

    const drawn = financingDrawdownForTest(committed, teamId, 100_000_000)
    const after = decision(drawn, teamId, 'PLAYER_SIGNING')
    expect(after.allowed).toBe(true)
    expect(after.authorization).toEqual(before.authorization)
    expect(cashMinorUnitsForTest(drawn, drawn.teams[teamId]!.organizationId)).toBe(600_000_000)
  })

  it('requires exactly one amount form and a known Team', () => {
    const { world, teamId } = fundedClub()
    expect(() => evaluateTeamGameplayFinancialDecision(world, { teamId, action: 'PLAYER_SIGNING', sourceAuthority: 'TEST', sourceEntityId: 'test' })).toThrow(TypeError)
    expect(() => evaluateTeamGameplayFinancialDecision(world, { teamId, action: 'PLAYER_SIGNING', amount: { currencyCode: EUR, minorUnits: 1 }, legacyAnnualAmountMajorUnits: 1, sourceAuthority: 'TEST', sourceEntityId: 'test' })).toThrow(TypeError)
    expect(() => evaluateTeamGameplayFinancialDecision(world, { teamId: 'team:missing' as import('@/domain/ids').TeamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: 1, sourceAuthority: 'TEST', sourceEntityId: 'test' })).toThrow(RangeError)
  })
})
