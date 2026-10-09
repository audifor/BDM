import { describe, expect, it } from 'vitest'

import { createAcbTestGame } from '@/app/game'
import { createGameDate, type GameDate } from '@/domain/date'
import {
  capitalContributionIdFor,
  createCapitalContribution,
  createFinancingAgreement,
  createFinancingDrawdown,
  createOwnerFundingTransaction,
  evaluateOrganizationFinancialCommitment,
  financingAgreementIdFor,
  financingDrawdownIdFor,
  getCashBalancesByCurrency,
  getDebtServiceForecast,
  getDrawnPrincipal,
  getOpenPayables,
  getOrganizationFinanceAccounts,
  getOutstandingPrincipal,
  getRemainingAvailability,
  getTrialBalanceAsOfDate,
  legacyMajorUnitsToMoney,
  materializeOrganizationOpeningEconomicState,
  type CapitalContribution,
  type FinancingAgreement,
  type FinancingDrawdown,
  type OpeningEconomicStateSource,
} from '@/domain/finance'
import { createGovernanceDecision, createGovernanceDecisionEvent } from '@/domain/governance/GovernanceDecision'
import { createGovernanceBody, createGovernanceInstitution } from '@/domain/governance'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16L certification: financing and capital are distinct economic authorities, a drawdown is cash plus liability
 * and never revenue, a capital contribution is cash plus equity and never revenue, authorized credit is not cash,
 * related-party financing cannot self-authorize, in-world lenders conserve world cash, and Treasury uses only the
 * liquidity a canonical financing fact actually created.
 */
const EUR = 'EUR'
const BORROWER = 'acb-team-rmb'
const LENDER = 'acb-team-bar'
const DRAW_DATE = createGameDate(2026, 10, 5)
const provenance = { kind: 'TEST_FINANCING', id: 'bs16l:fixture' }

function organizationIdsOf(world: GameWorld): readonly string[] {
  return [...new Set(Object.values(world.teams).map((team) => String(team.organizationId)))].sort()
}

function cashOf(world: GameWorld, organizationId: string, asOfDate?: GameDate): number {
  return getCashBalancesByCurrency(world, organizationId, asOfDate ?? world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

function revenueMinorUnitsOf(world: GameWorld, organizationId: string): number {
  return Object.values(world.revenueRecognitionsById).filter((item) => String(item.organizationId) === organizationId).reduce((sum, item) => sum + item.amount.minorUnits, 0)
}

function expenseMinorUnitsOf(world: GameWorld, organizationId: string, category?: string): number {
  return Object.values(world.expenseRecognitionsById)
    .filter((item) => String(item.organizationId) === organizationId && (category === undefined || String(item.category) === category))
    .reduce((sum, item) => sum + item.amount.minorUnits, 0)
}

function liabilityBalances(world: GameWorld, organizationId: string): readonly { readonly accountId: string; readonly minorUnits: number }[] {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, EUR)
  const balances = new Map<string, number>([[String(accounts.debtLiability.id), 0], [String(accounts.equityControl.id), 0], [String(accounts.loanAsset.id), 0]])
  for (const transaction of Object.values(world.financialTransactionsById)) {
    for (const posting of transaction.postings) {
      const key = String(posting.accountId)
      if (!balances.has(key)) continue
      balances.set(key, (balances.get(key) ?? 0) + (posting.direction === 'CREDIT' ? posting.amount.minorUnits : -posting.amount.minorUnits))
    }
  }
  return Object.freeze([...balances.entries()].map(([accountId, minorUnits]) => Object.freeze({ accountId, minorUnits })))
}

function debtLiabilityOf(world: GameWorld, organizationId: string): number {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, EUR)
  return liabilityBalances(world, organizationId).find((row) => row.accountId === String(accounts.debtLiability.id))!.minorUnits
}

function equityOf(world: GameWorld, organizationId: string): number {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, EUR)
  return liabilityBalances(world, organizationId).find((row) => row.accountId === String(accounts.equityControl.id))!.minorUnits
}

function loanAssetOf(world: GameWorld, organizationId: string): number {
  // An asset is debit-positive, unlike the liability/equity balances above.
  const accounts = getOrganizationFinanceAccounts(world, organizationId, EUR)
  let minorUnits = 0
  for (const transaction of Object.values(world.financialTransactionsById)) {
    for (const posting of transaction.postings) {
      if (String(posting.accountId) !== String(accounts.loanAsset.id)) continue
      minorUnits += posting.direction === 'DEBIT' ? posting.amount.minorUnits : -posting.amount.minorUnits
    }
  }
  return minorUnits
}

function withFinancing(world: GameWorld, agreementInput: Partial<Parameters<typeof createFinancingAgreement>[0]> = {}, drawdown?: { readonly amountMinorUnits: number; readonly drawnOn?: GameDate }): GameWorld {
  const agreement = createFinancingAgreement({
    id: financingAgreementIdFor(BORROWER, 'facility-1'),
    borrowerOrganizationId: BORROWER,
    fundingParty: { kind: 'EXTERNAL', label: 'External financial institution' },
    debtType: 'CREDIT_FACILITY',
    currencyCode: EUR,
    authorizedPrincipal: { currencyCode: EUR, minorUnits: 100_000_000 },
    startsOn: '2026-10-01',
    expiresOn: '2027-06-30',
    provenance,
    ...agreementInput,
  })
  const drawdowns: FinancingDrawdown[] = drawdown === undefined ? [] : [createFinancingDrawdown({
    id: financingDrawdownIdFor(agreement.id, 'draw-1'),
    agreementId: agreement.id,
    organizationId: BORROWER,
    amount: { currencyCode: EUR, minorUnits: drawdown.amountMinorUnits },
    drawnOn: drawdown.drawnOn ?? DRAW_DATE,
    provenance,
  })]
  const withAgreement = updateGameWorld(world, { financingAgreements: [...Object.values(world.financingAgreementsById), agreement as FinancingAgreement] })
  return drawdowns.length === 0 ? withAgreement : updateGameWorld(withAgreement, { financingDrawdowns: [...Object.values(withAgreement.financingDrawdownsById), ...drawdowns] })
}

function withCapitalContribution(world: GameWorld, amountMinorUnits: number, overrides: Partial<Parameters<typeof createCapitalContribution>[0]> = {}): GameWorld {
  const contribution = createCapitalContribution({
    id: capitalContributionIdFor(BORROWER, 'capital-1'),
    recipientOrganizationId: BORROWER,
    contributor: { kind: 'EXTERNAL', label: 'External investor' },
    currencyCode: EUR,
    amount: { currencyCode: EUR, minorUnits: amountMinorUnits },
    effectiveOn: DRAW_DATE,
    provenance,
    ...overrides,
  })
  return updateGameWorld(world, { capitalContributions: [...Object.values(world.capitalContributionsById), contribution as CapitalContribution] })
}

function openingCapital(organizationId: string, cashMinorUnits: number, effectiveOn: string): OpeningEconomicStateSource {
  return { sourceAuthority: 'OWNERSHIP', sourceEntityId: `owner:${organizationId}`, organizationId, currencyCode: EUR, effectiveOn, cashMinorUnits, counterpartKind: 'OWNER_CAPITAL', counterpartId: `person:owner:${organizationId}` }
}

function approvedDecision(world: GameWorld, decisionType: 'DEBT' | 'CAPITAL_EXPENDITURE', id: string): GameWorld {
  const teamId = Object.values(world.teams).find((team) => String(team.organizationId) === BORROWER)!.id
  const institution = createGovernanceInstitution({ id: `institution:${id}`, universe: 'PROFESSIONAL_CLUB', name: `BS16L board of ${BORROWER}`, teamIds: [teamId] })
  const owner = createGovernanceBody({ id: `${id}:owner`, institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' })
  const board = createGovernanceBody({ id: `${id}:board`, institutionId: institution.id, kind: 'BOARD', name: 'Board' })
  const grant = { id: `${id}:grant`, fromBodyId: owner.id, toBodyId: board.id, decision: decisionType, grantedOn: createGameDate(2026, 10, 1) }
  const participation = [
    { id: `${id}:propose`, authorityGrantId: grant.id, bodyId: board.id, edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: `${id}:approve`, authorityGrantId: grant.id, bodyId: board.id, edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const },
  ]
  const decision = createGovernanceDecision({ id, institutionId: institution.id, decisionType, proposedByBodyId: board.id, proposedOn: createGameDate(2026, 10, 1), subject: { kind: 'GENERIC', referenceId: id } })
  const events = [
    createGovernanceDecisionEvent({ id: `${id}:event:1`, decisionId: id, kind: 'PROPOSED', bodyId: board.id, effectiveOn: createGameDate(2026, 10, 1), authorityGrantIds: [grant.id] }),
    createGovernanceDecisionEvent({ id: `${id}:event:2`, decisionId: id, kind: 'APPROVED', bodyId: board.id, effectiveOn: createGameDate(2026, 10, 2), authorityGrantIds: [grant.id] }),
  ]
  return updateGameWorld(world, { governanceInstitutions: [institution], governanceBodies: [owner, board], governanceAuthorityGrants: [grant], governanceDecisionParticipationGrants: participation, governanceDecisions: [decision], governanceDecisionEvents: events })
}

describe('BS16L financing and capital lifecycle', { timeout: 120_000 }, () => {
  it('A. executes an explicit external drawdown as cash plus debt liability, with no revenue', () => {
    const before = createAcbTestGame()
    const openingRevenue = revenueMinorUnitsOf(before, BORROWER)
    expect(cashOf(before, BORROWER, DRAW_DATE)).toBe(0)
    expect(debtLiabilityOf(before, BORROWER)).toBe(0)

    const world = withFinancing(before, {}, { amountMinorUnits: 100_000_000 })
    const processed = processClubFinanceForDate(world, DRAW_DATE).world

    expect(cashOf(processed, BORROWER, DRAW_DATE)).toBe(100_000_000)
    expect(debtLiabilityOf(processed, BORROWER)).toBe(100_000_000)
    expect(revenueMinorUnitsOf(processed, BORROWER)).toBe(openingRevenue)
    expect(expenseMinorUnitsOf(processed, BORROWER)).toBe(0)
    // The borrower's debt is a real canonical instrument, and the drawdown is traceable to its agreement.
    const instrument = Object.values(processed.debtInstrumentsById).find((item) => String(item.dimensions?.reference?.id) === financingAgreementIdFor(BORROWER, 'facility-1'))!
    expect(getOutstandingPrincipal(processed, String(instrument.id), DRAW_DATE).minorUnits).toBe(100_000_000)
    expect(instrument.lender.kind).toBe('EXTERNAL')
    // The ledger stays balanced and no authorization was invented.
    const trial = getTrialBalanceAsOfDate(processed, DRAW_DATE)
    expect(trial.reduce((sum, row) => sum + row.debitMinorUnits, 0)).toBe(trial.reduce((sum, row) => sum + row.creditMinorUnits, 0))
  })

  it('B. records an external capital contribution as cash plus equity, never as debt or revenue', () => {
    const before = createAcbTestGame()
    const openingRevenue = revenueMinorUnitsOf(before, BORROWER)
    const world = withCapitalContribution(before, 50_000_000)

    const processed = processClubFinanceForDate(world, DRAW_DATE).world
    expect(cashOf(processed, BORROWER, DRAW_DATE)).toBe(50_000_000)
    expect(equityOf(processed, BORROWER)).toBe(50_000_000)
    expect(debtLiabilityOf(processed, BORROWER)).toBe(0)
    expect(Object.keys(processed.debtInstrumentsById)).toEqual(Object.keys(before.debtInstrumentsById))
    expect(revenueMinorUnitsOf(processed, BORROWER)).toBe(openingRevenue)
  })

  it('C. keeps an authorized but undrawn facility from changing cash', () => {
    const before = createAcbTestGame()
    const world = withFinancing(before)
    const processed = processClubFinanceForDate(world, DRAW_DATE)

    expect(processed.result.organizations.find((entry) => String(entry.organizationId) === BORROWER)?.financingOccurrences).toBe(0)
    expect(cashOf(processed.world, BORROWER, DRAW_DATE)).toBe(0)
    expect(debtLiabilityOf(processed.world, BORROWER)).toBe(0)
    // The facility is a right to draw: it exists, it is available, and it is not cash.
    expect(getDrawnPrincipal(processed.world, financingAgreementIdFor(BORROWER, 'facility-1')).minorUnits).toBe(0)
    expect(getRemainingAvailability(processed.world, financingAgreementIdFor(BORROWER, 'facility-1')).minorUnits).toBe(100_000_000)
  })

  it('D. blocks related-party financing that cannot prove an approval', () => {
    const before = createAcbTestGame()
    const related = withFinancing(before, { fundingParty: { kind: 'PERSON', id: 'person:owner:rmb', label: 'Owner (related party)' }, relatedParty: true, debtType: 'OWNER_LOAN' }, { amountMinorUnits: 100_000_000 })
    const processed = processClubFinanceForDate(related, DRAW_DATE)

    const entry = processed.result.organizations.find((item) => String(item.organizationId) === BORROWER)!.financing!.entries[0]!
    expect(entry.status).toBe('BLOCKED')
    expect(entry.code).toBe('RELATED_PARTY_APPROVAL_REQUIRED')
    expect(processed.result.organizations.find((item) => String(item.organizationId) === BORROWER)!.financingBlockedCount).toBe(1)
    expect(cashOf(processed.world, BORROWER, DRAW_DATE)).toBe(0)
    expect(debtLiabilityOf(processed.world, BORROWER)).toBe(0)
    expect(Object.values(processed.world.financialTransactionsById).some((item) => item.transactionType === 'DEBT_DRAWDOWN')).toBe(false)
  })

  it('E. represents a Person lender structurally but blocks unverifiable personal funds', () => {
    const before = createAcbTestGame()
    const agreement = createFinancingAgreement({ id: financingAgreementIdFor(BORROWER, 'coach-loan'), borrowerOrganizationId: BORROWER, fundingParty: { kind: 'PERSON', id: 'person:coach:rmb', label: 'Head coach' }, debtType: 'OTHER_DEBT', currencyCode: EUR, authorizedPrincipal: { currencyCode: EUR, minorUnits: 10_000_000 }, startsOn: '2026-10-01', expiresOn: '2027-06-30', provenance })
    expect(agreement.fundingParty.kind).toBe('PERSON')

    const world = updateGameWorld(updateGameWorld(before, { financingAgreements: [agreement] }), { financingDrawdowns: [createFinancingDrawdown({ id: financingDrawdownIdFor(agreement.id, 'draw-1'), agreementId: agreement.id, organizationId: BORROWER, amount: { currencyCode: EUR, minorUnits: 10_000_000 }, drawnOn: DRAW_DATE, provenance })] })
    const processed = processClubFinanceForDate(world, DRAW_DATE)
    const entry = processed.result.organizations.find((item) => String(item.organizationId) === BORROWER)!.financing!.entries[0]!

    expect(entry.status).toBe('BLOCKED')
    expect(entry.code).toBe('FUNDING_CAPACITY_UNVERIFIED')
    expect(cashOf(processed.world, BORROWER, DRAW_DATE)).toBe(0)
  })

  it('F. conserves world cash on an Organization-to-Organization loan, with the lender gaining a loan asset', () => {
    const before = createAcbTestGame()
    // The lender can only lend money it canonically holds (an explicit owner-capital fact, never invented).
    const fundedLender = materializeOrganizationOpeningEconomicState(before, openingCapital(LENDER, 200_000_000, '2026-10-01'))
    expect(fundedLender.status).toBe('MATERIALIZED')
    const world = withFinancing(fundedLender.world, { fundingParty: { kind: 'ORGANIZATION', id: LENDER, label: 'Sister club' } }, { amountMinorUnits: 100_000_000 })
    const worldCashBefore = cashOf(world, LENDER, DRAW_DATE) + cashOf(world, BORROWER, DRAW_DATE)

    const processed = processClubFinanceForDate(world, DRAW_DATE).world
    const worldCashAfter = cashOf(processed, LENDER, DRAW_DATE) + cashOf(processed, BORROWER, DRAW_DATE)

    expect(cashOf(processed, LENDER, DRAW_DATE)).toBe(100_000_000)
    expect(loanAssetOf(processed, LENDER)).toBe(100_000_000)
    expect(cashOf(processed, BORROWER, DRAW_DATE)).toBe(100_000_000)
    expect(debtLiabilityOf(processed, BORROWER)).toBe(100_000_000)
    // World cash is conserved exactly: the loan moved money, it did not create it.
    expect(worldCashAfter).toBe(worldCashBefore)
    const trial = getTrialBalanceAsOfDate(processed, DRAW_DATE)
    expect(trial.reduce((sum, row) => sum + row.debitMinorUnits, 0)).toBe(trial.reduce((sum, row) => sum + row.creditMinorUnits, 0))
  })

  it('refuses a drawdown beyond the authorized amount and replays an executed drawdown as a no-op', () => {
    const before = createAcbTestGame()
    // The draw limit is a world invariant: orders may never promise more than the facility authorizes.
    expect(() => withFinancing(before, { authorizedPrincipal: { currencyCode: EUR, minorUnits: 50_000_000 } }, { amountMinorUnits: 100_000_000 })).toThrow(/exceed its authorized amount/)

    const world = withFinancing(before, {}, { amountMinorUnits: 100_000_000 })
    const processed = processClubFinanceForDate(world, DRAW_DATE).world
    const replay = processClubFinanceForDate(processed, DRAW_DATE).world
    expect(cashOf(replay, BORROWER, DRAW_DATE)).toBe(100_000_000)
    expect(debtLiabilityOf(replay, BORROWER)).toBe(100_000_000)
    expect(Object.keys(replay.debtInstrumentsById)).toEqual(Object.keys(processed.debtInstrumentsById))
    expect(Object.keys(replay.financialTransactionsById).length).toBe(Object.keys(processed.financialTransactionsById).length)
    expect(Object.keys(replay.financingDrawdownsById)).toEqual(Object.keys(processed.financingDrawdownsById))

    // A second agreement can never re-promise the same authorized money: availability is derived, not stored.
    expect(getRemainingAvailability(processed, financingAgreementIdFor(BORROWER, 'facility-1')).minorUnits).toBe(0)
  })

  it('repays principal as liability plus cash, never as an expense, and keeps explicit interest accounting separate', () => {
    const before = createAcbTestGame()
    const world = withFinancing(before, {
      authorizedPrincipal: { currencyCode: EUR, minorUnits: 100_000_000 },
      interest: { kind: 'EXPLICIT_SCHEDULE', entries: [{ recognitionOn: createGameDate(2026, 11, 5), dueOn: createGameDate(2026, 11, 5), amount: legacyMajorUnitsToMoney(5_000, EUR) }] },
      repayment: { kind: 'EXPLICIT_SCHEDULE', entries: [{ repaymentOn: createGameDate(2026, 11, 5), amount: legacyMajorUnitsToMoney(100_000, EUR) }] },
    }, { amountMinorUnits: 100_000_000 })

    const drawn = processClubFinanceForDate(world, DRAW_DATE).world
    const schedule = getDebtServiceForecast(drawn, { organizationId: BORROWER, from: DRAW_DATE, to: createGameDate(2026, 12, 31) })
    expect(schedule.some((row) => row.principalMinorUnits === 10_000_000)).toBe(true)
    expect(schedule.some((row) => row.interestMinorUnits === 500_000)).toBe(true)

    const serviced = processClubFinanceForDate(drawn, createGameDate(2026, 11, 5)).world
    expect(cashOf(serviced, BORROWER, createGameDate(2026, 11, 5))).toBe(89_500_000)
    expect(debtLiabilityOf(serviced, BORROWER)).toBe(90_000_000)
    // Principal is a balance-sheet movement; only the explicit interest reaches P&L.
    expect(expenseMinorUnitsOf(serviced, BORROWER, 'INTEREST_EXPENSE')).toBe(500_000)
    const instrumentId = Object.keys(serviced.debtInstrumentsById).find((id) => serviced.debtInstrumentsById[id]!.originalPrincipal.minorUnits === 100_000_000)!
    expect(getOutstandingPrincipal(serviced, instrumentId, createGameDate(2026, 11, 5)).minorUnits).toBe(90_000_000)
  })

  it('lets Treasury settle a due batch with liquidity an explicit drawdown actually created', () => {
    const before = createAcbTestGame()
    const cluster = createGameDate(2026, 9, 26)
    // Payroll obligations exist from the season start and cannot be funded by the club's own collections...
    const afterPayroll = processClubFinanceForDate(before, cluster)
    const ownBatch = afterPayroll.result.organizations.find((entry) => String(entry.organizationId) === BORROWER)!.treasury!
    const dueBatch = ownBatch.totalDueMinorUnits
    expect(dueBatch).toBeGreaterThan(0)
    expect(ownBatch.status).toBe('INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES')
    expect(getOpenPayables(afterPayroll.world, BORROWER, cluster).length).toBeGreaterThan(0)

    // ...until an explicit financing drawdown covers the whole due batch on a later date.
    const world = withFinancing(afterPayroll.world, { authorizedPrincipal: { currencyCode: EUR, minorUnits: 100_000_000_000 } }, { amountMinorUnits: dueBatch, drawnOn: createGameDate(2026, 10, 5) })
    const financed = processClubFinanceForDate(world, createGameDate(2026, 10, 5))
    const organization = financed.result.organizations.find((entry) => String(entry.organizationId) === BORROWER)!

    expect(organization.financingOccurrences).toBe(1)
    expect(organization.treasury!.status).toBe('SETTLED')
    expect(getOpenPayables(financed.world, BORROWER, createGameDate(2026, 10, 5))).toHaveLength(0)
    expect(cashOf(financed.world, BORROWER, createGameDate(2026, 10, 5))).toBe(0)
    expect(debtLiabilityOf(financed.world, BORROWER)).toBe(dueBatch)
    // No financing→payable shortcut: only the canonical ledger moved, and no receivable or revenue appeared.
    expect(revenueMinorUnitsOf(financed.world, BORROWER)).toBe(revenueMinorUnitsOf(afterPayroll.world, BORROWER))
  })

  it('moves FinancialAuthority liquidity without granting spending authorization', () => {
    const before = createAcbTestGame()
    const world = withFinancing(before, {}, { amountMinorUnits: 100_000_000 })
    const amount = { currencyCode: EUR, minorUnits: 1_000_000 }

    const beforeDecision = evaluateOrganizationFinancialCommitment(world, { organizationId: BORROWER, currency: EUR, amount, category: 'PLAYER_SALARY', asOfDate: DRAW_DATE })
    const processed = processClubFinanceForDate(world, DRAW_DATE).world
    const afterDecision = evaluateOrganizationFinancialCommitment(processed, { organizationId: BORROWER, currency: EUR, amount, category: 'PLAYER_SALARY', asOfDate: DRAW_DATE })

    // Liquidity is read from the ledger, so the drawdown is visible without any manual adjustment: the same
    // commitment that was unaffordable on liquidity alone becomes affordable now (§27)...
    expect((afterDecision.liquidity.availableCash?.minorUnits ?? 0) - (beforeDecision.liquidity.availableCash?.minorUnits ?? 0)).toBe(100_000_000)
    expect(beforeDecision.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(afterDecision.status).toBe('AFFORDABLE_NOW')
    // ...while AUTHORIZATION ≠ LIQUIDITY: financing cash never creates or increases spending permission (§28).
    expect(afterDecision.availableAuthorizedHeadroom?.minorUnits ?? null).toBe(beforeDecision.availableAuthorizedHeadroom?.minorUnits ?? null)
    expect(afterDecision.reservationState).toEqual(beforeDecision.reservationState)
  })

  it('round-trips agreements, drawdowns and capital contributions through Save V4 without duplicating facts', () => {
    const before = createAcbTestGame()
    const withBoth = withCapitalContribution(withFinancing(before, {}, { amountMinorUnits: 100_000_000 }), 50_000_000)
    const processed = processClubFinanceForDate(withBoth, DRAW_DATE).world

    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(processed, '2026-10-06T00:00:00.000Z'))
    expect(reloaded.financingAgreementsById).toEqual(processed.financingAgreementsById)
    expect(reloaded.financingDrawdownsById).toEqual(processed.financingDrawdownsById)
    expect(reloaded.capitalContributionsById).toEqual(processed.capitalContributionsById)
    expect(cashOf(reloaded, BORROWER, DRAW_DATE)).toBe(150_000_000)
    expect(debtLiabilityOf(reloaded, BORROWER)).toBe(100_000_000)
    expect(equityOf(reloaded, BORROWER)).toBe(50_000_000)

    const replay = processClubFinanceForDate(reloaded, DRAW_DATE).world
    expect(Object.keys(replay.financialTransactionsById).length).toBe(Object.keys(reloaded.financialTransactionsById).length)
    expect(cashOf(replay, BORROWER, DRAW_DATE)).toBe(150_000_000)

    // An older payload without the BS16L collections still loads as an empty, valid world.
    const legacy = { ...serializeGameWorldV4(before, '2026-10-06T00:00:00.000Z').payload } as Record<string, unknown>
    delete legacy.financingAgreements
    delete legacy.financingDrawdowns
    delete legacy.capitalContributions
    const parsed = deserializeGameWorldV4({ ...serializeGameWorldV4(before, '2026-10-06T00:00:00.000Z'), payload: legacy } as never)
    expect(Object.keys(parsed.financingAgreementsById)).toEqual([])
    expect(Object.keys(parsed.capitalContributionsById)).toEqual([])
  })

  it('never invents financing in a shipped career, however large its obligations are', () => {
    let world = updateGameWorld(createAcbTestGame(), { currentDate: createGameDate(2026, 9, 25) })
    for (let day = 0; day < 20; day += 1) world = processClubFinanceForDate(world, world.currentDate).world
    expect(Object.keys(world.financingAgreementsById)).toEqual([])
    expect(Object.keys(world.financingDrawdownsById)).toEqual([])
    expect(Object.keys(world.capitalContributionsById)).toEqual([])
    expect(Object.values(world.financialTransactionsById).some((item) => item.transactionType === 'DEBT_DRAWDOWN' || item.transactionType === 'OWNER_FUNDING_RECEIPT')).toBe(false)
    for (const organizationId of organizationIdsOf(world)) expect(debtLiabilityOf(world, organizationId)).toBe(0)
  })

  it('honours an approved Governance decision for related-party financing and rejects an unapproved one', () => {
    const before = createAcbTestGame()
    const approved = approvedDecision(before, 'DEBT', 'decision:debt:1')
    const world = withFinancing(approved, { fundingParty: { kind: 'ORGANIZATION', id: LENDER, label: 'Related club' }, relatedParty: true, governanceDecisionReference: { kind: 'GOVERNANCE_DECISION', id: 'decision:debt:1' } }, { amountMinorUnits: 10_000_000 })
    const fundedLender = materializeOrganizationOpeningEconomicState(world, openingCapital(LENDER, 50_000_000, '2026-10-01')).world

    const processed = processClubFinanceForDate(fundedLender, DRAW_DATE)
    const entry = processed.result.organizations.find((item) => String(item.organizationId) === BORROWER)!.financing!.entries[0]!
    expect(entry.status).toBe('EXECUTED')
    expect(cashOf(processed.world, BORROWER, DRAW_DATE)).toBe(10_000_000)

    // An unrelated decision type cannot authorize a debt operation either.
    const wrongType = approvedDecision(before, 'CAPITAL_EXPENDITURE', 'decision:capex:1')
    const mismatched = withFinancing(wrongType, { relatedParty: true, governanceDecisionReference: { kind: 'GOVERNANCE_DECISION', id: 'decision:capex:1' } }, { amountMinorUnits: 10_000_000 })
    const blocked = processClubFinanceForDate(mismatched, DRAW_DATE)
    expect(blocked.result.organizations.find((item) => String(item.organizationId) === BORROWER)!.financing!.entries[0]!.code).toBe('GOVERNANCE_DECISION_TYPE_MISMATCH')
    expect(cashOf(blocked.world, BORROWER, DRAW_DATE)).toBe(0)
  })

  it('executes an explicit owner-funding transaction through the same canonical liquidity path', () => {
    const before = createAcbTestGame()
    const accounts = getOrganizationFinanceAccounts(before, BORROWER, EUR)
    const world = updateGameWorld(before, {
      financialTransactions: [...Object.values(before.financialTransactionsById), createOwnerFundingTransaction(before, {
        transactionId: `funding:owner:${BORROWER}`,
        organizationId: BORROWER,
        amount: { currencyCode: EUR, minorUnits: 25_000_000 },
        effectiveOn: DRAW_DATE,
        cashAccountId: accounts.cashOperating.id,
        offsetAccountId: accounts.equityControl.id,
        provenance: { kind: 'OWNER_FUNDING', id: `owner-funding:${BORROWER}` },
      })],
    })
    expect(cashOf(world, BORROWER, DRAW_DATE)).toBe(25_000_000)
    expect(equityOf(world, BORROWER)).toBe(25_000_000)
    expect(debtLiabilityOf(world, BORROWER)).toBe(0)
  })
})
