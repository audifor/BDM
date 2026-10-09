import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { advanceGameDay } from '@/app/game/advanceGameDay'
import { createGameDate, type GameDate } from '@/domain/date'
import {
  createOwnerFundingTransaction,
  evaluateOrganizationFinancialCommitment,
  getCashBalancesByCurrency,
  getEligibleDuePayablesForDate,
  getOpenPayables,
  getOrganizationFinanceAccounts,
  legacyMajorUnitsToMoney,
  materializeOrganizationOpeningEconomicState,
  type OpeningEconomicStateSource,
} from '@/domain/finance'
import { getContractFinancialSchedule } from '@/domain/finance/ContractFinancialSchedule'
import { getPayableStatus } from '@/domain/finance/Treasury'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

import { processClubFinanceForDate } from './ClubFinanceLifecycle'

/**
 * BS16J Treasury & Settlement Truth end-to-end: the canonical due-payable batch runs inside the existing daily
 * Finance processor (and therefore on the initial career date too), settles only a complete fundable batch, and
 * never invents cash, financing, priority or a partial allocation. Funded scenarios use explicit canonical
 * economic facts (a legitimate opening economic state, or an explicit owner-funding ledger transaction); shipped
 * zero-cash careers are expected to report that they cannot pay.
 */
const SEASON_START = createGameDate(2026, 9, 26)
const DAY_BEFORE = createGameDate(2026, 9, 25)
const EUR = 'EUR'

function organizationIdsOf(world: GameWorld): readonly string[] {
  return [...new Set(Object.values(world.teams).map((team) => String(team.organizationId)))].sort()
}

function guaranteedDueOn(world: GameWorld, organizationId: string, date: string, currencyCode = EUR) {
  return getContractFinancialSchedule(world, { organizationId, currencyCode, includeConditional: true })
    .filter((entry) => entry.effectiveOn === date && entry.compensationStatus === 'GUARANTEED')
}

function totalDueOn(world: GameWorld, organizationId: string, date: string): number {
  return guaranteedDueOn(world, organizationId, date).reduce((sum, entry) => sum + entry.amount.minorUnits, 0)
}

/** The canonical due batch of one Organization on one date: payroll plus any operating family already declared. */
function dueBatchTotal(world: GameWorld, organizationId: string, date: GameDate): number {
  return getEligibleDuePayablesForDate(world, { organizationId, currencyCode: EUR, date }).reduce((sum, entry) => sum + entry.remainingMinorUnits, 0)
}

/** A processed world (the date's payables exist only after the processor has materialized them). */
function probeWorld(): GameWorld {
  return processClubFinanceForDate(createAcbTestGame(), SEASON_START).world
}

function cashOf(world: GameWorld, organizationId: string, asOfDate?: string): number {
  return getCashBalancesByCurrency(world, organizationId, asOfDate ?? world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

function openingCapital(organizationId: string, cashMinorUnits: number, effectiveOn: string): OpeningEconomicStateSource {
  return { sourceAuthority: 'OWNERSHIP', sourceEntityId: `owner:${organizationId}`, organizationId, currencyCode: EUR, effectiveOn, cashMinorUnits, counterpartKind: 'OWNER_CAPITAL', counterpartId: `person:owner:${organizationId}` }
}

function fundOrganization(world: GameWorld, organizationId: string, cashMinorUnits: number, effectiveOn = world.currentDate): GameWorld {
  const materialized = materializeOrganizationOpeningEconomicState(world, openingCapital(organizationId, cashMinorUnits, effectiveOn))
  expect(materialized.status).toBe('MATERIALIZED')
  return materialized.world
}

function organizationResult(application: { readonly result: { readonly organizations: readonly { readonly organizationId: string; readonly treasury: unknown }[] } }, organizationId: string) {
  return application.result.organizations.find((entry) => String(entry.organizationId) === organizationId)!
}

describe('BS16J treasury settlement lifecycle', { timeout: 120_000 }, () => {
  it('processes an unfunded shipped career start date truthfully: payroll payable, settlement insufficient, cash zero', () => {
    const career = createNewGame()
    const application = processClubFinanceForDate(career, career.currentDate)
    const organization = application.result.organizations.find((entry) => entry.treasury !== null && entry.payrollOccurrences > 0)!
    const organizationId = String(organization.organizationId)
    const treasury = organization.treasury!
    const due = guaranteedDueOn(career, organizationId, String(career.currentDate))
    expect(due.length).toBeGreaterThan(0)

    // Shipped worlds carry no canonical cash source, so the whole due batch is honestly unpayable.
    expect(application.result.treasury.status).toBe('INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES')
    expect(application.result.treasury.settledCount).toBe(0)
    expect(treasury.status).toBe('INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES')
    expect(treasury.settledCount).toBe(0)
    expect(treasury.eligiblePayableCount).toBe(due.length)
    expect(treasury.fundingGapMinorUnits).toBeGreaterThan(0)
    expect(Object.keys(application.world.treasuryApplicationsById)).toEqual([])
    expect(getOpenPayables(application.world, organizationId, career.currentDate).length).toBeGreaterThanOrEqual(due.length)
    expect(cashOf(application.world, organizationId, career.currentDate)).toBe(0)
  })

  it('settles the complete due batch through the daily processor when the whole batch is fundable', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    // The batch the club would owe on that date is read from the canonical report of an unfunded run, because the
    // date's payables (payroll and match operations) only exist once the processor has materialized them.
    const probe = organizationResult(processClubFinanceForDate(career, SEASON_START), organizationId) as { treasury: { totalDueMinorUnits: number; eligiblePayableCount: number } }
    const totalDue = probe.treasury.totalDueMinorUnits
    expect(totalDue).toBeGreaterThan(totalDueOn(career, organizationId, String(SEASON_START)))
    const funded = fundOrganization(career, organizationId, totalDue)

    const application = processClubFinanceForDate(funded, SEASON_START)
    const organization = organizationResult(application, organizationId) as { treasury: { status: string; settledCount: number; settledMinorUnits: number; totalDueMinorUnits: number } }

    expect(application.result.treasury.status).toBe('SETTLED')
    expect(organization.treasury.status).toBe('SETTLED')
    expect(organization.treasury.totalDueMinorUnits).toBe(totalDue)
    expect(organization.treasury.settledCount).toBe(probe.treasury.eligiblePayableCount)
    expect(organization.treasury.settledMinorUnits).toBe(totalDue)
    // The exact batch was paid from real cash, so the club is at zero and no obligation remains due.
    expect(cashOf(application.world, organizationId, SEASON_START)).toBe(0)
    expect(getOpenPayables(application.world, organizationId, SEASON_START)).toHaveLength(0)
    for (const settlement of Object.values(application.world.treasuryApplicationsById)) expect(settlement.obligationKind).toBe('PAYABLE')
    // Settlement is not a second expense: the recognitions are still exactly the day's occurrences.
    const orgRecognitions = Object.values(application.world.expenseRecognitionsById).filter((item) => String(item.organizationId) === organizationId)
    expect(orgRecognitions).toHaveLength(organization.treasury.settledCount)
  })

  it('replays a settled date as a no-op and never duplicates settlement facts', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const funded = fundOrganization(career, organizationId, dueBatchTotal(probeWorld(), organizationId, SEASON_START))
    const first = processClubFinanceForDate(funded, SEASON_START)
    const replay = processClubFinanceForDate(first.world, SEASON_START)

    expect(replay.world).toBe(first.world)
    expect(replay.result.treasury.settledCount).toBe(0)
    expect(replay.result.treasury.settledMinorUnits).toBe(0)
    expect(Object.keys(replay.world.treasuryApplicationsById)).toEqual(Object.keys(first.world.treasuryApplicationsById))
    expect(Object.keys(replay.world.financialTransactionsById)).toEqual(Object.keys(first.world.financialTransactionsById))
  })

  it('preserves a settled batch across save/load and keeps replay idempotent afterwards', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const funded = fundOrganization(career, organizationId, dueBatchTotal(probeWorld(), organizationId, SEASON_START))
    const settled = processClubFinanceForDate(funded, SEASON_START).world

    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(settled, '2026-09-27T00:00:00.000Z'))
    expect(Object.keys(reloaded.treasuryApplicationsById)).toEqual(Object.keys(settled.treasuryApplicationsById))
    expect(Object.keys(reloaded.financialTransactionsById)).toEqual(Object.keys(settled.financialTransactionsById))
    expect(cashOf(reloaded, organizationId, SEASON_START)).toBe(0)
    expect(getOpenPayables(reloaded, organizationId, SEASON_START)).toHaveLength(0)
    // Replaying the same date after a load neither re-settles nor re-materializes anything.
    expect(processClubFinanceForDate(reloaded, SEASON_START).world).toBe(reloaded)
  })

  it('preserves an outstanding batch across save/load and stays outstanding without new cash', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const before = updateGameWorld(career, { currentDate: DAY_BEFORE })
    const day = advanceDayWithTrace(before)
    expect(day.status).toBe('COMPLETED')
    const outstanding = day.world
    const payableIds = Object.keys(outstanding.payablesById)
    expect(payableIds.length).toBeGreaterThan(0)

    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(outstanding, '2026-09-27T00:00:00.000Z'))
    expect(Object.keys(reloaded.payablesById)).toEqual(payableIds)
    expect(Object.keys(reloaded.treasuryApplicationsById)).toEqual([])
    expect(cashOf(reloaded, organizationId, reloaded.currentDate)).toBe(0)
    expect(getOpenPayables(reloaded, organizationId, reloaded.currentDate).length).toBeGreaterThan(0)

    // The next day without funding keeps the obligation outstanding with no duplicate accounting.
    const nextDay = advanceDayWithTrace(reloaded)
    expect(nextDay.status).toBe('COMPLETED')
    expect(Object.keys(nextDay.world.financialCommitmentsById)).toEqual(Object.keys(reloaded.financialCommitmentsById))
    expect(Object.keys(nextDay.world.expenseRecognitionsById)).toEqual(Object.keys(reloaded.expenseRecognitionsById))
    expect(Object.keys(nextDay.world.payablesById)).toEqual(payableIds)
    expect(Object.keys(nextDay.world.treasuryApplicationsById)).toEqual([])
  })

  it('keeps an overdue payable eligible and settles it when legitimate liquidity later arrives', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    let world = updateGameWorld(career, { currentDate: DAY_BEFORE })
    world = advanceDayWithTrace(world).world
    expect(world.currentDate).toBe('2026-09-26')
    const payablesAfterDue = Object.keys(world.payablesById)
    const recognitionsAfterDue = Object.keys(world.expenseRecognitionsById)
    expect(getOpenPayables(world, organizationId, world.currentDate).length).toBeGreaterThan(0)

    // D+4: still unfunded, so nothing is paid and no fact is duplicated.
    while (world.currentDate !== '2026-09-30') world = advanceDayWithTrace(world).world
    expect(Object.keys(world.treasuryApplicationsById)).toEqual([])
    expect(Object.keys(world.payablesById)).toEqual(payablesAfterDue)

    // Real liquidity arrives as an explicit canonical fact (an owner-funding ledger transaction), dated D+5.
    const accounts = getOrganizationFinanceAccounts(world, organizationId, EUR)
    const funding = createOwnerFundingTransaction(world, {
      transactionId: `funding:late:${organizationId}`,
      organizationId,
      amount: { currencyCode: EUR, minorUnits: dueBatchTotal(world, organizationId, createGameDate(2026, 10, 1)) },
      effectiveOn: '2026-10-01',
      cashAccountId: accounts.cashOperating.id,
      offsetAccountId: accounts.equityControl.id,
      provenance: { kind: 'OWNER_FUNDING', id: `owner-funding:late:${organizationId}` },
    })
    let funded = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), funding] })
    while (funded.currentDate !== '2026-10-01') funded = advanceDayWithTrace(funded).world

    // The overdue payroll batch of this club is still eligible and now fully fundable, so it settles exactly once.
    // Collections are separate applications of the same canonical authority, so payables are counted on their own.
    const settledApplications = Object.keys(funded.treasuryApplicationsById)
    const settledPayables = Object.values(funded.treasuryApplicationsById).filter((application) => String(application.organizationId) === organizationId && application.obligationKind === 'PAYABLE')
    const ownPayables = Object.keys(funded.payablesById).filter((id) => String(funded.payablesById[id as never]!.organizationId) === organizationId)
    expect(settledPayables).toHaveLength(ownPayables.length)
    expect(getOpenPayables(funded, organizationId, funded.currentDate)).toHaveLength(0)
    expect(Object.keys(funded.payablesById)).toEqual(payablesAfterDue)
    expect(Object.keys(funded.expenseRecognitionsById)).toEqual(recognitionsAfterDue)
    // What remains in cash is exactly what the club collected from its own declared revenue sources.
    const collectedTotal = Object.values(funded.treasuryApplicationsById).filter((application) => String(application.organizationId) === organizationId && application.obligationKind === 'RECEIVABLE').reduce((sum, application) => sum + application.amount.minorUnits, 0)
    expect(cashOf(funded, organizationId, funded.currentDate)).toBe(collectedTotal)

    // And the settled state is stable on the next days.
    const stable = advanceDayWithTrace(funded).world
    expect(Object.keys(stable.treasuryApplicationsById)).toEqual(settledApplications)
  })

  it('keeps the shipped prototype and its first Advance Day duplicate-free after settlement runs', () => {
    const career = createNewGame()
    const organizationId = organizationIdsOf(career)[0]!
    const payableIds = Object.keys(career.payablesById)
    const commitmentIds = Object.keys(career.financialCommitmentsById)
    expect(payableIds.length).toBeGreaterThan(0)
    expect(Object.keys(career.treasuryApplicationsById)).toEqual([])
    expect(cashOf(career, organizationId, career.currentDate)).toBe(0)

    const advanced = advanceGameDay(career, () => 1)
    expect(advanced.currentDate).toBe(createGameDate(2032, 10, 2))
    expect(Object.keys(advanced.financialCommitmentsById)).toEqual(commitmentIds)
    expect(Object.keys(advanced.payablesById)).toEqual(payableIds)
    expect(Object.keys(advanced.treasuryApplicationsById)).toEqual([])
    expect(cashOf(advanced, organizationId, advanced.currentDate)).toBe(0)
  })

  it('is a cheap no-op on a day with no payables at all', () => {
    const career = createAcbTestGame()
    const quiet = processClubFinanceForDate(career, DAY_BEFORE)

    expect(quiet.world).toBe(career)
    expect(quiet.result.treasury.status).toBe('NO_DUE_PAYABLES')
    expect(quiet.result.treasury.availableCashMinorUnits).toBe(0)
    expect(quiet.result.treasury.settledCount).toBe(0)
    expect(Object.keys(quiet.world.treasuryApplicationsById)).toEqual([])
  })

  it('shows the settled payment through FinancialAuthority liquidity while reservations stay separate', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const totalDue = dueBatchTotal(probeWorld(), organizationId, SEASON_START)
    const funded = fundOrganization(career, organizationId, totalDue)
    const amount = legacyMajorUnitsToMoney(1_000_000, EUR)

    const before = evaluateOrganizationFinancialCommitment(funded, { organizationId, currency: EUR, amount, category: 'PLAYER_SALARY', asOfDate: SEASON_START })
    expect(before.liquidity.availableCash?.minorUnits).toBe(totalDue)

    const settled = processClubFinanceForDate(funded, SEASON_START).world
    const after = evaluateOrganizationFinancialCommitment(settled, { organizationId, currency: EUR, amount, category: 'PLAYER_SALARY', asOfDate: SEASON_START })

    // Liquidity is read from the ledger, so the payment is visible without any manual subtraction.
    expect(after.liquidity.availableCash?.minorUnits).toBe(0)
    expect(after.liquidity.fundingGap).toEqual(amount)
    expect(Object.keys(settled.treasuryApplicationsById).length).toBeGreaterThan(0)
    // Settlement never creates or consumes a reservation.
    expect(Object.values(settled.financialReservationsById)).toHaveLength(0)
  })

  it('leaves a payable outstanding forever when nothing ever funds it, without duplicating facts', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    let world = updateGameWorld(career, { currentDate: DAY_BEFORE })
    for (let day = 0; day < 10; day += 1) {
      const advanced = advanceDayWithTrace(world)
      expect(advanced.status).toBe('COMPLETED')
      world = advanced.world
      const treasury = advanced.phases.find((phase) => phase.phaseId === 'CLUB_FINANCE_V2')!
      expect(treasury.ran).toBe(true)
    }

    // Nothing ever funded the obligations, and the only cash movements are the club's own declared collections:
    // no payable was paid, every obligation stays open, and no fact was duplicated by running the phase ten times.
    expect(Object.values(world.treasuryApplicationsById).some((application) => application.obligationKind === 'PAYABLE')).toBe(false)
    expect(getOpenPayables(world, organizationId, world.currentDate).length).toBeGreaterThan(0)
    expect(getPayableStatus(world, Object.keys(world.payablesById)[0] as never, world.currentDate)).toBe('OPEN')
    const collectedTotal = Object.values(world.treasuryApplicationsById).filter((application) => String(application.organizationId) === organizationId && application.obligationKind === 'RECEIVABLE').reduce((sum, application) => sum + application.amount.minorUnits, 0)
    expect(cashOf(world, organizationId, world.currentDate)).toBe(collectedTotal)
  })
})
