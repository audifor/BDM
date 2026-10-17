import { createFinancialPlanningPeriod, getActiveApprovedBudget, getBudgetComparison } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'

export function FinanceCourtsideBudget({ world, organizationId }: { readonly world: GameWorld; readonly organizationId: string }) {
  const year = world.currentDate.slice(0, 4)
  const period = createFinancialPlanningPeriod({ kind: 'DATE_RANGE', startsOn: year + '-01-01', endsOn: year + '-12-31' })
  const budget = getActiveApprovedBudget(world, organizationId, period, world.currentDate)
  if (!budget) return <div className="fc-budget-empty">Sin presupuesto aprobado para este periodo.</div>
  const expenses = getBudgetComparison(world, budget.id, world.currentDate).filter((entry) => entry.direction === 'EXPENSE')
  if (!expenses.length) return <div className="fc-budget-empty">Este presupuesto no tiene partidas de gasto.</div>
  const total = (field: 'budgetMinorUnits' | 'actualMinorUnits' | 'committedMinorUnits' | 'forecastMinorUnits') => expenses.reduce((sum, entry) => sum + entry[field], 0)
  const limit = total('budgetMinorUnits')
  const actual = total('actualMinorUnits')
  const committed = total('committedMinorUnits')
  const forecast = total('forecastMinorUnits')
  const minorDigits = new Intl.NumberFormat('es-ES', { style: 'currency', currency: budget.currencyCode }).resolvedOptions().maximumFractionDigits ?? 2
  const format = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: budget.currencyCode, maximumFractionDigits: 0 }).format(value / 10 ** minorDigits)
  const fill = limit ? Math.max(0, Math.min(100, (forecast / limit) * 100)) : forecast > 0 ? 100 : 0
  const over = forecast > limit

  return <section className="fc-budget-summary" aria-label="Estado del presupuesto de gastos">
    <div className="fc-budget-summary__head"><strong>{budget.label}</strong><span>{budget.currencyCode}</span></div>
    <div className="fc-budget-summary__figures">
      <div><span>Gasto presupuestado</span><strong>{format(limit)}</strong></div>
      <div><span>Ya contabilizado</span><strong>{format(actual)}</strong></div>
      <div><span>Por compromisos</span><strong>{format(committed)}</strong></div>
      <div><span>Gasto previsto</span><strong className={over ? 'is-over' : ''}>{format(forecast)}</strong></div>
    </div>
    <div className="fc-budget-summary__progress">
      <div className="fc-budget-summary__bar"><span className={over ? 'is-over' : ''} style={{ width: fill + '%' }} /></div>
      <strong className={over ? 'is-over' : ''}>{over ? 'Exceso previsto: ' : 'Margen previsto: '}{format(Math.abs(limit - forecast))}</strong>
    </div>
  </section>
}
