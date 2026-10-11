import { expect, it } from 'vitest'
import { createFinancialReservation } from '@/domain/finance'
import { createGameWorld, getWorldValidationReport, withSingleWorldValidation } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'

for (const validationMode of ['full', 'incremental'] as const) it(`validates reservation facts and rolls back invalid publication in ${validationMode} mode`, () => {
  const reservation = createFinancialReservation({ id: 'reservation:integration', organizationId: 'team-home', currency: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 100 }, sourceAuthority: 'FACILITY', sourceEntityId: 'facility:integration', createdOn: '2032-10-01', status: 'OPEN' })
  const initial = createGameWorld({ ...createValidGameWorldInput(), financialReservations: [reservation] })
  const valid = withSingleWorldValidation(initial, world => ({ ...world, financialReservationsById: { [reservation.id]: { ...reservation, status: 'RELEASED' } } }), { validationMode })
  expect(getWorldValidationReport(valid)?.dirtyCollections).toContain('financialReservationsById')
  expect(getWorldValidationReport(valid)?.blocks['boundary:validateFinancialReservations']?.reused).toBe(false)
  expect(() => withSingleWorldValidation(valid, world => ({ ...world, financialReservationsById: { [reservation.id]: { ...reservation, amount: { currencyCode: reservation.currency, minorUnits: -1 } } } }), { validationMode })).toThrow()
  expect(initial.financialReservationsById[reservation.id]?.status).toBe('OPEN')
  expect(valid.financialReservationsById[reservation.id]?.status).toBe('RELEASED')
  expect(valid.financialReservationsById[reservation.id]?.amount.minorUnits).toBe(100)
})
