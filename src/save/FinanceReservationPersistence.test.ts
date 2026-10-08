import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import {
  consumeFinancialReservation,
  createFinancialReservation,
  createOrganizationFinancialProfile,
  releaseFinancialReservation,
  reserveFinancialCommitment,
  sumReservedCapacity,
  type FinancialReservation,
  type FinancialReservationStatus,
} from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'
const organizationId = 'team-home'
const profile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' })

function reservation(overrides: Partial<FinancialReservation> = {}): FinancialReservation {
  return createFinancialReservation({
    id: overrides.id ?? 'reservation:probe',
    organizationId: overrides.organizationId ?? organizationId,
    currency: overrides.currency ?? 'EUR',
    amount: overrides.amount ?? { currencyCode: 'EUR', minorUnits: 60_000 },
    sourceAuthority: overrides.sourceAuthority ?? 'FACILITY',
    sourceEntityId: overrides.sourceEntityId ?? 'facility:1',
    createdOn: overrides.createdOn ?? '2032-10-01',
    status: overrides.status ?? 'OPEN',
  })
}

function worldWithReservations(reservations: readonly FinancialReservation[]) {
  return createGameWorld({ ...createValidGameWorldInput(), organizationFinancialProfiles: [profile], financialReservations: reservations })
}

function roundTrip(reservations: readonly FinancialReservation[]) {
  const world = worldWithReservations(reservations)
  return { world, restored: deserializeGameWorldV4(serializeGameWorldV4(world, savedAt)) }
}

function reservedIn(world: { readonly financialReservationsById: Readonly<Record<string, FinancialReservation>> }) {
  return sumReservedCapacity(Object.values(world.financialReservationsById), organizationId, 'EUR')
}

describe('BS16C reservation persistence', () => {
  it('round-trips an OPEN reservation with its full authority and capacity effect', () => {
    const open = reservation()
    const { world, restored } = roundTrip([open])

    expect(restored.financialReservationsById).toEqual(world.financialReservationsById)
    const restoredReservation = Object.values(restored.financialReservationsById)[0]!
    expect(restoredReservation.id).toBe(open.id)
    expect(restoredReservation.status).toBe('OPEN')
    expect(restoredReservation.amount).toEqual(open.amount)
    expect(restoredReservation.currency).toBe('EUR')
    expect(restoredReservation.sourceAuthority).toBe('FACILITY')
    expect(restoredReservation.sourceEntityId).toBe('facility:1')
    expect(restoredReservation.createdOn).toBe('2032-10-01')
    expect(reservedIn(restored).minorUnits).toBe(60_000)
  })

  it('keeps a RELEASED reservation released and non-consuming after load', () => {
    const { restored } = roundTrip([releaseFinancialReservation(reservation())])

    expect(Object.values(restored.financialReservationsById)[0]?.status).toBe('RELEASED')
    expect(reservedIn(restored).minorUnits).toBe(0)
  })

  it('keeps a CONSUMED reservation consumed and non-restorable after load', () => {
    const consumed = consumeFinancialReservation(reservation())
    const { restored } = roundTrip([consumed])

    const restoredReservation = Object.values(restored.financialReservationsById)[0]!
    expect(restoredReservation).toEqual(consumed)
    expect(restoredReservation.status).toBe('CONSUMED')
    expect(reservedIn(restored).minorUnits).toBe(0)
    expect(consumeFinancialReservation(restoredReservation)).toEqual(restoredReservation)
    expect(releaseFinancialReservation(restoredReservation)).toEqual(restoredReservation)
  })

  it('replays the original reservation request after load without duplicating capacity', () => {
    const created = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: { currencyCode: 'EUR', minorUnits: 60_000 },
      currentCash: { currencyCode: 'EUR', minorUnits: 100_000 },
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:1',
      createdOn: '2032-10-01',
    })
    const { restored } = roundTrip(created.reservations)

    const replay = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: { currencyCode: 'EUR', minorUnits: 60_000 },
      currentCash: { currencyCode: 'EUR', minorUnits: 100_000 },
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:1',
      createdOn: '2032-10-01',
      activeReservations: Object.values(restored.financialReservationsById),
    })

    expect(created.outcome).toBe('CREATED')
    expect(replay.outcome).toBe('REPLAYED')
    expect(replay.idempotent).toBe(true)
    expect(replay.reservations).toHaveLength(1)
    expect(sumReservedCapacity(replay.reservations, organizationId, 'EUR').minorUnits).toBe(60_000)
  })

  it('loads pre-BS16C Save V4 payloads with an empty reservation collection', () => {
    const current = serializeGameWorldV4(worldWithReservations([reservation()]), savedAt)
    const { financialReservations: _reservations, ...legacyPayload } = current.payload
    const restored = deserializeGameWorldV4({ ...current, payload: legacyPayload })

    expect(restored.financialReservationsById).toEqual({})
  })

  it('persists every reservation status without persisting the derived currency duplicate', () => {
    const statuses: readonly FinancialReservationStatus[] = ['OPEN', 'CONSUMED', 'RELEASED']
    const reservations = statuses.map((status, index) => reservation({ id: `reservation:${status.toLowerCase()}`, sourceEntityId: `facility:${index}`, status }))
    const { restored } = roundTrip(reservations)

    const restoredReservations = Object.values(restored.financialReservationsById)
    expect(restoredReservations.map((item) => item.status).sort()).toEqual(['CONSUMED', 'OPEN', 'RELEASED'])
    for (const item of restoredReservations) {
      expect(Object.keys(item).sort()).toEqual(['amount', 'createdOn', 'currency', 'id', 'organizationId', 'sourceAuthority', 'sourceEntityId', 'status'])
    }
  })
})
