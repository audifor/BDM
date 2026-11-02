import { useState } from 'react'
import { getCashAccountBalances, getExpenseRecognitionsBetween, getFinanceProposals, getFinancialHealthSnapshot, getRevenueRecognitionsBetween } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { financeReportingPeriod } from './financeWorkspaceModel'

type FinanceDestination = 'cash' | 'budget' | 'payroll' | 'forecast' | 'debt' | 'ai' | 'cap'

interface FinanceOverviewProps {
  readonly world: GameWorld
  readonly organizationId: string
  readonly currency?: string
  readonly onNavigate: (destination: FinanceDestination) => void
}

export function FinanceCourtsideOverview({ world, organizationId, currency, onNavigate }: FinanceOverviewProps) {
  const [chosenCurrency, setChosenCurrency] = useState('')
  const startsOn = financeReportingPeriod(world, organizationId).startsOn
  const health = getFinancialHealthSnapshot(world, organizationId, world.currentDate, startsOn)
  const availableCurrencies = health.byCurrency.map((entry) => entry.currencyCode)
  const activeCurrency = (chosenCurrency && availableCurrencies.some((code) => code === chosenCurrency)) ? chosenCurrency : (currency && availableCurrencies.some((code) => code === currency) ? currency : availableCurrencies[0])
  const summary = health.byCurrency.find((entry) => entry.currencyCode === activeCurrency)
  const money = (value: number) => { if (!summary) return 'Sin datos'; const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: summary.currencyCode, maximumFractionDigits: 0 }); const minorDigits = new Intl.NumberFormat('es-ES', { style: 'currency', currency: summary.currencyCode }).resolvedOptions().maximumFractionDigits ?? 2; return formatter.format(value / 10 ** minorDigits) }
  const cashRecorded = !!summary && getCashAccountBalances(world, organizationId, world.currentDate).some((item) => item.currencyCode === summary.currencyCode)
  const incomeRecorded = !!summary && getRevenueRecognitionsBetween(world, organizationId, startsOn, world.currentDate).some((item) => item.amount.currencyCode === summary.currencyCode)
  const costsRecorded = !!summary && getExpenseRecognitionsBetween(world, organizationId, startsOn, world.currentDate).some((item) => item.amount.currencyCode === summary.currencyCode)
  const resultRecorded = incomeRecorded || costsRecorded
  const projectionsRecorded = cashRecorded
  const income = summary?.operatingRevenueMinorUnits ?? 0
  const expenses = summary?.operatingExpenseMinorUnits ?? 0
  const scale = Math.max(income, expenses, 1)
  const proposals = getFinanceProposals(world, organizationId).filter((item) => item.status === 'RECOMMENDED')

  return <div className="fc-overview" data-testid="finance-courtside-overview">
    <div className="fc-overview__top">
      <div>
        <span className="fc-overview__eyebrow">TU CLUB · FINANZAS</span>
        <h2>Tu dinero, de un vistazo</h2>
      </div>
      {availableCurrencies.length > 1 && <div className="fc-overview__currencies" role="group" aria-label="Moneda de los datos">
        {availableCurrencies.map((code) => <button type="button" key={code} className={code === activeCurrency ? 'is-active' : ''} aria-pressed={code === activeCurrency} onClick={() => setChosenCurrency(code)}>{code}</button>)}
      </div>}
      {availableCurrencies.length === 1 && <span className="fc-overview__currency-label">{activeCurrency}</span>}
    </div>
    {!summary && <div className="fc-overview__no-data">No hay datos financieros del club todavía.</div>}
    <div className="fc-overview__kpis">
      <Kpi label="Dinero disponible" value={cashRecorded ? money(summary!.unrestrictedCashMinorUnits) : 'Sin datos'} note="Caja sin restricciones" primary />
      <Kpi label="Resultado del ejercicio" value={resultRecorded ? money(summary!.operatingResultMinorUnits) : 'Sin datos'} tone={summary && resultRecorded && summary.operatingResultMinorUnits < 0 ? 'negative' : 'default'} />
      <Kpi label="Pendiente de cobrar" value={summary ? money(summary.shortTermReceivablesMinorUnits) : 'Sin datos'} note="Próximos 30 días" />
      <Kpi label="Pendiente de pagar" value={summary ? money(summary.shortTermPayablesMinorUnits) : 'Sin datos'} note="Próximos 30 días" />
    </div>
    <div className="fc-overview__body">
      <section className="fc-overview__panel fc-overview__liquidity">
        <div className="fc-overview__panel-heading">
          <h3>Próximos 30 días</h3>
          <button type="button" onClick={() => onNavigate('cash')}>Ver caja <span aria-hidden="true">›</span></button>
        </div>
        <div className="fc-overview__projected">
          <span>Caja estimada</span>
          <strong className={summary && summary.projectedUnrestrictedCashMinorUnits < 0 ? 'is-negative' : ''}>{projectionsRecorded ? money(summary!.projectedUnrestrictedCashMinorUnits) : 'Sin datos'}</strong>
        </div>
        {summary && summary.liquidityShortfallMinorUnits > 0
          ? <div className="fc-overview__warning">Faltan {money(summary.liquidityShortfallMinorUnits)} para cubrir pagos previstos</div>
          : <div className="fc-overview__muted">{projectionsRecorded ? 'Sin déficit de liquidez previsto' : 'Sin proyección de tesorería'}</div>}
        <div className="fc-overview__inline">
          <span>Deuda vigente</span><strong>{summary ? money(summary.outstandingDebtMinorUnits) : 'Sin datos'}</strong>
          <button type="button" onClick={() => onNavigate('debt')} aria-label="Ver deuda">›</button>
        </div>
      </section>
      <section className="fc-overview__panel">
        <div className="fc-overview__panel-heading"><h3>Ingresos y gastos</h3><button type="button" onClick={() => onNavigate('budget')}>Ver presupuesto <span aria-hidden="true">›</span></button></div>
        <div className="fc-overview__bars">
          <div className="fc-overview__bar-item"><div><span>Ingresos</span><strong>{incomeRecorded ? money(income) : 'Sin datos'}</strong></div><div className="fc-overview__track"><span className="is-income" style={{ width: `${incomeRecorded ? income / scale * 100 : 0}%` }} /></div></div>
          <div className="fc-overview__bar-item"><div><span>Gastos</span><strong>{costsRecorded ? money(expenses) : 'Sin datos'}</strong></div><div className="fc-overview__track"><span className="is-expense" style={{ width: `${costsRecorded ? expenses / scale * 100 : 0}%` }} /></div></div>
        </div>
        <div className="fc-overview__inline">
          <span>Compromisos futuros</span><strong>{summary ? money(summary.committedOperatingCostsMinorUnits + summary.committedFuturePayrollMinorUnits) : 'Sin datos'}</strong>
          <button type="button" onClick={() => onNavigate('payroll')} aria-label="Ver compromisos salariales">›</button>
        </div>
      </section>
    </div>
    <div className="fc-overview__shortcuts">
      <button type="button" onClick={() => onNavigate('budget')}><span>Presupuesto</span><strong>Controlar gastos ›</strong></button>
      <button type="button" onClick={() => onNavigate('cap')}><span>Límite salarial</span><strong>Ver restricciones ›</strong></button>
      <button type="button" onClick={() => onNavigate('forecast')}><span>Previsión</span><strong>Probar escenarios ›</strong></button>
      <button type="button" onClick={() => onNavigate('ai')}><span>Recomendaciones</span><strong>{proposals.length ? `${proposals.length} pendientes ›` : 'Ver decisiones ›'}</strong></button>
    </div>
  </div>
}

function Kpi({ label, value, note, primary, tone }: { readonly label: string; readonly value: string; readonly note?: string; readonly primary?: boolean; readonly tone?: 'default' | 'negative' }) {
  return <div className={['fc-overview__kpi', primary ? 'is-primary' : '', tone === 'negative' ? 'is-negative' : ''].filter(Boolean).join(' ')}>
    <span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}
  </div>
}
