import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld } from '@/domain/world'
import { createEconomicObservation, createExchangeRate } from '@/domain/finance/EconomicEnvironment'
import { assessFinancialRegulation, createFinancialRegulationRule, recordFinancialAssessment } from '@/domain/finance/FinancialRegulation'
import { createOperatingCostSource } from '@/domain/finance/OperatingCostEngine'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const source = { kind: 'CF10_TEST', id: 'save' }
const base = () => createGameWorld(createValidGameWorldInput())
const savedAt = '2032-10-01T00:00:00.000Z'
describe('CF10 Save V4', () => {
  it('round-trips observation, FX and historical assessment with rule version', () => {
    const world = base()
    const observation = createEconomicObservation({ id: 'cpi:save', kind: 'INFLATION_INDEX', region: 'EU', currencyCode: 'EUR' as never, effectiveOn: '2032-07-01' as never, factor: { numerator: 103, denominator: 100 }, provenance: source })
    const rate = createExchangeRate({ id: 'fx:save', baseCurrencyCode: 'USD' as never, quoteCurrencyCode: 'EUR' as never, effectiveOn: '2032-07-01' as never, rate: { numerator: 9, denominator: 10 }, provenance: source })
    const rule = createFinancialRegulationRule({ id: 'rule:save', version: '2027', authorityOrganizationId: 'team-home' as never, competitionId: null, applicableOrganizationIds: ['team-home' as never], effectiveFrom: '2032-01-01' as never, effectiveTo: null, windowDays: 30, metric: 'MINIMUM_CASH', comparison: 'MINIMUM', threshold: 1, currencyCode: 'EUR' as never, consequence: 'LICENSING_ISSUE', provenance: source })
    const assessment = assessFinancialRegulation(world, rule, 'team-home', '2032-10-01')
    const populated = createGameWorld({ ...createValidGameWorldInput(), economicObservations: [observation], exchangeRates: [rate], financialRegulationAssessments: [assessment] })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(populated, savedAt))
    expect(restored.economicObservationsById).toEqual(populated.economicObservationsById)
    expect(restored.exchangeRatesById).toEqual(populated.exchangeRatesById)
    expect(restored.financialRegulationAssessmentsById).toEqual(populated.financialRegulationAssessmentsById)
    expect(recordFinancialAssessment(restored, assessment)).toBe(restored)
  })
  it('defaults CF10 collections in old V4 saves', () => { const save = serializeGameWorldV4(base(), savedAt); const payload = { ...save.payload } as Record<string, unknown>; delete payload.economicObservations; delete payload.exchangeRates; delete payload.financialRegulationAssessments; const restored = deserializeGameWorldV4({ ...save, payload }); expect(restored.economicObservationsById).toEqual({}); expect(restored.exchangeRatesById).toEqual({}); expect(restored.financialRegulationAssessmentsById).toEqual({}) })
  it('rejects malformed FX factors on load', () => { const save = serializeGameWorldV4(base(), savedAt); const payload = { ...save.payload, exchangeRates: [{ id: 'bad', baseCurrencyCode: 'USD', quoteCurrencyCode: 'EUR', effectiveOn: '2032-01-01', rate: { numerator: 0, denominator: 1 }, provenance: source }] }; expect(() => deserializeGameWorldV4({ ...save, payload })).toThrow() })
  it('round-trips an explicit source indexation policy', () => { const cost = createOperatingCostSource({ id: 'cost:save:cf10', organizationId: 'team-home', category: 'UTILITIES', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 100_000 }, startsOn: '2032-10-01', endsOn: '2032-10-01', sourceAuthority: 'FACILITY', generationPolicy: 'ONE_OFF', indexation: { kind: 'INDEXED', observationId: 'cpi:save' }, provenance: source }); const world = createGameWorld({ ...createValidGameWorldInput(), operatingCostSources: [cost] }); const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt)); expect(restored.operatingCostSourcesById[cost.id]?.indexation).toEqual(cost.indexation) })
})
