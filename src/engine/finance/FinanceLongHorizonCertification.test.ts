import { beforeAll, describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game'
import { createPlayerContract } from '@/domain/contract'
import { addDays, compareGameDates, createGameDate, parseGameDate } from '@/domain/date'
import {
  ECONOMIC_POLICY_PROVENANCE_KIND,
  capitalContributionIdFor,
  createCapitalContribution,
  createCompetitionEconomicProfile,
  createCompetitionOperatingCostPolicy,
  createCompetitionRevenuePolicy,
  evaluateTeamGameplayFinancialDecision,
  financeFiscalPeriodsOf,
  getCashBalancesByCurrency,
  getFinanceActivationReport,
  getOrganizationFinanceAccounts,
  getOrganizationFinancialAuthorization,
  getTrialBalanceAsOfDate,
  legacyMajorUnitsToMoney,
  provisionEconomicSources,
  provisionOrganizationFinanceFoundation,
  sumReservedCapacity,
} from '@/domain/finance'
import { authorizeTeamSalaryForTest, financingDrawdownForTest } from '@/domain/finance/financeTestFixture'
import { createGame } from '@/domain/game'
import { competitionIdFromString, contractIdFromString, gameIdFromString, playerIdFromString, seasonIdFromString, teamIdFromString, type TeamId } from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { createTestBasketballProfile, createTestPlayerBio } from '@/domain/player/testFixtures'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createSeason } from '@/domain/season'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { advanceClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16N. Long-horizon Finance certification.
 *
 * The subject is continuity, not features: a small deterministic world whose entire economic life is declared
 * explicitly (multi-year contracts, a ten-fiscal-year participation policy, one operating cost per real home
 * game, one capital contribution and one financing agreement) is driven day by day through the canonical
 * Finance lifecycle, and every checkpoint proves the same invariants the shipped product relies on.
 */
const CURRENCY = 'EUR'
const HOME_ORGANIZATION = 'team-home'
const AWAY_ORGANIZATION = 'team-away'
const HOME_TEAM = teamIdFromString('team-home')
const START = createGameDate(2032, 10, 1)
const HORIZON_YEARS = 10
const FISCAL_YEAR_START_MONTH = 10
const FISCAL_YEARS = [2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041] as const
const INSTALLMENTS_PER_YEAR = 12
const INSTALLMENT_MAJOR_UNITS = 200_000
const HOME_GAME_DATES = ['2032-10-15', '2032-11-05', '2032-12-10', '2033-01-20', '2033-11-08', '2034-11-20'] as const
const SEASONS = [
  { id: 'season-a', label: '2032-33', start: '2032-10-01', end: '2033-05-31' },
  { id: 'season-b', label: '2033-34', start: '2033-10-01', end: '2034-05-31' },
  { id: 'season-c', label: '2034-35', start: '2034-10-01', end: '2035-05-31' },
] as const
const CAPITAL_MINOR_UNITS = 500_000_000
const DRAWDOWN_MINOR_UNITS = 1_000_000_000
const PLAYER_SALARY_MAJOR_UNITS = 120_000
const EXPIRING_SALARY_MAJOR_UNITS = 90_000
/**
 * The Payroll occurrences the canonical schedule must produce for the home Organization, per contract. The terms
 * are year-aligned (exactly how production creates them, via `addYears`), so each contract pays one guaranteed
 * occurrence per contract year and nothing after its term: 2032-10-01 + ten years, and 2032-10-01 + two years.
 */
const EXPECTED_HOME_PAYROLL: Readonly<Record<string, readonly string[]>> = {
  'contract:home-multi-year': ['2032-10-01', '2033-10-01', '2034-10-01', '2035-10-01', '2036-10-01', '2037-10-01', '2038-10-01', '2039-10-01', '2040-10-01', '2041-10-01'],
  'contract:home-expiring': ['2032-10-01', '2033-10-01'],
}
/** The fiscal period the shipped foundation materializes: the only window competition revenue and OPEX can reach. */
const MATERIALIZED_FISCAL_PERIOD_END = '2033-09-30'

function fiscalYearStart(year: number) {
  return createGameDate(year, FISCAL_YEAR_START_MONTH, 1)
}

/**
 * The shipped economic policy shape declares ONE fiscal year of installments (the annual amount must equal the
 * sum of its installments), so the compact fixture declares exactly what the shipped product can declare and the
 * certification reports the later years honestly instead of inventing revenue.
 */
function declaredInstallments() {
  return Array.from({ length: INSTALLMENTS_PER_YEAR }, (_, index) => {
    const monthIndex = FISCAL_YEAR_START_MONTH - 1 + index
    const recognitionOn = createGameDate(FISCAL_YEARS[0] + Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 1)
    return { recognitionOn, dueOn: recognitionOn, amount: legacyMajorUnitsToMoney(INSTALLMENT_MAJOR_UNITS, CURRENCY) }
  })
}

function competitionProfile() {
  return createCompetitionEconomicProfile({
    competitionId: competitionIdFromString('competition-a'),
    fiscalYearStartMonth: FISCAL_YEAR_START_MONTH,
    currencyCode: CURRENCY,
    label: 'BS16N certification competition profile',
    approvedPolicyLabel: 'BS16N Certification Economic Policy',
    revenuePolicies: [createCompetitionRevenuePolicy({
      code: 'COMPETITION_PARTICIPATION_DISTRIBUTION',
      category: 'COMPETITION',
      currencyCode: CURRENCY,
      annualAmount: legacyMajorUnitsToMoney(INSTALLMENT_MAJOR_UNITS * INSTALLMENTS_PER_YEAR, CURRENCY),
      collectionPolicy: 'COLLECT_ON_DUE_DATE',
      installments: declaredInstallments(),
      provenance: { kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: 'bs16n-certification-policy', description: 'BS16N Certification Economic Policy' },
    })],
    operatingCostPolicies: [createCompetitionOperatingCostPolicy({
      code: 'MATCH_OPERATIONS',
      category: 'MATCH_OPERATIONS',
      currencyCode: CURRENCY,
      perEventAmount: legacyMajorUnitsToMoney(25_000, CURRENCY),
      provenance: { kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: 'bs16n-certification-policy', description: 'BS16N Certification Economic Policy' },
    })],
  })
}

/** The compact world: two Organizations, real contracts, real policies, one injection of each capital family. */
function buildCompactWorld(): GameWorld {
  const input = createValidGameWorldInput()
  const extraPlayer = createPlayer({ id: playerIdFromString('player-expiring'), firstName: 'Exp', lastName: 'Iring', gender: 'female', nationalityId: input.countries[0]!.id, basketball: createTestBasketballProfile(), bio: createTestPlayerBio() })
  const games = HOME_GAME_DATES.map((date, index) => {
    const gameDate = createGameDate(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)))
    const season = SEASONS.find((candidate) => compareGameDates(gameDate, createGameDate(Number(candidate.start.slice(0, 4)), Number(candidate.start.slice(5, 7)), Number(candidate.start.slice(8, 10)))) >= 0 && compareGameDates(gameDate, createGameDate(Number(candidate.end.slice(0, 4)), Number(candidate.end.slice(5, 7)), Number(candidate.end.slice(8, 10)))) <= 0)!
    return createGame({
      id: gameIdFromString(`game-${index}`),
      seasonId: seasonIdFromString(season.id),
      competitionId: competitionIdFromString('competition-a'),
      date: gameDate,
      homeTeamId: HOME_TEAM,
      awayTeamId: teamIdFromString('team-away'),
      status: 'scheduled',
      result: null,
    })
  })
  const seasons = SEASONS.map((season) => createSeason({
    id: seasonIdFromString(season.id),
    competitionId: competitionIdFromString('competition-a'),
    label: season.label,
    startDate: createGameDate(Number(season.start.slice(0, 4)), Number(season.start.slice(5, 7)), Number(season.start.slice(8, 10))),
    endDate: createGameDate(Number(season.end.slice(0, 4)), Number(season.end.slice(5, 7)), Number(season.end.slice(8, 10))),
  }))
  const base = createGameWorld({
    ...input,
    currentSeasonId: input.currentSeasonId ?? seasonIdFromString('season-a'),
    players: [...input.players, extraPlayer],
    teams: input.teams.map((team) => team.id === HOME_TEAM ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, extraPlayer.id] } : team),
    competitions: input.competitions.map((competition) => competition.id === competitionIdFromString('competition-a') ? { ...competition, participantTeamIds: [HOME_TEAM, teamIdFromString('team-away')] } : competition),
    seasons: [...input.seasons, ...seasons.filter((season) => !input.seasons.some((existing) => String(existing.id) === String(season.id)))],
    games: [...input.games, ...games],
  })
  const contracts = [
    createPlayerContract({ id: contractIdFromString('contract:home-multi-year'), playerId: playerIdFromString('player-home'), teamId: HOME_TEAM, kind: 'standard', term: { startsOn: START, expiresOn: createGameDate(2042, 10, 1) }, compensation: { annualSalary: PLAYER_SALARY_MAJOR_UNITS } }),
    createPlayerContract({ id: contractIdFromString('contract:away-multi-year'), playerId: playerIdFromString('player-away'), teamId: teamIdFromString('team-away'), kind: 'standard', term: { startsOn: START, expiresOn: createGameDate(2042, 10, 1) }, compensation: { annualSalary: PLAYER_SALARY_MAJOR_UNITS } }),
    createPlayerContract({ id: contractIdFromString('contract:home-expiring'), playerId: extraPlayer.id, teamId: HOME_TEAM, kind: 'standard', term: { startsOn: START, expiresOn: createGameDate(2034, 10, 1) }, compensation: { annualSalary: EXPIRING_SALARY_MAJOR_UNITS } }),
  ]
  let world = updateGameWorld(base, { contracts: [...Object.values(base.contractsById), ...contracts] })
  for (const organizationId of [HOME_ORGANIZATION, AWAY_ORGANIZATION]) world = provisionOrganizationFinanceFoundation(world, organizationId, { currencyCode: CURRENCY, asOfDate: START })
  // Authorization for the first fiscal period only: the shipped product has no renewal producer (BS16N Â§9).
  world = authorizeTeamSalaryForTest(world, HOME_TEAM, { currencyCode: CURRENCY, playerSalaryMinorUnits: 4_000_000_000, staffSalaryMinorUnits: 1_000_000_000 })
  // One explicit capital contribution and one explicit financing agreement: the only injected money.
  world = updateGameWorld(world, {
    capitalContributions: [...Object.values(world.capitalContributionsById), createCapitalContribution({
      id: capitalContributionIdFor(HOME_ORGANIZATION, 'bs16n'),
      recipientOrganizationId: HOME_ORGANIZATION,
      contributor: { kind: 'EXTERNAL', label: 'External investor' },
      currencyCode: CURRENCY,
      amount: { currencyCode: CURRENCY, minorUnits: CAPITAL_MINOR_UNITS },
      effectiveOn: START,
      provenance: { kind: 'TEST_FIXTURE', id: 'bs16n-capital' },
    })],
  })
  world = financingDrawdownForTest(world, HOME_TEAM, DRAWDOWN_MINOR_UNITS, 'bs16n')
  return provisionEconomicSources(world, { profiles: [competitionProfile()] }).world
}

interface Checkpoint {
  readonly label: string
  readonly date: string
  readonly runtimeMs: number
  readonly profiles: number
  readonly periods: number
  readonly transactions: number
  readonly trialDebitMinorUnits: number
  readonly trialCreditMinorUnits: number
  readonly cashMinorUnits: number
  readonly explainedCashMinorUnits: number
  /** Every audited transaction type that touched this Organization's cash account up to this checkpoint. */
  readonly cashSources: readonly string[]
  readonly receivables: number
  readonly payables: number
  readonly revenueRecognitions: number
  readonly expenseRecognitions: number
  readonly commitments: number
  readonly openReservations: number
  readonly consumedReservations: number
  readonly debtLiabilityMinorUnits: number
  readonly equityMinorUnits: number
  readonly authorizationState: string
  readonly gameplayStatus: string
  readonly saveBytes: number
  readonly savedAndReloadedEqual: boolean
}

/**
 * The audited catalogue of transaction types that may touch an Organization's cash account: explicit capital,
 * explicit financing, a collected receivable, a settled payable and explicit debt service. The catalogue is
 * asserted COMPLETE (no dead entry) and CLOSED (no unknown cash source) across the whole horizon, so a future
 * cash movement that is not one of these fails certification instead of silently balancing.
 */
const AUDITED_CASH_SOURCES = ['DEBT_DRAWDOWN', 'DEBT_PRINCIPAL_REPAYMENT', 'OWNER_FUNDING_RECEIPT', 'PAYABLE_SETTLEMENT', 'RECEIVABLE_COLLECTION']

function checkpoint(label: string, dateInput: string, world: GameWorld, runtimeMs: number): Checkpoint {
  const date = parseGameDate(dateInput)
  const accounts = getOrganizationFinanceAccounts(world, HOME_ORGANIZATION, CURRENCY)
  const trial = getTrialBalanceAsOfDate(world, date)
  const cash = getCashBalancesByCurrency(world, HOME_ORGANIZATION, date).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
  const cashPostings = Object.values(world.financialTransactionsById)
    .filter((transaction) => String(transaction.organizationId) === HOME_ORGANIZATION && compareGameDates(transaction.effectiveOn, date) <= 0)
    .flatMap((transaction) => transaction.postings
      .filter((posting) => String(posting.accountId) === String(accounts.cashOperating.id))
      .map((posting) => ({ type: String(transaction.transactionType), minorUnits: posting.direction === 'DEBIT' ? posting.amount.minorUnits : -posting.amount.minorUnits })))
  const explainedCash = cashPostings.reduce((sum, posting) => sum + posting.minorUnits, 0)
  const cashSourceNames = [...new Set(cashPostings.map((posting) => posting.type))].sort()
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId: HOME_ORGANIZATION, currencyCode: CURRENCY, asOfDate: date })
  const decision = evaluateTeamGameplayFinancialDecision(world, { teamId: HOME_TEAM, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: 50_000, sourceAuthority: 'BS16N', sourceEntityId: `bs16n:${label}`, effectiveDate: date })
  const serialized = serializeGameWorldV4(world, `${date}T00:00:00.000Z`)
  const restored = deserializeGameWorldV4(serialized)
  const savedAndReloadedEqual = Object.keys(restored.financialTransactionsById).length === Object.keys(world.financialTransactionsById).length
    && Object.keys(restored.payablesById).length === Object.keys(world.payablesById).length
    && Object.keys(restored.receivablesById).length === Object.keys(world.receivablesById).length
    && Object.keys(restored.organizationFinancialProfilesById).length === Object.keys(world.organizationFinancialProfilesById).length
    && getCashBalancesByCurrency(restored, HOME_ORGANIZATION, date).reduce((sum, row) => sum + row.totalCashMinorUnits, 0) === cash
  return {
    label,
    date,
    runtimeMs: Math.round(runtimeMs),
    profiles: Object.keys(world.organizationFinancialProfilesById).length,
    periods: financeFiscalPeriodsOf(world, HOME_ORGANIZATION).length,
    transactions: Object.keys(world.financialTransactionsById).length,
    trialDebitMinorUnits: trial.reduce((sum, row) => sum + row.debitMinorUnits, 0),
    trialCreditMinorUnits: trial.reduce((sum, row) => sum + row.creditMinorUnits, 0),
    cashMinorUnits: cash,
    explainedCashMinorUnits: explainedCash,
    cashSources: cashSourceNames,
    receivables: Object.keys(world.receivablesById).length,
    payables: Object.keys(world.payablesById).length,
    revenueRecognitions: Object.keys(world.revenueRecognitionsById).length,
    expenseRecognitions: Object.keys(world.expenseRecognitionsById).length,
    commitments: Object.keys(world.financialCommitmentsById).length,
    openReservations: Object.values(world.financialReservationsById).filter((reservation) => reservation.status === 'OPEN').length,
    consumedReservations: Object.values(world.financialReservationsById).filter((reservation) => reservation.status === 'CONSUMED').length,
    debtLiabilityMinorUnits: getTrialBalanceAsOfDate(world, date).find((row) => String(row.accountId) === String(accounts.debtLiability.id))?.balanceMinorUnits ?? 0,
    equityMinorUnits: getTrialBalanceAsOfDate(world, date).find((row) => String(row.accountId) === String(accounts.equityControl.id))?.balanceMinorUnits ?? 0,
    authorizationState: authorization.state,
    gameplayStatus: `${decision.status}:${decision.reasons.join('|')}`,
    saveBytes: serialized.payload === undefined ? JSON.stringify(serialized).length : JSON.stringify(serialized).length,
    savedAndReloadedEqual,
  }
}

const checkpoints: Checkpoint[] = []
const measuredDayCosts: { early: number; late: number } = { early: 0, late: 0 }
let finalWorld: GameWorld
let minCashMinorUnits = Number.POSITIVE_INFINITY
let dayCosts: number[] = []

describe('BS16N long-horizon Finance certification', { timeout: 900_000 }, () => {
  beforeAll(() => {
    // Day zero runs first, so the facts dated on the career's own start date (capital, drawdown, first
    // installment, first payroll occurrence) are processed exactly as the shipped lifecycle would.
    let world = advanceClubFinanceForDate(buildCompactWorld(), START)
    minCashMinorUnits = getCashBalancesByCurrency(world, HOME_ORGANIZATION, START).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
    dayCosts = []
    const targets = ['Y1', 'Y2', 'Y3', 'Y5', 'Y10'] as const
    const targetDates = [createGameDate(2033, 9, 30), createGameDate(2034, 9, 30), createGameDate(2035, 9, 30), createGameDate(2037, 9, 30), createGameDate(2042, 9, 30)]
    for (const [index, target] of targetDates.entries()) {
      const checkpointStartedAt = performance.now()
      while (compareGameDates(world.currentDate, target) < 0) {
        const startedDay = performance.now()
        const ticked = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
        world = advanceClubFinanceForDate(ticked, ticked.currentDate)
        dayCosts.push(performance.now() - startedDay)
        const cash = getCashBalancesByCurrency(world, HOME_ORGANIZATION, world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
        minCashMinorUnits = Math.min(minCashMinorUnits, cash)
      }
      checkpoints.push(checkpoint(targets[index]!, world.currentDate, world, performance.now() - checkpointStartedAt))
    }
    finalWorld = world
  })

  it('keeps the trial balance balanced and every cash movement explainable at every checkpoint', () => {
    expect(checkpoints).toHaveLength(5)
    for (const point of checkpoints) {
      expect(point.trialDebitMinorUnits, `${point.label} trial balance`).toBe(point.trialCreditMinorUnits)
      expect(point.cashMinorUnits, `${point.label} cash`).toBeGreaterThanOrEqual(0)
      // Every cash posting is one of the audited sources and they add up to the balance exactly.
      expect(point.explainedCashMinorUnits, `${point.label} cash identity`).toBe(point.cashMinorUnits)
      expect(point.cashSources.filter((source) => !AUDITED_CASH_SOURCES.includes(source)), `${point.label} unknown cash sources`).toEqual([])
      expect(point.savedAndReloadedEqual).toBe(true)
    }
    // Closed AND complete: the horizon exercised every audited source and no other one.
    const observed = [...new Set(checkpoints.flatMap((point) => point.cashSources))].sort()
    expect(observed).toEqual([...AUDITED_CASH_SOURCES].sort())
    expect(minCashMinorUnits).toBeGreaterThanOrEqual(0)
  })

  it('recognizes and collects exactly the declared revenue installments and one operating cost per home game', () => {
    const final = checkpoints[checkpoints.length - 1]!
    const declaredInstallmentCount = declaredInstallments().length
    const homeRevenue = Object.values(finalWorld.revenueRecognitionsById).filter((entry) => String(entry.organizationId) === HOME_ORGANIZATION)
    expect(declaredInstallmentCount).toBe(INSTALLMENTS_PER_YEAR)
    // Both participating Organizations recognize exactly the declared installments, on the declared dates.
    expect(final.revenueRecognitions).toBe(declaredInstallmentCount * 2)
    expect(homeRevenue.map((entry) => String(entry.recognizedOn)).sort()).toEqual(declaredInstallments().map((installment) => String(installment.recognitionOn)).sort())
    // The shipped product materializes ONE fiscal period, and the declared policy covers only that period: no
    // revenue is invented for the nine years that follow (BS16N Â§4/Â§13, registered product-policy gap).
    expect(homeRevenue.every((entry) => compareGameDates(entry.recognizedOn, createGameDate(2033, 10, 1)) < 0)).toBe(true)

    // Competition operating cost follows the same window: one occurrence per real home game the materialized
    // period reaches, and explicitly none for the games it does not.
    const homeGames = Object.values(finalWorld.games).filter((game) => String(game.homeTeamId) === HOME_ORGANIZATION)
    const gamesInsidePeriod = homeGames.filter((game) => compareGameDates(game.date, parseGameDate(MATERIALIZED_FISCAL_PERIOD_END)) <= 0)
    const gamesAfterPeriod = homeGames.filter((game) => compareGameDates(game.date, parseGameDate(MATERIALIZED_FISCAL_PERIOD_END)) > 0)
    const matchOperations = Object.values(finalWorld.expenseRecognitionsById).filter((entry) => String(entry.organizationId) === HOME_ORGANIZATION && String(entry.category) === 'MATCH_OPERATIONS')
    expect(gamesAfterPeriod.length).toBeGreaterThan(0)
    expect(matchOperations.map((entry) => String(entry.recognizedOn)).sort()).toEqual(gamesInsidePeriod.map((game) => String(game.date)).sort())
  })

  it('materializes payroll exactly once per contract year and never keeps stale capacity', () => {
    const payroll = Object.values(finalWorld.expenseRecognitionsById).filter((entry) => String(entry.organizationId) === HOME_ORGANIZATION && String(entry.category) === 'CONTRACT_PLAYER_SALARY_DUE')
    let expected = 0
    for (const [contractId, expectedDates] of Object.entries(EXPECTED_HOME_PAYROLL)) {
      const occurrences = payroll.filter((entry) => String(entry.id).includes(contractId))
      expect(occurrences.map((entry) => String(entry.recognizedOn)).sort()).toEqual([...expectedDates].sort())
      expected += expectedDates.length
    }
    // One occurrence per contract year, no occurrence outside a contract's own term, no duplicated fact.
    expect(payroll).toHaveLength(expected)
    expect(new Set(payroll.map((entry) => String(entry.id))).size).toBe(payroll.length)
    for (const contract of Object.values(finalWorld.contractsById).filter((candidate) => String(candidate.teamId) === HOME_ORGANIZATION)) {
      expect(payroll.filter((entry) => String(entry.id).includes(String(contract.id))).every((entry) => compareGameDates(entry.recognizedOn, contract.term.expiresOn) < 0)).toBe(true)
    }
    expect(checkpoints[checkpoints.length - 1]!.openReservations).toBe(0)
  })

  it('keeps debt, capital and terminal states exact across the horizon', () => {
    const contributions = Object.values(finalWorld.capitalContributionsById)
    expect(contributions).toHaveLength(1)
    const drawdowns = Object.values(finalWorld.financingDrawdownsById)
    expect(drawdowns).toHaveLength(1)
    expect(drawdowns[0]!.amount.minorUnits).toBe(DRAWDOWN_MINOR_UNITS)
    // Debt service is never duplicated and capital never recurs.
    const debtServiceIds = Object.values(finalWorld.financialTransactionsById)
      .filter((transaction) => String(transaction.organizationId) === HOME_ORGANIZATION && String(transaction.transactionType).includes('DEBT'))
      .map((transaction) => String(transaction.id))
    expect(new Set(debtServiceIds).size).toBe(debtServiceIds.length)
    // Every declared installment was collected exactly once.
    const collections = Object.values(finalWorld.treasuryApplicationsById).filter((application) => application.obligationKind === 'RECEIVABLE' && String(application.organizationId) === HOME_ORGANIZATION)
    expect(collections).toHaveLength(declaredInstallments().length)
    expect(new Set(collections.map((application) => String(application.obligationId))).size).toBe(collections.length)
  })

  it('reports the shipped renewal semantics honestly instead of leaking or falling back', () => {
    const final = checkpoints[checkpoints.length - 1]!
    // The shipped product materializes the first fiscal period only: no silent renewal, no legacy fallback.
    expect(final.periods).toBe(1)
    expect(final.authorizationState).toBe('NOT_PROVISIONED')
    expect(final.gameplayStatus).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(final.gameplayStatus).not.toContain('FINANCE_PROFILE_UNAVAILABLE')
    const report = getFinanceActivationReport(finalWorld).organizations.find((entry) => String(entry.organizationId) === HOME_ORGANIZATION)
    expect(report?.status).toBe('RENEWAL_NOT_MODELLED')
    // Every period that does exist is unique and non-overlapping.
    for (const organizationId of [HOME_ORGANIZATION, AWAY_ORGANIZATION]) {
      const periods = financeFiscalPeriodsOf(finalWorld, organizationId)
      expect(new Set(periods.map((period) => String(period.id))).size).toBe(periods.length)
      for (const left of periods) for (const right of periods) {
        if (String(left.id) === String(right.id)) continue
        expect(compareGameDates(left.endsOn, right.startsOn) < 0 || compareGameDates(right.endsOn, left.startsOn) < 0).toBe(true)
      }
    }
  })

  it('grows with economic events and never duplicates a longitudinal fact', () => {
    const counts = checkpoints.map((point) => point.transactions)
    for (let index = 1; index < counts.length; index += 1) expect(counts[index]!).toBeGreaterThanOrEqual(counts[index - 1]!)
    for (const point of checkpoints) {
      expect(point.profiles).toBe(2)
      expect(point.openReservations).toBe(0)
    }
    const ids = Object.keys(finalWorld.financialTransactionsById)
    expect(new Set(ids).size).toBe(ids.length)
    // History grows with the events the world actually declared, not with the number of days.
    expect(checkpoints[checkpoints.length - 1]!.transactions).toBeGreaterThan(checkpoints[0]!.transactions)
    // Every declared installment becomes exactly one receivable per participating Organization, and every
    // expense becomes exactly one payable: no longitudinal receivable/payable is minted or lost.
    expect(checkpoints[checkpoints.length - 1]!.receivables).toBe(declaredInstallments().length * 2)
    expect(checkpoints[checkpoints.length - 1]!.payables).toBe(checkpoints[checkpoints.length - 1]!.expenseRecognitions)
    // Revenue is frozen after the materialized fiscal period while payroll keeps compounding: the horizon's
    // growth is payroll-driven, which is the honest shape of the shipped product (BS16N Â§9).
    expect(checkpoints[checkpoints.length - 1]!.revenueRecognitions).toBe(checkpoints[0]!.revenueRecognitions)
  })

  it('keeps an ordinary day cheap as history grows on the compact fixture', () => {
    const early = dayCosts.slice(0, 200).sort((left, right) => left - right)[100] ?? 0
    const late = dayCosts.slice(-200).sort((left, right) => left - right)[100] ?? 0
    expect(dayCosts.length).toBeGreaterThan(3000)
    // The compact fixture's Finance day must not become an order of magnitude slower with ten years of history.
    expect(late).toBeLessThan(Math.max(early * 25, 50))
    measuredDayCosts.early = Number(early.toFixed(2))
    measuredDayCosts.late = Number(late.toFixed(2))
  })

  it('rejects replaying a processed date and never reopens a terminal reservation', () => {
    const serialized = serializeGameWorldV4(finalWorld, `${finalWorld.currentDate}T00:00:00.000Z`)
    const reloaded = deserializeGameWorldV4(serialized)
    // Reading a save re-runs the deterministic Staff-contract repair (`ensureStaffContractStructure`), and the
    // compact fixture declares one Staff employment but no contract for it, so the load repairs that lapsed
    // contract. The repair must be idempotent: a second round trip adds nothing at all.
    const twice = deserializeGameWorldV4(serializeGameWorldV4(reloaded, `${reloaded.currentDate}T00:00:00.000Z`))
    expect(Object.keys(twice.staffContractsById)).toEqual(Object.keys(reloaded.staffContractsById))
    expect(Object.keys(twice.financialTransactionsById)).toEqual(Object.keys(reloaded.financialTransactionsById))
    expect(Object.keys(twice.payablesById)).toEqual(Object.keys(reloaded.payablesById))
    // The first Finance pass after that repair settles what the repair made due, and it records only facts that
    // did not exist before the round trip â€” a repair is never a duplicated longitudinal fact.
    const settled = advanceClubFinanceForDate(reloaded, reloaded.currentDate)
    const repairAdded = Object.keys(settled.financialTransactionsById).filter((id) => reloaded.financialTransactionsById[id as never] === undefined)
    const repairAddedExpenses = Object.keys(settled.expenseRecognitionsById).filter((id) => reloaded.expenseRecognitionsById[id as never] === undefined)
    // The repair is one payroll occurrence — the repaired contract's first year — and never a backdated fact.
    expect(repairAddedExpenses).toHaveLength(1)
    expect(repairAdded.every((id) => settled.financialTransactionsById[id as never]!.effectiveOn === reloaded.currentDate)).toBe(true)
    // From there on, replaying the SAME processed date is a strict no-op, including the world identity.
    const again = advanceClubFinanceForDate(settled, settled.currentDate)
    expect(Object.keys(again.financialTransactionsById)).toEqual(Object.keys(settled.financialTransactionsById))
    expect(Object.keys(again.payablesById)).toEqual(Object.keys(settled.payablesById))
    expect(Object.keys(again.receivablesById)).toEqual(Object.keys(settled.receivablesById))
    expect(Object.keys(again.treasuryApplicationsById)).toEqual(Object.keys(settled.treasuryApplicationsById))
    expect(again).toBe(settled)
    // No reservation is ever left OPEN and no terminal reservation is reopened by a replay.
    expect(Object.values(again.financialReservationsById).filter((reservation) => reservation.status === 'OPEN')).toHaveLength(0)
    expect(sumReservedCapacity(Object.values(again.financialReservationsById), HOME_ORGANIZATION, CURRENCY).minorUnits).toBe(0)
  })

  it('keeps the ACB shipped world honest across its fiscal rollover', () => {
    let world: GameWorld = createAcbTestGame()
    const organizationId = String(Object.values(world.teams)[0]!.organizationId)
    const teamId: TeamId = Object.values(world.teams)[0]!.id
    const target = createGameDate(2027, 10, 15)
    const legacyPools = JSON.stringify(world.teamFinancesByTeamId)
    let guard = 0
    while (compareGameDates(world.currentDate, target) < 0 && guard < 500) {
      const ticked = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
      world = advanceClubFinanceForDate(ticked, ticked.currentDate)
      guard += 1
    }
    const beforeRollover = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: CURRENCY, asOfDate: '2027-08-31' })
    const afterRollover = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: CURRENCY, asOfDate: '2027-09-02' })
    const decision = evaluateTeamGameplayFinancialDecision(world, { teamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: 100_000, sourceAuthority: 'BS16N', sourceEntityId: 'bs16n:acb', effectiveDate: '2027-09-02' })
    const report = getFinanceActivationReport(world).organizations.find((entry) => String(entry.organizationId) === organizationId)

    expect(guard).toBeGreaterThan(300)
    expect(beforeRollover.state).toBe('ACTIVE')
    expect(afterRollover.state).toBe('NOT_PROVISIONED')
    expect(decision.reasons).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(report?.status).toBe('RENEWAL_NOT_MODELLED')
    // The rollover neither leaked the previous authorization nor fell back to the legacy pools.
    expect(world.teamFinancesByTeamId).toEqual(JSON.parse(legacyPools))
    expect(financeFiscalPeriodsOf(world, organizationId)).toHaveLength(1)
    // Economic life continues for everything contract-driven: payroll keeps materializing after the rollover.
    expect(Object.keys(world.financialTransactionsById).length).toBeGreaterThan(1000)
    const payrollAfterRollover = Object.values(world.expenseRecognitionsById).filter((entry) => String(entry.category).includes('SALARY') && compareGameDates(entry.recognizedOn, parseGameDate('2027-09-01')) > 0)
    expect(payrollAfterRollover.length, `payroll occurrences after the rollover: ${payrollAfterRollover.map((entry) => `${String(entry.recognizedOn)}|${String(entry.category)}`).join(',')}`).toBeGreaterThan(0)
    // Everything period-driven stops with the only fiscal period the product can materialize: no competition
    // revenue and no event operating cost is invented for the season that follows (registered BS16N gap).
    const revenueAfterRollover = Object.values(world.revenueRecognitionsById).filter((entry) => compareGameDates(entry.recognizedOn, parseGameDate('2027-09-01')) >= 0)
    const opexAfterRollover = Object.values(world.expenseRecognitionsById).filter((entry) => String(entry.category) === 'MATCH_OPERATIONS' && compareGameDates(entry.recognizedOn, parseGameDate('2027-09-01')) >= 0)
    expect(revenueAfterRollover.map((entry) => `${String(entry.organizationId)}|${String(entry.recognizedOn)}`), 'revenue after the rollover').toEqual([])
    expect(opexAfterRollover.map((entry) => `${String(entry.organizationId)}|${String(entry.recognizedOn)}`), 'operating cost after the rollover').toEqual([])
    // Currency never drifts.
    expect(String(world.organizationFinancialProfilesById[organizationId as never]!.baseCurrencyCode)).toBe(CURRENCY)
  })
})
