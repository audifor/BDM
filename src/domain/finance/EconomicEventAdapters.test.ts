import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createFinancialAccount } from './FinancialLedger'
import { createAuthorizedEconomicEvent, processCompetitionEconomicEvent, processContractEconomicEvent, processOwnerFundingEconomicEvent } from './EconomicEventAdapters'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { getNetOperatingResult, getRecognizedExpense, getRecognizedRevenue } from './RecognitionQueries'
import { createReceivable, settlePayable, settleReceivable } from './Treasury'

function accounts(organizationId: string) {
  return [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'receivable:eur', organizationId, accountType: 'RECEIVABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'payable:eur', organizationId, accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'revenue:eur', organizationId, accountType: 'REVENUE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'expense:eur', organizationId, accountType: 'EXPENSE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
}

function competitionWorld() {
  const input = createValidGameWorldInput()
  return createGameWorld({ ...input, financialAccounts: accounts('team-home') })
}

function contractWorld() {
  const world = createNewGame()
  const team = Object.values(world.teams)[0]!
  return { world: updateGameWorld(world, { financialAccounts: accounts(team.organizationId) }), contract: Object.values(world.contractsById).find((item) => item.teamId === team.id)! }
}

describe('CF4 economic event adapters', () => {
  it('processes a Contract expense event atomically into commitment, expense, payable and ledger', () => {
    const { world, contract } = contractWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:contract:installment', eventType: 'CONTRACT_EXPENSE_DUE', sourceAuthority: 'CONTRACT', sourceEntityId: contract.id, organizationId: world.teams[contract.teamId]!.organizationId, effectiveOn: world.currentDate, dueOn: world.currentDate, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, provenance: { kind: 'CONTRACT_AUTHORIZED_EVENT', id: 'contract-installment-1' }, idempotencyKey: 'installment-1', contractId: contract.id, teamId: contract.teamId, counterparty: { kind: 'PERSON', id: String(contract.playerId), label: 'Contracted player' }, dimensions: { teamId: contract.teamId, contractId: contract.id } })
    const result = processContractEconomicEvent(world, event, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' } })
    expect(result.status).toBe('accepted')
    expect(result.commitment).toBeDefined()
    expect(result.recognition).toBeDefined()
    expect(result.payable).toBeDefined()
    expect(result.transaction?.transactionType).toBe('EXPENSE_RECOGNITION')
    expect(getRecognizedExpense(result.world, event.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
  })

  it('reprocesses the same Contract event idempotently and settles without a second expense', () => {
    const { world, contract } = contractWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:contract:repeat', eventType: 'CONTRACT_EXPENSE_DUE', sourceAuthority: 'CONTRACT', sourceEntityId: contract.id, organizationId: world.teams[contract.teamId]!.organizationId, effectiveOn: world.currentDate, dueOn: world.currentDate, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, provenance: { kind: 'CONTRACT_AUTHORIZED_EVENT', id: 'contract-repeat-1' }, idempotencyKey: 'repeat-1', contractId: contract.id, teamId: contract.teamId, dimensions: { teamId: contract.teamId, contractId: contract.id } })
    const first = processContractEconomicEvent(world, event, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' } })
    const second = processContractEconomicEvent(first.world, { ...event, id: 'event:contract:repeat:retry' }, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' } })
    expect(second.status).toBe('alreadyProcessed')
    const payment = settlePayable(first.world, first.payable!.id, { settlementId: `settlement:${first.payable!.id}`, transactionId: `transaction:settlement:${first.payable!.id}`, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, settledOn: first.world.currentDate, cashAccountId: 'cash:eur', offsetAccountId: 'payable:eur' })
    const settled = updateGameWorld(first.world, { financialTransactions: [...Object.values(first.world.financialTransactionsById), payment.transaction], treasuryApplications: [payment.settlement] })
    expect(getRecognizedExpense(settled, event.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
    expect(getCashBalancesByCurrency(settled, event.organizationId, event.effectiveOn)[0]).toMatchObject({ totalCashMinorUnits: -100_000 })
  })

  it('rejects a conflicting replay instead of changing an existing financial consequence', () => {
    const { world, contract } = contractWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:contract:conflict', eventType: 'CONTRACT_EXPENSE_DUE', sourceAuthority: 'CONTRACT', sourceEntityId: contract.id, organizationId: world.teams[contract.teamId]!.organizationId, effectiveOn: world.currentDate, dueOn: world.currentDate, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, provenance: { kind: 'CONTRACT_AUTHORIZED_EVENT', id: 'contract-conflict-1' }, idempotencyKey: 'conflict-1', contractId: contract.id, teamId: contract.teamId })
    const first = processContractEconomicEvent(world, event, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' } })
    const conflicting = processContractEconomicEvent(first.world, { ...event, amount: { currencyCode: event.amount.currencyCode, minorUnits: 200_000 } }, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' } })
    expect(conflicting.status).toBe('rejected')
    expect(conflicting.error).toContain('idempotency key conflicts')
    expect(Object.keys(conflicting.world.expenseRecognitionsById)).toHaveLength(1)
  })

  it('rejects invalid Contract references, Organization crossings and bad ledger mappings without partial state', () => {
    const { world, contract } = contractWorld()
    const invalid = createAuthorizedEconomicEvent({ id: 'event:contract:invalid', eventType: 'CONTRACT_EXPENSE_DUE', sourceAuthority: 'CONTRACT', sourceEntityId: 'contract:missing', organizationId: 'team-home', effectiveOn: world.currentDate, dueOn: world.currentDate, amount: { currencyCode: 'EUR', minorUnits: 1 }, provenance: { kind: 'TEST', id: 'invalid-contract' }, idempotencyKey: 'invalid-contract' })
    expect(processContractEconomicEvent(world, invalid, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' } }).status).toBe('rejected')
    const crossing = createAuthorizedEconomicEvent({ id: 'event:contract:crossing', eventType: 'CONTRACT_EXPENSE_DUE', sourceAuthority: 'CONTRACT', sourceEntityId: contract.id, organizationId: 'team-away', effectiveOn: world.currentDate, dueOn: world.currentDate, amount: { currencyCode: 'EUR', minorUnits: 1 }, provenance: { kind: 'TEST', id: 'crossing-contract' }, idempotencyKey: 'crossing-contract', contractId: contract.id, teamId: contract.teamId })
    expect(processContractEconomicEvent(world, crossing, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'revenue:eur' } }).status).toBe('rejected')
    const badLedger = createAuthorizedEconomicEvent({ id: 'event:contract:atomic', eventType: 'CONTRACT_EXPENSE_DUE', sourceAuthority: 'CONTRACT', sourceEntityId: contract.id, organizationId: world.teams[contract.teamId]!.organizationId, effectiveOn: world.currentDate, dueOn: world.currentDate, amount: { currencyCode: 'EUR', minorUnits: 1 }, provenance: { kind: 'TEST', id: 'atomic-contract' }, idempotencyKey: 'atomic-contract', contractId: contract.id, teamId: contract.teamId })
    const rejected = processContractEconomicEvent(world, badLedger, { ledger: { offsetAccountId: 'payable:eur', resultAccountId: 'revenue:eur' } })
    expect(rejected.status).toBe('rejected')
    expect(rejected.world).toBe(world)
    expect(Object.keys(rejected.world.expenseRecognitionsById)).toHaveLength(0)
  })

  it('supports commitment-only Contract events without inventing payroll schedules', () => {
    const { world, contract } = contractWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:contract:commitment', eventType: 'CONTRACT_COMMITMENT_OPENED', sourceAuthority: 'CONTRACT', sourceEntityId: contract.id, organizationId: world.teams[contract.teamId]!.organizationId, effectiveOn: world.currentDate, dueOn: '2033-10-01', amount: { currencyCode: 'EUR', minorUnits: 3_000_000 }, provenance: { kind: 'CONTRACT_AUTHORIZED_EVENT', id: 'contract-commitment-1' }, idempotencyKey: 'commitment-1', contractId: contract.id, teamId: contract.teamId })
    const result = processContractEconomicEvent(world, event)
    expect(result.status).toBe('accepted')
    expect(result.commitment).toBeDefined()
    expect(result.recognition).toBeUndefined()
  })

  it('processes Competition entitlement into revenue, receivable and cash settlement exactly once', () => {
    let world = competitionWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:competition:prize', eventType: 'COMPETITION_ENTITLEMENT', sourceAuthority: 'COMPETITION', sourceEntityId: 'competition-a', organizationId: 'team-home', effectiveOn: '2032-10-01', dueOn: '2032-10-31', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, provenance: { kind: 'COMPETITION_AUTHORIZED_EVENT', id: 'competition-prize-1' }, idempotencyKey: 'ACB_PRIZE_2027_TEAM_X', competitionId: 'competition-a', teamId: 'team-home', counterparty: { kind: 'EXTERNAL', label: 'Competition' } })
    const first = processCompetitionEconomicEvent(world, event, { ledger: { offsetAccountId: 'receivable:eur', resultAccountId: 'revenue:eur' } })
    expect(first.status).toBe('accepted')
    const retry = processCompetitionEconomicEvent(first.world, { ...event, id: 'event:competition:retry' }, { ledger: { offsetAccountId: 'receivable:eur', resultAccountId: 'revenue:eur' } })
    expect(retry.status).toBe('alreadyProcessed')
    expect(getRecognizedRevenue(first.world, 'team-home')).toEqual([{ currencyCode: 'EUR', minorUnits: 500_000 }])
    const collection = settleReceivable(first.world, first.receivable!.id, { settlementId: `settlement:${first.receivable!.id}`, transactionId: `transaction:settlement:${first.receivable!.id}`, amount: { currencyCode: 'EUR', minorUnits: 500_000 }, settledOn: '2032-10-31', cashAccountId: 'cash:eur', offsetAccountId: 'receivable:eur' })
    world = updateGameWorld(first.world, { financialTransactions: [...Object.values(first.world.financialTransactionsById), collection.transaction], treasuryApplications: [collection.settlement] })
    expect(getRecognizedRevenue(world, 'team-home')).toEqual([{ currencyCode: 'EUR', minorUnits: 500_000 }])
    expect(getCashBalancesByCurrency(world, 'team-home', '2032-10-31')[0]).toMatchObject({ totalCashMinorUnits: 500_000 })
  })

  it('rejects Competition events outside the Competition authority boundary', () => {
    const world = competitionWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:competition:invalid', eventType: 'COMPETITION_ENTITLEMENT', sourceAuthority: 'COMPETITION', sourceEntityId: 'competition:missing', organizationId: 'team-home', effectiveOn: '2032-10-01', dueOn: '2032-10-31', amount: { currencyCode: 'EUR', minorUnits: 1 }, provenance: { kind: 'TEST', id: 'missing-competition' }, idempotencyKey: 'missing-competition', competitionId: 'competition:missing', teamId: 'team-home' })
    const result = processCompetitionEconomicEvent(world, event, { ledger: { offsetAccountId: 'receivable:eur', resultAccountId: 'revenue:eur' } })
    expect(result.status).toBe('rejected')
    expect(result.world).toBe(world)
  })

  it('rejects a Competition source entity that does not match its Competition dimension', () => {
    const world = competitionWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:competition:mismatch', eventType: 'COMPETITION_ENTITLEMENT', sourceAuthority: 'COMPETITION', sourceEntityId: 'competition:other', organizationId: 'team-home', effectiveOn: '2032-10-01', dueOn: '2032-10-31', amount: { currencyCode: 'EUR', minorUnits: 1 }, provenance: { kind: 'TEST', id: 'mismatch-competition' }, idempotencyKey: 'mismatch-competition', competitionId: 'competition-a', teamId: 'team-home' })
    expect(processCompetitionEconomicEvent(world, event, { ledger: { offsetAccountId: 'receivable:eur', resultAccountId: 'revenue:eur' } }).status).toBe('rejected')
  })

  it('records owner funding as equity/cash and never as revenue or operating result', () => {
    const world = competitionWorld()
    const event = createAuthorizedEconomicEvent({ id: 'event:owner:funding', eventType: 'OWNER_FUNDING', sourceAuthority: 'OWNERSHIP', sourceEntityId: 'owner:1', organizationId: 'team-home', effectiveOn: '2032-10-01', amount: { currencyCode: 'EUR', minorUnits: 2_000_000 }, provenance: { kind: 'OWNERSHIP_AUTHORIZED_EVENT', id: 'funding-1' }, idempotencyKey: 'owner-funding-1' })
    const result = processOwnerFundingEconomicEvent(world, event, { ledger: { cashAccountId: 'cash:eur', offsetAccountId: 'equity:eur' } })
    expect(result.status).toBe('accepted')
    expect(getRecognizedRevenue(result.world, 'team-home')).toEqual([])
    expect(getNetOperatingResult(result.world, 'team-home')).toEqual([])
    expect(result.transaction?.transactionType).toBe('OWNER_FUNDING_RECEIPT')
    expect(processOwnerFundingEconomicEvent(result.world, { ...event, id: 'event:owner:retry' }, { ledger: { cashAccountId: 'cash:eur', offsetAccountId: 'equity:eur' } }).status).toBe('alreadyProcessed')
  })

  it('reconciles recognition provenance and rejects an orphan receivable', () => {
    const world = competitionWorld()
    const orphan = createReceivable({ id: 'receivable:orphan', organizationId: 'team-home', amount: { currencyCode: 'EUR', minorUnits: 1 }, counterparty: { kind: 'EXTERNAL', label: 'Competition' }, recognizedOn: '2032-10-01', dueOn: '2032-10-31', provenance: { kind: 'REVENUE_RECOGNITION', id: 'revenue:missing' } })
    expect(() => createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts('team-home'), receivables: [orphan] })).toThrow('matching revenue recognition')
  })
})
