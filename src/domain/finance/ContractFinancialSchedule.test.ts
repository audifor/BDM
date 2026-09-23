import { describe, expect, it } from 'vitest'
import { createPlayerContract } from '@/domain/contract'
import { createGameDate } from '@/domain/date'
import { contractIdFromString, seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createStaffContract, staffContractIdFromString } from '@/domain/staffContract'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { calculateTeamPayroll } from '@/engine/salary'
import { createFinancialAccount } from './FinancialLedger'
import {
  getConditionalPayrollExposure,
  getContractFinancialSchedule,
  getContractualPayrollBySeason,
  getContractualPayrollCommitted,
  getCurrentSeasonContractualCost,
  getFutureContractCommitmentsByContract,
  getNextSeasonCommittedCost,
  getPaidCompensation,
  getPayrollBySection,
  getPayrollByTeam,
  getPayrollRecognizedYtd,
  getPlayerPayrollCommitted,
  getStaffPayrollCommitted,
  getUnpaidRecognizedCompensation,
  materializeContractFinanceForDate,
} from './ContractFinancialSchedule'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { getRecognizedExpense } from './RecognitionQueries'
import { settlePayable } from './Treasury'

function scheduleWorld() {
  const input = createValidGameWorldInput()
  const team = input.teams![0]!
  const player = input.players![0]!
  const staff = input.staffPeople![0]!
  const seasonB = createSeason({ id: seasonIdFromString('season-b'), competitionId: input.competitions![0]!.id, label: '2033-34', startDate: createGameDate(2033, 10, 1), endDate: createGameDate(2034, 5, 31) })
  const seasonC = createSeason({ id: seasonIdFromString('season-c'), competitionId: input.competitions![0]!.id, label: '2034-35', startDate: createGameDate(2034, 10, 1), endDate: createGameDate(2035, 5, 31) })
  const playerContract = createPlayerContract({ id: contractIdFromString('contract:cf5:player'), playerId: player.id, teamId: team.id, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2035-10-01' as never }, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 900_000, guaranteedAmount: 1_000_000 }, { cashSalary: 1_200_000, capHit: 1_100_000, guaranteedAmount: 1_200_000 }, { cashSalary: 1_500_000, capHit: 1_400_000, guaranteedAmount: 1_500_000 }] } })
  const staffContract = createStaffContract({ id: staffContractIdFromString('staff-contract:cf5:coach'), staffId: staff.id, teamId: team.id, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2035-10-01' as never }, compensation: { annualSalary: 500_000 } })
  const accounts = [
    createFinancialAccount({ id: 'cash:cf5', organizationId: team.organizationId, accountType: 'CASH', currencyCode: 'EUR' }),
    createFinancialAccount({ id: 'payable:cf5', organizationId: team.organizationId, accountType: 'PAYABLE', currencyCode: 'EUR' }),
    createFinancialAccount({ id: 'expense:cf5', organizationId: team.organizationId, accountType: 'EXPENSE', currencyCode: 'EUR' }),
  ]
  return createGameWorld({ ...input, seasons: [...input.seasons!, seasonB, seasonC], currentSeasonId: input.seasons![0]!.id, contracts: [playerContract], staffContracts: [staffContract], financialAccounts: accounts })
}

describe('CF5 contract financial scheduling', () => {
  it('audits the canonical contract terms into deterministic annual entries', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const entries = getContractFinancialSchedule(world, { organizationId: team.organizationId, currencyCode: 'EUR' })
    expect(entries).toHaveLength(6)
    expect(entries.filter((entry) => entry.category === 'PLAYER_SALARY').map((entry) => entry.amount.minorUnits)).toEqual([1_000_000, 1_200_000, 1_500_000])
    expect(entries.filter((entry) => entry.category === 'STAFF_SALARY').map((entry) => entry.amount.minorUnits)).toEqual([500_000, 500_000, 500_000])
    expect(entries.every((entry) => entry.dueOn === null && Object.isFrozen(entry))).toBe(true)
  })

  it('keeps the three-year contract split between current and future seasons', () => {
    const world = scheduleWorld()
    const organizationId = Object.values(world.teams)[0]!.organizationId
    expect(getCurrentSeasonContractualCost(world, organizationId, { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 1_500_000 }])
    expect(getContractualPayrollBySeason(world, organizationId, 'season-b', { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 1_700_000 }])
    expect(getNextSeasonCommittedCost(world, organizationId, { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 1_700_000 }])
    expect(getContractualPayrollCommitted(world, organizationId, '2032-10-01', { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 5_200_000 }])
  })

  it('separates player and staff payroll and preserves Team/Section dimensions', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    expect(getPlayerPayrollCommitted(world, team.organizationId, '2032-10-01', { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 3_700_000 }])
    expect(getStaffPayrollCommitted(world, team.organizationId, '2032-10-01', { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 1_500_000 }])
    expect(getPayrollByTeam(world, team.organizationId, team.id, '2032-10-01', { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 5_200_000 }])
    expect(getPayrollBySection(world, team.organizationId, team.organizationSectionId, '2032-10-01', { currencyCode: 'EUR' })).toEqual([{ currencyCode: 'EUR', minorUnits: 5_200_000 }])
  })

  it('does not invent a currency when the Organization has no financial profile', () => {
    const world = scheduleWorld()
    const organizationId = Object.values(world.teams)[0]!.organizationId
    expect(() => getContractFinancialSchedule(world, { organizationId })).toThrow('requires currencyCode')
    expect(getContractualPayrollCommitted(world, organizationId, '2032-10-01', { currencyCode: 'USD' })).toEqual([{ currencyCode: 'USD', minorUnits: 5_200_000 }])
  })

  it('represents a partially guaranteed player year as guaranteed plus conditional exposure', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const player = Object.values(world.players)[0]!
    const conditional = createPlayerContract({ id: contractIdFromString('contract:cf5:conditional'), playerId: player.id, teamId: team.id, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2033-10-01' as never }, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 600_000 }] } })
    const withConditional = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), conditional] })
    const entries = getContractFinancialSchedule(withConditional, { organizationId: team.organizationId, contractId: conditional.id, currencyCode: 'EUR', includeConditional: true })
    expect(entries.map((entry) => [entry.compensationStatus, entry.amount.minorUnits])).toEqual([['CONDITIONAL', 400_000], ['GUARANTEED', 600_000]])
    expect(getConditionalPayrollExposure(withConditional, team.organizationId, '2032-10-01', { currencyCode: 'EUR' }).map((entry) => entry.amount.minorUnits)).toContain(400_000)
  })

  it('materializes player and staff salary through the CF4 adapter, not a Finance bypass', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const result = materializeContractFinanceForDate(world, '2032-10-01', { organizationId: team.organizationId, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION', ledger: { offsetAccountId: 'payable:cf5', resultAccountId: 'expense:cf5' } })
    expect(result.status).toBe('accepted')
    expect(result.results).toHaveLength(2)
    expect(result.results.every((item) => item.status === 'accepted')).toBe(true)
    expect(getRecognizedExpense(result.world, team.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 1_500_000 }])
  })

  it('keeps date materialization all-or-nothing when ledger mapping is invalid', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const result = materializeContractFinanceForDate(world, '2032-10-01', { organizationId: team.organizationId, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION', ledger: { offsetAccountId: 'payable:missing', resultAccountId: 'expense:missing' } })
    expect(result.status).toBe('rejected')
    expect(result.world).toBe(world)
    expect(Object.keys(result.world.expenseRecognitionsById)).toHaveLength(0)
    expect(Object.keys(result.world.payablesById)).toHaveLength(0)
  })

  it('is idempotent for the same date and does not change cash before settlement', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const options = { organizationId: team.organizationId, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION' as const, ledger: { offsetAccountId: 'payable:cf5', resultAccountId: 'expense:cf5' } }
    const first = materializeContractFinanceForDate(world, '2032-10-01', options)
    const second = materializeContractFinanceForDate(first.world, '2032-10-01', options)
    expect(second.status).toBe('alreadyProcessed')
    expect(getRecognizedExpense(second.world, team.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 1_500_000 }])
    expect(getCashBalancesByCurrency(second.world, team.organizationId, '2032-10-01')[0]?.totalCashMinorUnits).toBe(0)
  })

  it('keeps salary expense unchanged while settlement reduces cash and payable', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const result = materializeContractFinanceForDate(world, '2032-10-01', { organizationId: team.organizationId, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION', ledger: { offsetAccountId: 'payable:cf5', resultAccountId: 'expense:cf5' } })
    const payable = Object.values(result.world.payablesById).find((item) => item.amount.minorUnits === 500_000)!
    const settlement = settlePayable(result.world, payable.id, { settlementId: 'settlement:cf5:payroll', transactionId: 'financial:cf5:payroll-settlement', amount: payable.amount, settledOn: '2032-10-02', cashAccountId: 'cash:cf5', offsetAccountId: 'payable:cf5' })
    const settled = updateGameWorld(result.world, { financialTransactions: [...Object.values(result.world.financialTransactionsById), settlement.transaction], treasuryApplications: [...Object.values(result.world.treasuryApplicationsById), settlement.settlement] })
    expect(getRecognizedExpense(settled, team.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 1_500_000 }])
    expect(getCashBalancesByCurrency(settled, team.organizationId, '2032-10-02')[0]?.totalCashMinorUnits).toBe(-500_000)
    expect(getPaidCompensation(settled, team.organizationId, '2032-10-02')).toHaveLength(1)
    expect(getUnpaidRecognizedCompensation(settled, team.organizationId, '2032-10-02')).toHaveLength(1)
  })

  it('does not materialize conditional compensation as an expense', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const player = Object.values(world.players)[0]!
    const conditional = createPlayerContract({ id: contractIdFromString('contract:cf5:only-conditional'), playerId: player.id, teamId: team.id, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2033-10-01' as never }, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 0 }] } })
    const withConditional = updateGameWorld(world, { contracts: [...Object.values(world.contractsById), conditional] })
    const result = materializeContractFinanceForDate(withConditional, '2032-10-01', { contractId: conditional.id, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION', ledger: { offsetAccountId: 'payable:cf5', resultAccountId: 'expense:cf5' } })
    expect(result.results).toHaveLength(0)
    expect(Object.keys(result.world.expenseRecognitionsById)).toHaveLength(0)
  })

  it('removes only future schedule entries after a valid termination and preserves history', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const contract = Object.values(world.contractsById)[0]!
    const materialized = materializeContractFinanceForDate(world, '2032-10-01', { contractId: contract.id, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION', ledger: { offsetAccountId: 'payable:cf5', resultAccountId: 'expense:cf5' } })
    const terminated = createPlayerContract({ ...contract, termination: { terminatedOn: '2033-10-01' as never, reason: 'released' } })
    const changed = updateGameWorld(materialized.world, { contracts: [terminated] })
    const future = getFutureContractCommitmentsByContract(changed, team.organizationId, '2033-10-01', contract.id, { currencyCode: 'EUR' })
    expect(future).toHaveLength(0)
    expect(getRecognizedExpense(changed, team.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 1_000_000 }])
  })

  it('keeps financial payroll separate from Salary Cap calculations', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const contract = Object.values(world.contractsById)[0]!
    const before = calculateTeamPayroll([contract], world.currentDate)
    const materialized = materializeContractFinanceForDate(world, '2032-10-01', { contractId: contract.id, currencyCode: 'EUR', dueDatePolicy: 'ON_RECOGNITION', ledger: { offsetAccountId: 'payable:cf5', resultAccountId: 'expense:cf5' } })
    const after = calculateTeamPayroll([contract], materialized.world.currentDate)
    expect(after).toEqual(before)
    expect(getRecognizedExpense(materialized.world, team.organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 1_000_000 }])
  })

  it('supports future lookup by contract and keeps currencies separate without FX', () => {
    const world = scheduleWorld()
    const team = Object.values(world.teams)[0]!
    const contract = Object.values(world.contractsById)[0]!
    expect(getFutureContractCommitmentsByContract(world, team.organizationId, '2032-10-01', contract.id, { currencyCode: 'USD' }).map((entry) => entry.amount.currencyCode)).toEqual(['USD', 'USD'])
  })
})
