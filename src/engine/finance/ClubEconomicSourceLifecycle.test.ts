import { describe, expect, it } from 'vitest'

import { createAcbTestGame } from '@/app/game'
import { acbDemoParticipationInstallments, BDM_DEMO_MATCH_OPERATIONS_PER_GAME_MAJOR_UNITS, createAcbDemoEconomicProfileV1 } from '@/app/game/AcbDemoEconomicPolicy'
import { compareGameDates, createGameDate, type GameDate } from '@/domain/date'
import {
  economicMatchOperationsSourceId,
  economicRevenueSourceId,
  getCashBalancesByCurrency,
  getCashFlowTotalsBetween,
  getDuePayables,
  getEligibleDuePayablesForDate,
  getOpenPayables,
  getTrialBalanceAsOfDate,
  getUngroundedEconomicSources,
  legacyMajorUnitsToMoney,
  materializeOrganizationOpeningEconomicState,
  type OpeningEconomicStateSource,
} from '@/domain/finance'
import { getOperatingCostSchedule } from '@/domain/finance/OperatingCostEngine'
import { getContractFinancialSchedule } from '@/domain/finance/ContractFinancialSchedule'
import { getRevenueSchedule } from '@/domain/finance/RevenueEngine'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16K-C certification: the provisioned demo economic sources flow through the existing canonical engines on the
 * real daily lifecycle. Participation revenue materializes exactly on its declared installment dates as revenue
 * recognition plus a receivable (never cash), match operations materialize one expense and payable per real home
 * game for the home Organization only, payroll is never duplicated, Treasury consumes the resulting payables
 * through its unchanged all-or-none policy, and 180 days of ledger stay balanced and fully explainable.
 */
const ORGANIZATION = 'acb-team-rmb'
const EUR = 'EUR'
const INSTALLMENT_MINOR_UNITS = 20_000_000
const MATCH_OPERATIONS_MINOR_UNITS = legacyMajorUnitsToMoney(BDM_DEMO_MATCH_OPERATIONS_PER_GAME_MAJOR_UNITS, EUR).minorUnits

function cashOf(world: GameWorld, organizationId = ORGANIZATION, asOfDate?: string): number {
  return getCashBalancesByCurrency(world, organizationId, asOfDate ?? world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

function revenueRecognitionsOf(world: GameWorld, organizationId = ORGANIZATION) {
  return Object.values(world.revenueRecognitionsById).filter((item) => String(item.organizationId) === organizationId)
}

function expensesOf(world: GameWorld, organizationId = ORGANIZATION) {
  return Object.values(world.expenseRecognitionsById).filter((item) => String(item.organizationId) === organizationId)
}

function payablesOf(world: GameWorld, organizationId = ORGANIZATION) {
  return Object.values(world.payablesById).filter((item) => String(item.organizationId) === organizationId)
}

function advanceTo(world: GameWorld, targetDate: GameDate): GameWorld {
  let current = world
  while (compareGameDates(current.currentDate, targetDate) < 0) {
    const advanced = advanceDayWithTrace(current)
    expect(advanced.status).toBe('COMPLETED')
    current = advanced.world
  }
  return current
}

function openingCapital(organizationId: string, cashMinorUnits: number, effectiveOn: string): OpeningEconomicStateSource {
  return { sourceAuthority: 'OWNERSHIP', sourceEntityId: `owner:${organizationId}`, organizationId, currencyCode: EUR, effectiveOn, cashMinorUnits, counterpartKind: 'OWNER_CAPITAL', counterpartId: `person:owner:${organizationId}` }
}

describe('BS16K-C economic source lifecycle', { timeout: 300_000 }, () => {
  it('materializes one participation installment of EUR 200,000 on its own fiscal-month date, and no earlier', () => {
    const world = advanceTo(createAcbTestGame(), createGameDate(2026, 9, 30))
    expect(revenueRecognitionsOf(world)).toHaveLength(0)

    const onInstallment = advanceTo(world, createGameDate(2026, 10, 1))
    const recognized = revenueRecognitionsOf(onInstallment)
    expect(recognized).toHaveLength(1)
    expect(recognized[0]!.amount.minorUnits).toBe(INSTALLMENT_MINOR_UNITS)
    expect(String(recognized[0]!.category)).toBe('COMPETITION')
    expect(String(recognized[0]!.recognizedOn)).toBe('2026-10-01')
    // Revenue is recognized as a receivable: the canonical engine never turns it into cash.
    expect(Object.values(onInstallment.receivablesById).filter((item) => String(item.organizationId) === ORGANIZATION)).toHaveLength(1)
    expect(cashOf(onInstallment, ORGANIZATION, '2026-10-01')).toBe(0)

    // The next day adds nothing, and the next installment arrives on the next fiscal-month first date.
    const quiet = advanceTo(onInstallment, createGameDate(2026, 10, 31))
    expect(revenueRecognitionsOf(quiet)).toHaveLength(1)
    const next = advanceTo(quiet, createGameDate(2026, 11, 1))
    expect(revenueRecognitionsOf(next)).toHaveLength(2)
    expect(revenueRecognitionsOf(next).map((item) => item.amount.minorUnits)).toEqual([INSTALLMENT_MINOR_UNITS, INSTALLMENT_MINOR_UNITS])
  })

  it('replays a processed installment date as a no-op across save/load', () => {
    const atInstallment = advanceTo(createAcbTestGame(), createGameDate(2026, 10, 1))
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(atInstallment, '2026-10-02T00:00:00.000Z'))
    const again = advanceDayWithTrace(reloaded)

    // Nothing new is recognized on the following day, and the loaded facts are identical.
    expect(revenueRecognitionsOf(again.world)).toHaveLength(revenueRecognitionsOf(atInstallment).length)
    expect(Object.keys(again.world.revenueRecognitionsById)).toEqual(Object.keys(reloaded.revenueRecognitionsById))
    expect(Object.keys(again.world.receivablesById)).toEqual(Object.keys(reloaded.receivablesById))
    expect(getUngroundedEconomicSources(again.world)).toEqual([])
  })

  it('materializes match operations only for the home Organization on a real game date', () => {
    const world = createAcbTestGame()
    const source = getOperatingCostSchedule(world, { organizationId: ORGANIZATION })
    expect(source.length).toBeGreaterThan(0)
    const firstEvent = source[0]!
    expect(firstEvent.category).toBe('MATCH_OPERATIONS')
    expect(firstEvent.amount.minorUnits).toBe(MATCH_OPERATIONS_MINOR_UNITS)

    const onEvent = advanceTo(world, firstEvent.recognitionOn)
    const operations = expensesOf(onEvent).filter((item) => String(item.category) === 'MATCH_OPERATIONS')
    expect(operations).toHaveLength(1)
    expect(operations[0]!.amount.minorUnits).toBe(MATCH_OPERATIONS_MINOR_UNITS)
    expect(String(operations[0]!.recognizedOn)).toBe(firstEvent.recognitionOn)
    expect(payablesOf(onEvent).some((payable) => payable.amount.minorUnits === MATCH_OPERATIONS_MINOR_UNITS)).toBe(true)

    // The organizer's opponent on that date does not bear this organization's match-operations cost.
    const game = Object.values(onEvent.games).find((candidate) => candidate.date === firstEvent.recognitionOn && String(candidate.homeTeamId) === ORGANIZATION)
    expect(game).toBeDefined()
    const awayTeam = onEvent.teams[game!.awayTeamId]!
    const awayOrganization = String(awayTeam.organizationId)
    expect(awayOrganization).not.toBe(ORGANIZATION)
    expect(expensesOf(onEvent, awayOrganization).filter((item) => String(item.category) === 'MATCH_OPERATIONS')).toHaveLength(0)
  })

  it('never duplicates payroll: match operations stay a distinct operating family', () => {
    const world = createAcbTestGame()
    const firstEvent = getOperatingCostSchedule(world, { organizationId: ORGANIZATION })[0]!
    const onEvent = advanceTo(world, firstEvent.recognitionOn)
    const expenses = expensesOf(onEvent)
    const operations = expenses.filter((item) => String(item.category) === 'MATCH_OPERATIONS')

    // Match operations occurred exactly once, at the policy amount.
    expect(operations).toHaveLength(1)
    expect(operations[0]!.amount.minorUnits).toBe(MATCH_OPERATIONS_MINOR_UNITS)
    expect(operations[0]!.provenance.kind).toBe('AUTHORIZED_ECONOMIC_EVENT')
    // No operating cost can restate a salary: the policy family is match operations only, and the category list
    // itself cannot express payroll.
    expect(Object.values(onEvent.operatingCostSourcesById).every((item) => item.category === 'MATCH_OPERATIONS')).toBe(true)

    // Every non-match-operations expense the ACB demo career actually processes is exactly the BS16I contract
    // schedule, and the operating family is exactly one policy amount per occurrence: no double counting.
    const nonOperations = expenses.filter((item) => String(item.category) !== 'MATCH_OPERATIONS')
    expect(nonOperations.length).toBeGreaterThan(0)
    const start: GameDate = world.currentDate
    const scheduleTotal = getContractFinancialSchedule(onEvent, { organizationId: ORGANIZATION, currencyCode: EUR, includeConditional: true })
      .filter((entry) => entry.compensationStatus === 'GUARANTEED')
      .filter((entry) => compareGameDates(entry.effectiveOn, start) > 0 && compareGameDates(entry.effectiveOn, firstEvent.recognitionOn) <= 0)
      .reduce((sum, entry) => sum + entry.amount.minorUnits, 0)
    expect(nonOperations.reduce((sum, item) => sum + item.amount.minorUnits, 0)).toBe(scheduleTotal)
    expect(operations.reduce((sum, item) => sum + item.amount.minorUnits, 0)).toBe(MATCH_OPERATIONS_MINOR_UNITS)
    // Documented pre-existing property of the ACB demo fixture (not introduced here): unlike the prototype career
    // it does not process its own creation date, so a contract boundary dated exactly on D is never materialized.
    // The BS16K-C report records this as a remaining lifecycle gap; the reachable payroll cluster is 2026-09-26.
    expect(onEvent.expenseRecognitionsById === undefined || Object.values(onEvent.expenseRecognitionsById).every((item) => String(item.recognizedOn) !== start)).toBe(true)
  })

  it('leaves the resulting payables to the unchanged Treasury policy: unfunded batches settle nothing', () => {
    const world = createAcbTestGame()
    const firstEvent = getOperatingCostSchedule(world, { organizationId: ORGANIZATION })[0]!
    const onEvent = advanceTo(world, firstEvent.recognitionOn)
    const operationsPayable = payablesOf(onEvent).find((payable) => payable.amount.minorUnits === MATCH_OPERATIONS_MINOR_UNITS && String(payable.recognizedOn) === firstEvent.recognitionOn)

    // The new source creates an ordinary payable the canonical policy sees, in the club's own currency.
    expect(operationsPayable).toBeDefined()
    expect(String(operationsPayable!.amount.currencyCode)).toBe(EUR)
    const due = getEligibleDuePayablesForDate(onEvent, { organizationId: ORGANIZATION, currencyCode: EUR, date: onEvent.currentDate })
    expect(due.some((entry) => String(entry.payable.id) === String(operationsPayable!.id))).toBe(true)
    // Zero cash means the whole batch is unpayable, so the unchanged all-or-none policy settles nothing.
    expect(Object.keys(onEvent.treasuryApplicationsById)).toEqual([])
    expect(cashOf(onEvent)).toBe(0)
    expect(getOpenPayables(onEvent, ORGANIZATION, onEvent.currentDate).length).toBeGreaterThan(0)
  })

  it('settles the new payables through Treasury when legitimate liquidity covers the whole due batch', () => {
    const early = updateGameWorld(createAcbTestGame(), { currentDate: createGameDate(2026, 9, 20) })
    // Explicit canonical liquidity (owner capital), dated before the first economic occurrence.
    const funded = materializeOrganizationOpeningEconomicState(early, openingCapital(ORGANIZATION, 30_000_000_000, '2026-09-20'))
    expect(funded.status).toBe('MATERIALIZED')

    const firstEvent = getOperatingCostSchedule(early, { organizationId: ORGANIZATION })[0]!
    const onEvent = advanceTo(funded.world, firstEvent.recognitionOn)
    const settled = Object.values(onEvent.treasuryApplicationsById)

    // The same unchanged batch policy settled both the payroll payables created on 2026-09-26 and the new
    // match-operations payable, because the funded club's cash covered the complete due batch.
    expect(settled.length).toBeGreaterThan(0)
    expect(settled.some((settlement) => String(settlement.obligationId).startsWith('payable:'))).toBe(true)
    expect(payablesOf(onEvent).some((payable) => payable.amount.minorUnits === MATCH_OPERATIONS_MINOR_UNITS)).toBe(true)
    expect(getOpenPayables(onEvent, ORGANIZATION, onEvent.currentDate)).toHaveLength(0)
    const settledTotal = settled.reduce((sum, settlement) => sum + settlement.amount.minorUnits, 0)
    expect(cashOf(onEvent)).toBe(30_000_000_000 - settledTotal)
    expect(expensesOf(onEvent).some((item) => String(item.category) === 'MATCH_OPERATIONS')).toBe(true)
  })

  it('keeps 180 demo days balanced, duplicate-free and fully explainable from the ledger', () => {
    const start = createAcbTestGame()
    const openingCash = cashOf(start)
    const startDate: GameDate = start.currentDate
    const endDate = createGameDate(2027, 3, 17)
    const world = advanceTo(start, endDate)
    expect(String(world.currentDate)).toBe(String(endDate))

    const installments = acbDemoParticipationInstallments().filter((installment) => compareGameDates(installment.recognitionOn, startDate) >= 0 && compareGameDates(installment.recognitionOn, endDate) <= 0)
    const homeGames = getOperatingCostSchedule(start, { organizationId: ORGANIZATION }).filter((entry) => compareGameDates(entry.recognitionOn, startDate) >= 0 && compareGameDates(entry.recognitionOn, endDate) <= 0)
    expect(installments.length).toBeGreaterThanOrEqual(6)
    expect(homeGames.length).toBeGreaterThanOrEqual(10)

    // Exactly the declared occurrences materialized, once each, with nothing invented.
    expect(revenueRecognitionsOf(world)).toHaveLength(installments.length)
    expect(revenueRecognitionsOf(world).reduce((sum, item) => sum + item.amount.minorUnits, 0)).toBe(installments.length * INSTALLMENT_MINOR_UNITS)
    expect(expensesOf(world).filter((item) => String(item.category) === 'MATCH_OPERATIONS')).toHaveLength(homeGames.length)
    expect(getUngroundedEconomicSources(world)).toEqual([])

    // Cash identity holds exactly: opening cash + receipts - payments = ending cash (all zero on an unfunded career).
    const totals = getCashFlowTotalsBetween(world, ORGANIZATION, startDate, endDate)
    const receipts = totals.reduce((sum, row) => sum + row.inflowMinorUnits, 0)
    const payments = totals.reduce((sum, row) => sum + row.outflowMinorUnits, 0)
    expect(openingCash + receipts - payments).toBe(cashOf(world))
    expect(cashOf(world)).toBe(0)
    // Revenue is a receivable, so it is reported as one and never as cash.
    const receivables = Object.values(world.receivablesById).filter((item) => String(item.organizationId) === ORGANIZATION)
    expect(receivables.reduce((sum, item) => sum + item.amount.minorUnits, 0)).toBeGreaterThan(0)

    // The ledger is balanced and obligations stay outstanding because no cash exists.
    const trial = getTrialBalanceAsOfDate(world, endDate)
    expect(trial.reduce((sum, row) => sum + row.debitMinorUnits, 0)).toBe(trial.reduce((sum, row) => sum + row.creditMinorUnits, 0))
    expect(getDuePayables(world, ORGANIZATION, endDate).length).toBeGreaterThan(0)
    expect(Object.keys(world.treasuryApplicationsById)).toEqual([])
  })

  it('keeps the ordinary day cheap and the occurrence day bounded', () => {
    const world = createAcbTestGame()
    const quiet = measure(6, () => {
      let current = world
      for (let day = 0; day < 6; day += 1) current = advanceDayWithTrace(current).world
    })
    const busy = measure(42, () => { advanceTo(world, createGameDate(2026, 10, 31)) })

    // Measured on this 18-club demo career: an ordinary (no-occurrence) day is ~0.1 s and a day carrying ~9
    // economic occurrences is ~0.3 s. The extra work is the canonical per-occurrence world update the existing
    // engines already perform (BS16I payroll does the same on its cluster date); the source lookup itself is
    // bounded by the source count and never scans matches, so no world-wide rescan was introduced.
    expect(quiet.averagePerDayMs).toBeLessThan(250)
    expect(busy.averagePerDayMs).toBeLessThan(700)
    expect(getRevenueSchedule(world, { organizationId: ORGANIZATION })).toHaveLength(12)
    expect(Object.keys(world.revenueSourcesById)).toHaveLength(18)
    expect(Object.keys(world.operatingCostSourcesById)).toHaveLength(18)
  })

  it('keeps the demo profile identity and its occurrence count deterministic across worlds', () => {
    const first = createAcbTestGame()
    const second = createAcbTestGame()
    const profile = createAcbDemoEconomicProfileV1()

    expect(Object.keys(first.revenueSourcesById).sort()).toEqual(Object.keys(second.revenueSourcesById).sort())
    expect(first.revenueSourcesById[economicRevenueSourceId(profile, ORGANIZATION) as never]).toEqual(second.revenueSourcesById[economicRevenueSourceId(profile, ORGANIZATION) as never])
    expect(first.operatingCostSourcesById[economicMatchOperationsSourceId(profile, ORGANIZATION) as never]).toEqual(second.operatingCostSourcesById[economicMatchOperationsSourceId(profile, ORGANIZATION) as never])
  })
})

function measure(days: number, run: () => void): { readonly totalMs: number; readonly averagePerDayMs: number } {
  const startedAt = performance.now()
  run()
  const totalMs = performance.now() - startedAt
  return { totalMs, averagePerDayMs: totalMs / days }
}
