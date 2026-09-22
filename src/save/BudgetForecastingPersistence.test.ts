import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld } from '@/domain/world'
import { createBudgetLine, createFinancialBudget, createFinancialPlanningPeriod, createForecastAssumption } from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

describe('CF6 V4 budget persistence', () => {
  it('round-trips budgets, revisions-compatible lines and forecast assumptions', () => {
    const input = createValidGameWorldInput()
    const organizationId = input.teams![0]!.organizationId
    const period = createFinancialPlanningPeriod({ kind: 'SEASON', startsOn: '2032-01-01', endsOn: '2032-12-31', seasonId: input.seasons![0]!.id })
    const source = { kind: 'CF6_SAVE', id: 'round-trip' }
    const budget = createFinancialBudget({ id: 'budget:save:cf6', organizationId, currencyCode: 'EUR', period, status: 'APPROVED', label: 'Save test', createdOn: '2032-01-01', approval: { authorityKind: 'GOVERNANCE', authorityId: 'governance:save', approvedOn: '2032-01-01', provenance: source }, provenance: source })
    const line = createBudgetLine({ id: 'line:save:cf6', budgetId: budget.id, organizationId, category: 'OPERATIONS', direction: 'EXPENSE', amount: { currencyCode: 'EUR', minorUnits: 900 }, provenance: source })
    const assumption = createForecastAssumption({ id: 'assumption:save:cf6', organizationId, kind: 'EXPENSE', amount: { currencyCode: 'EUR', minorUnits: 100 }, period, category: 'OPERATIONS', explanation: 'Explicit save fixture', provenance: source })
    const world = createGameWorld({ ...input, financialBudgets: [budget], budgetLines: [line], forecastAssumptions: [assumption] })
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(world, '2032-01-02T00:00:00.000Z'))
    expect(loaded.financialBudgetsById[budget.id]).toEqual(budget)
    expect(loaded.budgetLinesById[line.id]).toEqual(line)
    expect(loaded.forecastAssumptionsById[assumption.id]).toEqual(assumption)
  })

  it('loads an old V4 payload with absent planning collections as empty', () => {
    const world = createGameWorld(createValidGameWorldInput())
    const save = serializeGameWorldV4(world, '2032-01-02T00:00:00.000Z')
    const legacyPayload = { ...save.payload } as Record<string, unknown>
    delete legacyPayload.financialBudgets
    delete legacyPayload.budgetLines
    delete legacyPayload.budgetRevisions
    delete legacyPayload.budgetAllocations
    delete legacyPayload.forecastAssumptions
    const loaded = deserializeGameWorldV4({ ...save, payload: legacyPayload })
    expect(loaded.financialBudgetsById).toEqual({})
    expect(loaded.forecastAssumptionsById).toEqual({})
  })
})
