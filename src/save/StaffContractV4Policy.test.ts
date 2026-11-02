import { beforeAll, describe, expect, it } from 'vitest'
import { reassignStaffWithinTeam } from '@/app/staffCareer'
import { addYears, parseGameDate } from '@/domain/date'
import { getTrialBalanceAsOfDate, provisionOrganizationFinanceFoundation } from '@/domain/finance'
import { staffPersonIdFromString } from '@/domain/ids'
import { createStaffContract, isStaffContractActiveOn, staffContractIdFromString } from '@/domain/staffContract'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { advanceDayWithTrace } from '@/engine/calendar'
import { advanceClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2026-10-10T00:00:00.000Z'
const due = parseGameDate('2032-10-02')
const expiredOn = parseGameDate('2034-10-02')
let base: GameWorld
let contract: ReturnType<typeof createStaffContract>
const save = (world: GameWorld) => serializeGameWorldV4(world, savedAt)
const load = (world: GameWorld) => deserializeGameWorldV4(save(world))
const economicFacts = (world: GameWorld) => ({ transactions: world.financialTransactionsById, expenses: world.expenseRecognitionsById, commitments: world.financialCommitmentsById, payables: world.payablesById, treasury: world.treasuryApplicationsById })
beforeAll(() => {
  const input = createValidGameWorldInput()
  const world = provisionOrganizationFinanceFoundation(createGameWorld(input), input.teams![0]!.organizationId, { currencyCode: 'EUR' })
  // Complete neutral Staff identity/history compatibility before comparing contract facts.
  base = load(world)
  contract = createStaffContract({ id: staffContractIdFromString('staff-contract:v4-01:legitimate'), staffId: input.staffPeople![0]!.id, teamId: input.teams![0]!.id, kind: 'standard', term: { startsOn: due, expiresOn: expiredOn }, compensation: { annualSalary: 65_000 } })
})

describe('STAFF-CONTRACT V4-01: no synthetic renewal on current V4 load', () => {
  it('A: preserves a legitimate contract on load and recognizes exact payroll only when Calendar reaches its date', () => {
    const authored = updateGameWorld(base, { staffContracts: [contract] })
    const loaded = load(authored)
    expect(loaded.staffContractsById).toEqual(authored.staffContractsById)
    expect(economicFacts(loaded)).toEqual(economicFacts(authored))
    const day = advanceDayWithTrace(loaded)
    expect(day.failure).toBeUndefined()
    expect(day.world.currentDate).toBe(due)
    expect(day.phases.filter(phase => phase.phaseId === 'CLUB_FINANCE_V2')).toHaveLength(1)
    const expenses = Object.values(day.world.expenseRecognitionsById)
    expect(expenses).toHaveLength(1)
    expect(expenses[0]).toMatchObject({ amount: { currencyCode: 'EUR', minorUnits: 6_500_000 }, recognizedOn: due })
    expect(String(expenses[0]!.provenance.id)).toContain(contract.id)
    expect(Object.keys(day.world.financialCommitmentsById)).toHaveLength(1)
    expect(Object.keys(day.world.payablesById)).toHaveLength(1)
    const trial = getTrialBalanceAsOfDate(day.world, due)
    expect(trial.reduce((sum, row) => sum + row.debitMinorUnits, 0)).toBe(6_500_000)
    expect(trial.reduce((sum, row) => sum + row.creditMinorUnits, 0)).toBe(6_500_000)
    expect(economicFacts(load(day.world))).toEqual(economicFacts(day.world))
    expect(advanceClubFinanceForDate(day.world, due)).toBe(day.world)
  })

  it('B: preserves expired terms and previously recognized obligations without replacing the contract', () => {
    const paid = advanceClubFinanceForDate(updateGameWorld(base, { currentDate: due, staffContracts: [contract] }), due)
    const expired = updateGameWorld(paid, { currentDate: expiredOn })
    const loaded = load(expired)
    expect(loaded.staffContractsById).toEqual(expired.staffContractsById)
    expect(isStaffContractActiveOn(loaded.staffContractsById[contract.id]!, expiredOn)).toBe(false)
    expect(economicFacts(loaded)).toEqual(economicFacts(paid))
    const processed = advanceClubFinanceForDate(loaded, expiredOn)
    // The expired fiscal year now closes its existing result; that ledger entry
    // is not a new contract, salary, payment, or revision of previous facts.
    expect(processed.expenseRecognitionsById).toEqual(paid.expenseRecognitionsById)
    expect(processed.financialCommitmentsById).toEqual(paid.financialCommitmentsById)
    expect(processed.payablesById).toEqual(paid.payablesById)
    expect(processed.treasuryApplicationsById).toEqual(paid.treasuryApplicationsById)
    for (const transaction of Object.values(paid.financialTransactionsById)) expect(processed.financialTransactionsById[transaction.id]).toEqual(transaction)
    const added = Object.values(processed.financialTransactionsById).filter(transaction => paid.financialTransactionsById[transaction.id] === undefined)
    expect(added.map(transaction => transaction.transactionType)).toEqual(['FISCAL_PERIOD_CLOSING'])
    expect(processed.staffContractsById).toEqual(expired.staffContractsById)
    expect(processed.staffEmploymentByStaffId).toEqual(expired.staffEmploymentByStaffId)
  })

  it('C: retains legitimate employed Staff without a salary contract and creates no payroll from that absence', () => {
    expect(Object.values(base.staffEmploymentByStaffId).some(item => item.status === 'employed')).toBe(true)
    expect(base.staffContractsById).toEqual({})
    const loaded = load(base)
    expect(loaded.staffContractsById).toEqual({})
    expect(economicFacts(loaded)).toEqual(economicFacts(base))
    const day = advanceDayWithTrace(loaded)
    expect(day.failure).toBeUndefined()
    expect(day.world.staffContractsById).toEqual({})
    expect(economicFacts(day.world)).toEqual(economicFacts(base))
  })

  it('D: an explicit Staff reassignment with new salary creates the contractual source before Finance recognizes it', () => {
    const original = advanceClubFinanceForDate(updateGameWorld(base, { currentDate: due, staffContracts: [contract] }), due)
    const renewed = reassignStaffWithinTeam(original, { staffId: contract.staffId, newRoleId: 'headCoach', newAnnualSalary: 70_000 })
    const active = Object.values(renewed.staffContractsById).filter(item => isStaffContractActiveOn(item, due))
    expect(active).toHaveLength(1)
    expect(active[0]!.id).not.toBe(contract.id)
    expect(active[0]).toMatchObject({ term: { startsOn: due, expiresOn: addYears(due, 2) }, compensation: { annualSalary: 70_000 } })
    expect(renewed.staffContractsById[contract.id]?.termination).toMatchObject({ effectiveOn: due, reason: 'resigned' })
    expect(renewed.staffCareerHistoryByStaffId[contract.staffId]?.at(-1)?.reason).toBe('reassigned')
    expect(economicFacts(renewed)).toEqual(economicFacts(original))
    const loaded = load(renewed)
    expect(loaded.staffContractsById).toEqual(renewed.staffContractsById)
    const processed = advanceClubFinanceForDate(loaded, due)
    const added = Object.values(processed.expenseRecognitionsById).filter(item => original.expenseRecognitionsById[item.id] === undefined)
    expect(added).toHaveLength(1)
    expect(added[0]?.amount.minorUnits).toBe(7_000_000)
    expect(String(added[0]?.provenance.id)).toContain(active[0]!.id)
    expect(advanceClubFinanceForDate(load(processed), due).expenseRecognitionsById).toEqual(processed.expenseRecognitionsById)
  })

  it('E: authorized legacy V3 migration repairs Staff once and the resulting V4 never repeats the repair', () => {
    const legacy = serializeGameWorldV3(base, savedAt)
    const migrated = migrateGameWorldSaveV3ToV4(legacy)
    expect(migrated.payload.staffCareerRuntime.staffContracts).toHaveLength(1)
    const first = deserializeGameWorldV4(migrated)
    const second = load(first)
    expect(second.staffContractsById).toEqual(first.staffContractsById)
    expect(economicFacts(second)).toEqual(economicFacts(first))
    const expired = updateGameWorld(first, { currentDate: parseGameDate('2042-10-01') })
    expect(load(expired).staffContractsById).toEqual(first.staffContractsById)
  })

  it.each(['valid', 'expired', 'missing'] as const)('F: double current-V4 loading preserves %s contracts, identities and economic facts', status => {
    const world = status === 'missing' ? base : updateGameWorld(base, { currentDate: status === 'expired' ? expiredOn : due, staffContracts: [contract] })
    const twice = load(load(world))
    expect(twice.staffContractsById).toEqual(world.staffContractsById)
    expect(twice.staffEmploymentByStaffId).toEqual(world.staffEmploymentByStaffId)
    expect(twice.staffCareerHistoryByStaffId).toEqual(world.staffCareerHistoryByStaffId)
    expect(twice.personsById).toEqual(world.personsById)
    expect(economicFacts(twice)).toEqual(economicFacts(world))
  })

  it('rejects an invalid persisted Staff reference instead of repairing it into a contract', () => {
    const world = updateGameWorld(base, { staffContracts: [contract] })
    const envelope = save(world)
    const invalid = { ...contract, staffId: staffPersonIdFromString('v4-01:unknown-staff') }
    expect(() => deserializeGameWorldV4({ ...envelope, payload: { ...envelope.payload, staffCareerRuntime: { ...envelope.payload.staffCareerRuntime, staffContracts: [invalid] } } })).toThrow(/Staff/)
  })
})
