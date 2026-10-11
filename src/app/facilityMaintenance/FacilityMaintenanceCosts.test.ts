import { describe, expect, it, vi } from 'vitest'
import { createNewGame } from '@/app/game'
import { createFacilityCostCatalogEntry, createFacilityMaintenanceOffer, createFacilityProvider, facilityEconomyRecordsOfKind } from '@/domain/facilityEconomy'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advance, createFacilityMaintenanceScenario, must, requested } from './testFixtures'
import { buildFacilityMaintenanceNeedRows, buildFacilityMaintenanceOperationView } from './FacilityMaintenanceReadModel'
import { openFacilityMaintenanceProposal, registerFacilityEconomyRecord, selectFacilityMaintenanceOffer } from './FacilityMaintenanceCommands'

const SAVED_AT = '2033-01-01T00:00:00.000Z'
const BASE_OFFER = { id: 'o', organizationId: 'org', facilityId: 'f', needId: 'n', interventionType: 'REPAIR', classification: 'OPEX_RESTORATIVE_REPAIR', providerId: 'p', sourceKind: 'ACCREDITED_OFFER', evidence: { sourceId: 'x' }, amount: { currencyCode: 'EUR', minorUnits: 1 }, market: 'EU', issuedOn: '2032-10-01', validFrom: '2032-10-01', validUntil: '2032-10-02' } as const

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

describe('BS17E-A cost evidence', () => {
  it('ships no catalog entry, provider or offer: the shipped universe prices nothing', () => {
    const world = createNewGame()
    expect(Object.keys(world.facilityEconomyRecordsById)).toHaveLength(0)
    expect(Object.keys(world.facilityMaintenanceNeedsById)).toHaveLength(0)
    expect(Object.keys(world.governanceInstitutionsById)).toHaveLength(0)
    expect(Object.values(world.budgetLinesById).filter((line) => line.category === 'FACILITY')).toHaveLength(0)
  })

  it('reports UNKNOWN_COST for a need with no sourced offer, and never derives a price from the club budget', () => {
    const s = createFacilityMaintenanceScenario({ drawdownMinorUnits: 9_000_000_000, facilityBudgetMinorUnits: 9_000_000_000 })
    const opened = openFacilityMaintenanceProposal(s.world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
    expect(opened.status).toBe('APPLIED')
    const view = buildFacilityMaintenanceOperationView(opened.world, s.teamId, opened.operationId!)!
    expect(view.cost).toMatchObject({ status: 'UNKNOWN_COST', amountMinorUnits: null, offerId: null })
    expect(view.alerts).toContain('COST_UNKNOWN')
    expect(view.actions.find((a) => a.id === 'REQUEST_APPROVAL')).toMatchObject({ enabled: false, reason: 'COST_UNKNOWN' })
    expect(view.actions.find((a) => a.id === 'RESERVE_AND_CONTRACT')?.enabled).toBe(false)
    expect(facilityEconomyRecordsOfKind(opened.world, 'OFFER')).toHaveLength(0)
  })

  it('accepts a documented/accredited offer, keeps it immutable and refuses a changed replay', () => {
    const s = createFacilityMaintenanceScenario()
    let world = must(registerFacilityEconomyRecord(s.world, s.provider))
    world = must(registerFacilityEconomyRecord(world, s.offer))
    expect(registerFacilityEconomyRecord(world, s.offer).status).toBe('NO_CHANGE')
    const changed = createFacilityMaintenanceOffer({ ...s.offer, amount: { currencyCode: s.currencyCode, minorUnits: s.offer.amount.minorUnits + 1 } })
    const refused = registerFacilityEconomyRecord(world, changed)
    expect(refused.status).toBe('BLOCKED')
    expect(refused.canonicalReasons).toContain('ISSUED_EVIDENCE_IS_IMMUTABLE')
    expect(world.facilityEconomyRecordsById[s.offer.id]).toEqual(s.offer)
  })

  it('refuses an offer that references an unknown provider or need (the source must exist)', () => {
    const s = createFacilityMaintenanceScenario()
    expect(registerFacilityEconomyRecord(s.world, s.offer).status).toBe('BLOCKED')
    const withProvider = must(registerFacilityEconomyRecord(s.world, s.provider))
    expect(registerFacilityEconomyRecord(withProvider, createFacilityMaintenanceOffer({ ...s.offer, id: 'offer:fm:ghost', needId: 'need:does-not-exist' })).status).toBe('BLOCKED')
  })

  it('refuses a simulated offer or catalog entry without authorized calibration evidence', () => {
    expect(() => createFacilityCostCatalogEntry({ id: 'cat:1', interventionType: 'REPAIR', physicalUnit: 'COMPONENT', market: 'EU', currencyCode: 'EUR', unitAmountMinorUnits: 100, effectiveOn: '2032-10-01', sourceKind: 'SIMULATED_MODEL', sourceId: 'model', version: '1' })).toThrow(/calibration/)
    expect(() => createFacilityMaintenanceOffer({ ...BASE_OFFER, sourceKind: 'SIMULATED_MODEL' })).toThrow(/calibrated catalog entry/)
    expect(() => createFacilityMaintenanceOffer({ ...BASE_OFFER, evidence: { sourceId: 'x', catalogEntryId: 'cat:1' } })).toThrow(/simulated/)
  })

  it('accepts a simulated offer only when it points at a calibrated catalog entry of the same market, currency and intervention', () => {
    const s = createFacilityMaintenanceScenario()
    const entry = createFacilityCostCatalogEntry({ id: 'cat:fm:calibrated', interventionType: 'REPAIR', physicalUnit: 'COMPONENT', market: 'EU', currencyCode: s.currencyCode, unitAmountMinorUnits: 1_000_000, effectiveOn: s.asOf, sourceKind: 'SIMULATED_MODEL', sourceId: 'model:authorized', version: '1', calibration: { modelId: 'model:authorized', evidenceId: 'evidence:1', authorizedBy: 'authority:1' } })
    let world = must(registerFacilityEconomyRecord(s.world, entry))
    world = must(registerFacilityEconomyRecord(world, createFacilityProvider({ id: 'provider:fm:synthetic', displayName: 'Synthetic Court Works (simulated)', identityKind: 'SYNTHETIC_SIMULATED', market: 'EU', provenance: { kind: 'SIMULATION_POLICY', id: 'policy:test' }, registeredOn: s.asOf })))
    const simulated = createFacilityMaintenanceOffer({ ...s.offer, id: 'offer:fm:sim', providerId: 'provider:fm:synthetic', sourceKind: 'SIMULATED_MODEL', evidence: { sourceId: 'model:authorized', catalogEntryId: entry.id, modelVersion: '1' } })
    expect(registerFacilityEconomyRecord(world, simulated).status).toBe('APPLIED')
    expect(registerFacilityEconomyRecord(world, createFacilityMaintenanceOffer({ ...simulated, id: 'offer:fm:sim-bad', market: 'US' })).status).toBe('BLOCKED')
  })

  it('labels synthetic providers as simulated and refuses a synthetic identity that reads as a real company', () => {
    expect(() => createFacilityProvider({ id: 'p', displayName: 'Acme Courts', identityKind: 'SYNTHETIC_SIMULATED', market: 'EU', provenance: { kind: 'SIMULATION_POLICY', id: 'x' }, registeredOn: '2032-10-01' })).toThrow(/simulated/)
  })

  it('refuses unsupported classifications: capitalizable or mixed work has no OPEX classification here', () => {
    expect(() => createFacilityMaintenanceOffer({ ...BASE_OFFER, interventionType: 'ROUTINE_MAINTENANCE', classification: 'OPEX_RESTORATIVE_REPAIR' })).toThrow(/classification/)
    expect(() => createFacilityMaintenanceOffer({ ...BASE_OFFER, classification: 'CAPEX_IMPROVEMENT' as never })).toThrow()
  })

  it('refuses a wrong-currency offer at selection and an expired or not-yet-valid offer, preserving history', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const opened = openFacilityMaintenanceProposal(s.world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
    const usd = createFacilityMaintenanceOffer({ ...s.offer, id: 'offer:fm:usd', amount: { currencyCode: 'USD', minorUnits: 1_000_000 } })
    const withUsd = must(registerFacilityEconomyRecord(opened.world, usd))
    expect(selectFacilityMaintenanceOffer(withUsd, { teamId: s.teamId, operationId: opened.operationId!, offerId: usd.id }).reasons).toEqual(['OFFER_CURRENCY_MISMATCH'])
    const future = createFacilityMaintenanceOffer({ ...s.offer, id: 'offer:fm:future', issuedOn: s.asOf, validFrom: '2032-12-01', validUntil: '2032-12-31' })
    const withFuture = must(registerFacilityEconomyRecord(opened.world, future))
    expect(selectFacilityMaintenanceOffer(withFuture, { teamId: s.teamId, operationId: opened.operationId!, offerId: future.id }).reasons).toEqual(['OFFER_NOT_YET_VALID'])
    const aged = advance(s.world, 31)
    const reopened = openFacilityMaintenanceProposal(aged, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
    expect(selectFacilityMaintenanceOffer(reopened.world, { teamId: s.teamId, operationId: reopened.operationId!, offerId: s.offerId }).reasons).toEqual(['OFFER_EXPIRED'])
    expect(aged.facilityEconomyRecordsById[s.offerId]).toEqual(s.offer)
  })

  it('refuses an offer for another need or another intervention', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const opened = openFacilityMaintenanceProposal(s.world, { teamId: s.teamId, needId: s.needId, interventionType: 'ROUTINE_MAINTENANCE' })
    expect(selectFacilityMaintenanceOffer(opened.world, { teamId: s.teamId, operationId: opened.operationId!, offerId: s.offerId }).reasons).toEqual(['OFFER_SCOPE_MISMATCH'])
    expect(selectFacilityMaintenanceOffer(opened.world, { teamId: s.teamId, operationId: opened.operationId!, offerId: 'offer:nope' }).reasons).toEqual(['OFFER_NOT_FOUND'])
  })

  it('does not recalculate or mutate an issued offer across Calendar advancement and double Save reload', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const aged = advance(flow.world, 5)
    const once = deserializeGameWorldV4(serializeGameWorldV4(aged, SAVED_AT))
    const twice = deserializeGameWorldV4(serializeGameWorldV4(once, SAVED_AT))
    expect(twice.facilityEconomyRecordsById[s.offerId]).toEqual(s.offer)
    expect(twice.facilityEconomyRecordsById).toEqual(aged.facilityEconomyRecordsById)
    expect(buildFacilityMaintenanceNeedRows(twice, s.teamId).find((row) => row.needId === s.needId)!.active?.cost.amountMinorUnits).toBe(s.offer.amount.minorUnits)
  })

  it('defaults an older V4 save without economy records to an empty collection', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const saved = JSON.parse(JSON.stringify(serializeGameWorldV4(s.world, SAVED_AT))) as { payload: Record<string, unknown> }
    delete saved.payload.facilityEconomyRecords
    const loaded = deserializeGameWorldV4(saved as never)
    expect(Object.keys(loaded.facilityEconomyRecordsById)).toHaveLength(0)
    expect(loaded.facilityMaintenanceNeedsById[s.needId as never]).toBeDefined()
  })

  it('rejects a malformed economy record in a Save instead of repairing it', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const saved = JSON.parse(JSON.stringify(serializeGameWorldV4(s.world, SAVED_AT))) as { payload: { facilityEconomyRecords: Record<string, unknown>[] } }
    saved.payload.facilityEconomyRecords.find((r) => r.recordKind === 'OFFER')!.surprise = true
    expect(() => deserializeGameWorldV4(saved as never)).toThrow()
  })
})
