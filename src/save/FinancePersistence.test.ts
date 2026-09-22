import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createFinancialAccount, createFinancialTransaction, createFiscalPeriod, createOrganizationFinancialProfile } from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('CF1 finance persistence', () => {
  it('round-trips the complete finance surface through Save V4', () => {
    const base = createNewGame()
    const organizationId = Object.values(base.organizationsById)[0]!.id
    const accounts = [
      createFinancialAccount({ id: 'finance:cash', organizationId, accountType: 'CASH', currencyCode: 'EUR' }),
      createFinancialAccount({ id: 'finance:equity', organizationId, accountType: 'EQUITY', currencyCode: 'EUR' }),
    ]
    const financeTransaction = createFinancialTransaction({ id: 'finance:opening', organizationId, effectiveOn: base.currentDate, transactionType: 'OPENING_BALANCE', amount: { currencyCode: 'EUR', minorUnits: 10000 }, postings: [{ accountId: accounts[0]!.id, direction: 'DEBIT', amount: { currencyCode: 'EUR', minorUnits: 10000 } }, { accountId: accounts[1]!.id, direction: 'CREDIT', amount: { currencyCode: 'EUR', minorUnits: 10000 } }], provenance: { kind: 'MIGRATION', id: 'cf1-test' } })
    const world = updateGameWorld(base, { financialAccounts: accounts, financialTransactions: [financeTransaction], fiscalPeriods: [createFiscalPeriod({ id: 'finance:period:2032', organizationId, label: '2032', startsOn: '2032-01-01', endsOn: '2032-12-31' })], organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' })] })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))
    expect(restored.financialAccountsById).toEqual(world.financialAccountsById)
    expect(restored.financialTransactionsById).toEqual(world.financialTransactionsById)
    expect(restored.fiscalPeriodsById).toEqual(world.fiscalPeriodsById)
    expect(restored.organizationFinancialProfilesById).toEqual(world.organizationFinancialProfilesById)
  })

  it('loads a pre-CF1 Save V4 payload with empty finance collections', () => {
    const current = serializeGameWorldV4(createNewGame(), savedAt)
    const { financialAccounts: _accounts, financialTransactions: _transactions, fiscalPeriods: _periods, organizationFinancialProfiles: _profiles, ...legacyPayload } = current.payload
    const restored = deserializeGameWorldV4({ ...current, payload: legacyPayload })
    expect(restored.financialAccountsById).toEqual({})
    expect(restored.financialTransactionsById).toEqual({})
    expect(restored.fiscalPeriodsById).toEqual({})
    expect(restored.organizationFinancialProfilesById).toEqual({})
  })
})
