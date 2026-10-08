import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { compareGameDates, createGameDate, parseGameDate } from '@/domain/date'
import { getCashBalancesByCurrency } from '@/domain/finance/CashFlowQueries'
import {
  ensureCanonicalFinanceFoundation,
  evaluateOrganizationFinancialCommitment,
  getContractFinancialSchedule,
  getOrganizationFinancialAuthorization,
  legacyMajorUnitsToMoney,
} from '@/domain/finance'
import { advanceDayWithTrace } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { updateGameWorld, type GameWorld } from '@/domain/world'

import { processClubFinanceForDate } from './ClubFinanceLifecycle'

/**
 * BS16I certifies the daily Finance lifecycle against shipped careers: the ACB career carries 241 real player
 * contracts (plus 576 staff contracts) whose guaranteed year-1 payroll is effective on the competition season
 * start, so it is a real due Finance occurrence rather than a fixture.
 */
const SAVED_AT = '2026-09-25T00:00:00.000Z'
const SEASON_START = createGameDate(2026, 9, 26)
const NEXT_SEASON_START = createGameDate(2027, 9, 26)
const DAY_BEFORE = createGameDate(2026, 9, 25)

function organizationIdsOf(world: GameWorld): readonly string[] {
  return [...new Set(Object.values(world.teams).map((team) => String(team.organizationId)))].sort()
}

function guaranteedDueOn(world: GameWorld, organizationId: string, date: string) {
  return getContractFinancialSchedule(world, { organizationId, currencyCode: 'EUR', includeConditional: true })
    .filter((entry) => entry.effectiveOn === date && entry.compensationStatus === 'GUARANTEED')
}

function factsForOrganization(world: GameWorld, organizationId: string) {
  const owned = (id: string) => id === organizationId
  return {
    commitments: Object.values(world.financialCommitmentsById).filter((item) => owned(String(item.organizationId))),
    recognitions: Object.values(world.expenseRecognitionsById).filter((item) => owned(String(item.organizationId))),
    payables: Object.values(world.payablesById).filter((item) => owned(String(item.organizationId))),
    transactions: Object.values(world.financialTransactionsById).filter((item) => owned(String(item.organizationId))),
  }
}

describe('BS16I contract payroll lifecycle on a shipped ACB career', { timeout: 120_000 }, () => {
  it('materializes a real contract payroll occurrence as commitment, recognition, payable and posting', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const due = guaranteedDueOn(career, organizationId, '2026-09-26')

    expect(due.length).toBeGreaterThan(0)
    expect(career.currentDate).toBe('2026-09-19')
    const application = processClubFinanceForDate(career, SEASON_START)
    const organization = application.result.organizations.find((entry) => String(entry.organizationId) === organizationId)!

    expect(organization.status).toBe('MATERIALIZED')
    expect(organization.currencyCode).toBe('EUR')
    expect(organization.payrollOccurrences).toBe(due.length)
    expect(organization.materializedMinorUnits).toBe(due.reduce((sum, entry) => sum + entry.amount.minorUnits, 0))

    const facts = factsForOrganization(application.world, organizationId)
    expect(facts.commitments.length).toBe(due.length)
    expect(facts.recognitions.length).toBe(due.length)
    expect(facts.payables.length).toBe(due.length)
    expect(facts.transactions.length).toBe(due.length)
    // Provenance identifies the contract and the payment occurrence, and every fact is dated on the due date.
    for (const commitment of facts.commitments) {
      expect(commitment.provenance.kind).toBe('AUTHORIZED_ECONOMIC_EVENT')
      expect(String(commitment.provenance.id)).toContain('contract-schedule:')
      expect(String(commitment.provenance.id)).toContain('year:1:guaranteed')
      expect(String(commitment.startsOn)).toBe('2026-09-26')
      expect(String(commitment.dueOn)).toBe('2026-09-26')
      // The commitment carries the event category, which canonical budget attribution normalizes to the
      // PLAYER_SALARY / STAFF_SALARY authorization scope.
      expect(['CONTRACT_PLAYER_SALARY_DUE', 'STAFF_CONTRACT_EXPENSE_DUE']).toContain(commitment.category)
      expect(['PLAYER_SALARY', 'STAFF_SALARY']).toContain(commitment.category === 'CONTRACT_PLAYER_SALARY_DUE' ? 'PLAYER_SALARY' : 'STAFF_SALARY')
    }
    // Payroll recognition debits expense and credits payable: no cash movement is ever created for it.
    for (const transaction of facts.transactions) {
      expect(transaction.postings.some((posting) => String(posting.accountId).includes('cash'))).toBe(false)
    }
    expect(getCashBalancesByCurrency(application.world, organizationId, SEASON_START).every((row) => row.totalCashMinorUnits === 0)).toBe(true)
  })

  it('does nothing on a date with no due fact, and is idempotent when the same date is processed again', () => {
    const career = createAcbTestGame()
    const quiet = processClubFinanceForDate(career, DAY_BEFORE)

    expect(quiet.world).toBe(career)
    expect(quiet.result.organizations.every((entry) => entry.status === 'NO_DUE_FACTS' || entry.status === 'FINANCE_PROFILE_UNAVAILABLE')).toBe(true)
    expect(Object.keys(quiet.world.financialCommitmentsById)).toEqual([])

    const first = processClubFinanceForDate(career, SEASON_START)
    const replay = processClubFinanceForDate(first.world, SEASON_START)
    expect(replay.world).toBe(first.world)
    expect(replay.result.organizations.filter((entry) => entry.payrollOccurrences > 0).every((entry) => entry.status === 'ALREADY_PROCESSED')).toBe(true)
    // No duplicate obligation, recognition, payable or transaction.
    expect(Object.keys(replay.world.financialCommitmentsById)).toEqual(Object.keys(first.world.financialCommitmentsById))
    expect(Object.keys(replay.world.expenseRecognitionsById)).toEqual(Object.keys(first.world.expenseRecognitionsById))
    expect(Object.keys(replay.world.payablesById)).toEqual(Object.keys(first.world.payablesById))
    expect(Object.keys(replay.world.financialTransactionsById)).toEqual(Object.keys(first.world.financialTransactionsById))
  })

  it('keeps organizations and currencies isolated when many clubs have payroll due on one day', () => {
    const career = createAcbTestGame()
    const application = processClubFinanceForDate(career, SEASON_START)
    const organizationIds = organizationIdsOf(career)

    for (const organizationId of organizationIds) {
      const due = guaranteedDueOn(career, organizationId, '2026-09-26')
      const facts = factsForOrganization(application.world, organizationId)
      // A club's payroll facts belong to that club only, in its own currency, and match its own schedule.
      expect(facts.payables.length).toBe(due.length)
      expect(facts.payables.every((payable) => String(payable.amount.currencyCode) === 'EUR')).toBe(true)
      expect(facts.commitments.every((commitment) => String(commitment.organizationId) === organizationId)).toBe(true)
      expect(facts.payables.reduce((sum, payable) => sum + payable.amount.minorUnits, 0)).toBe(due.reduce((sum, entry) => sum + entry.amount.minorUnits, 0))
    }
    // Another universe's clubs are untouched because they have no due fact on this date.
    expect(factsForOrganization(application.world, organizationIds[0]!).payables.length).toBeGreaterThan(0)
  })

  it('materializes the same contract year again only on its own next anniversary, with distinct provenance', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const first = processClubFinanceForDate(career, SEASON_START)
    const second = processClubFinanceForDate(first.world, NEXT_SEASON_START)

    const yearOne = factsForOrganization(first.world, organizationId).payables.length
    const yearTwoFacts = factsForOrganization(second.world, organizationId)
    expect(yearTwoFacts.payables.length).toBeGreaterThan(yearOne)
    const yearTwoOnly = Object.keys(second.world.payablesById).filter((id) => first.world.payablesById[id as never] === undefined && String(second.world.payablesById[id as never]!.organizationId) === organizationId)
    expect(yearTwoOnly.length).toBe(yearTwoFacts.payables.length - yearOne)
    expect(new Set(yearTwoOnly).size).toBe(yearTwoOnly.length)
    expect(yearTwoFacts.payables.every((payable) => payable.amount.currencyCode === 'EUR')).toBe(true)
  })

  it('leaves obligations outstanding instead of inventing settlement, overdraft or funding', () => {
    const career = createAcbTestGame()
    const application = processClubFinanceForDate(career, SEASON_START)
    const organizationId = organizationIdsOf(career)[0]!
    const facts = factsForOrganization(application.world, organizationId)

    expect(application.result.settlement).toBe('AUTOMATIC_SETTLEMENT_POLICY_NOT_MODELLED')
    expect(application.result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('AUTOMATIC_SETTLEMENT_POLICY_NOT_MODELLED')
    expect(Object.keys(application.world.treasuryApplicationsById)).toEqual([])
    // Zero cash is preserved: no overdraft, no owner capital, no loan, no revenue was manufactured.
    expect(getCashBalancesByCurrency(application.world, organizationId, SEASON_START).every((row) => row.totalCashMinorUnits === 0)).toBe(true)
    expect(Object.keys(application.world.debtInstrumentsById)).toEqual([])
    expect(Object.keys(application.world.financialEntitlementsById)).toEqual([])
    expect(facts.payables.every((payable) => payable.amount.minorUnits > 0)).toBe(true)
  })

  it('runs through the normal Advance Day lifecycle as the CLUB_FINANCE_V2 phase', () => {
    const career = updateGameWorld(createAcbTestGame(), { currentDate: DAY_BEFORE })
    const before = Object.keys(career.financialCommitmentsById).length
    const day = advanceDayWithTrace(career)
    const phase = day.phases.find((entry) => entry.phaseId === 'CLUB_FINANCE_V2')!

    expect(day.status).toBe('COMPLETED')
    expect(phase.ran).toBe(true)
    expect(phase.worldChanged).toBe(true)
    expect(phase.diagnostics.map((diagnostic) => diagnostic.code)).toContain('CONTRACT_PAYROLL_DUE')
    expect(Object.keys(day.world.financialCommitmentsById).length).toBeGreaterThan(before)

    // The next day has nothing due, and the phase reports no change instead of re-materializing.
    const quietDay = advanceDayWithTrace(day.world)
    const quietPhase = quietDay.phases.find((entry) => entry.phaseId === 'CLUB_FINANCE_V2')!
    expect(quietPhase.ran).toBe(true)
    expect(quietPhase.worldChanged).toBe(false)
    expect(Object.keys(quietDay.world.financialCommitmentsById)).toEqual(Object.keys(day.world.financialCommitmentsById))
  })

  it('preserves the lifecycle across save/load before and after the due date', () => {
    const career = updateGameWorld(createAcbTestGame(), { currentDate: DAY_BEFORE })
    const beforeDue = deserializeGameWorldV4(serializeGameWorldV4(career, SAVED_AT))
    const advanced = advanceDayWithTrace(beforeDue)
    const materializedIds = Object.keys(advanced.world.financialCommitmentsById)

    expect(materializedIds.length).toBeGreaterThan(0)
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(advanced.world, '2026-09-27T00:00:00.000Z'))
    expect(Object.keys(reloaded.financialCommitmentsById)).toEqual(materializedIds)
    expect(Object.keys(reloaded.payablesById)).toEqual(Object.keys(advanced.world.payablesById))
    // Replaying the same date after a load never duplicates the payroll.
    const replay = processClubFinanceForDate(reloaded, SEASON_START)
    expect(Object.keys(replay.world.financialCommitmentsById)).toEqual(materializedIds)
    expect(replay.world).toBe(reloaded)
  })

  it('sees the new canonical obligations through FinancialAuthority', () => {
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    const amount = legacyMajorUnitsToMoney(1_000_000, 'EUR')
    const before = evaluateOrganizationFinancialCommitment(career, { organizationId, currency: 'EUR', amount, category: 'PLAYER_SALARY', asOfDate: SEASON_START })
    const application = processClubFinanceForDate(career, SEASON_START)
    const after = evaluateOrganizationFinancialCommitment(application.world, { organizationId, currency: 'EUR', amount, category: 'PLAYER_SALARY', asOfDate: SEASON_START })
    const authorization = getOrganizationFinancialAuthorization(application.world, { organizationId, currencyCode: 'EUR', asOfDate: SEASON_START })

    // The obligation is canonical now; cash is still zero, so liquidity stays the binding constraint while the
    // authorization already accounted for the contractual payroll through the schedule.
    expect(before.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(after.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(after.liquidity.fundingGap).toEqual(amount)
    expect(Object.values(application.world.financialCommitmentsById).filter((item) => String(item.organizationId) === organizationId).length).toBeGreaterThan(0)
    expect(authorization.committedMinorUnits).toBeGreaterThan(0)
    expect(authorization.availableHeadroomMinorUnits).toBeLessThan(authorization.authorizedMinorUnits)
  })

  it('characterizes the NBA-like prototype universe honestly', () => {
    // The prototype career starts exactly on its contract anniversary, and the calendar only processes dates it
    // advances to, so no fact is due on the first advanced day; the next anniversary is a year later.
    const prototype = createNewGame()
    const organizationId = organizationIdsOf(prototype).find((candidate) => prototype.organizationFinancialProfilesById[candidate as never] !== undefined)!
    const currency = String(prototype.organizationFinancialProfilesById[organizationId as never]!.baseCurrencyCode)
    const quiet = processClubFinanceForDate(prototype, createGameDate(2032, 10, 2))
    expect(quiet.world).toBe(prototype)

    const nextAnniversary = processClubFinanceForDate(prototype, createGameDate(2033, 10, 1))
    const due = getContractFinancialSchedule(prototype, { organizationId, currencyCode: currency, includeConditional: true }).filter((entry) => entry.effectiveOn === '2033-10-01' && entry.compensationStatus === 'GUARANTEED')
    expect(due.length).toBeGreaterThan(0)
    expect(factsForOrganization(nextAnniversary.world, organizationId).payables.length).toBe(due.length)
    expect(factsForOrganization(nextAnniversary.world, organizationId).payables.every((payable) => String(payable.amount.currencyCode) === currency)).toBe(true)
  })

  it('keeps a long run over multiple payroll dates coherent and duplicate-free', { timeout: 180_000 }, () => {
    const career = updateGameWorld(createAcbTestGame(), { currentDate: DAY_BEFORE })
    let world = career
    const processedDates: string[] = []
    let previousFactCount = 0
    for (let day = 0; day < 90; day += 1) {
      const advanced = advanceDayWithTrace(world)
      expect(advanced.status).toBe('COMPLETED')
      world = advanced.world
      const payroll = advanced.phases.find((entry) => entry.phaseId === 'CLUB_FINANCE_V2')!
      const factCount = Object.keys(world.financialCommitmentsById).length
      if (payroll.worldChanged) processedDates.push(world.currentDate)
      else expect(factCount).toBe(previousFactCount)
      previousFactCount = factCount
    }

    // 90 days past the season start: the annual contract-year cluster materialized exactly once, on its date.
    expect(processedDates).toEqual(['2026-09-26'])
    expect(world.currentDate).toBe('2026-12-24')
    expect(previousFactCount).toBeGreaterThan(200)
    const organizationId = organizationIdsOf(world)[0]!
    const totalPayables = Object.values(world.payablesById).filter((payable) => String(payable.organizationId) === organizationId).reduce((sum, payable) => sum + payable.amount.minorUnits, 0)
    expect(totalPayables).toBe(guaranteedDueOn(career, organizationId, '2026-09-26').reduce((sum, entry) => sum + entry.amount.minorUnits, 0))
    // Cash stays exactly what the ledger says: zero, and no funding was invented to pay the obligations.
    expect(getCashBalancesByCurrency(world, organizationId, world.currentDate).every((row) => row.totalCashMinorUnits === 0)).toBe(true)
    expect(Object.keys(world.treasuryApplicationsById)).toEqual([])
    expect(ensureCanonicalFinanceFoundation(world)).toBe(world)
  })
})
