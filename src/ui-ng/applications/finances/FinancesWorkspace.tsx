import { useMemo, useState } from 'react'
import { getPlayerContractStatus, getContractYearCompensation } from '@/domain/contract'
import { createFinancialSource, type ValuationAssumptions } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculateTeamPayroll, calculateTeamSalaryStatus, getTeamRetainedSalary } from '@/engine/salary'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { FinanceCourtsideOverview } from './FinanceCourtsideOverview'
import { buildFinanceWorkspaceSection, type FinanceSection, type FinanceTable, type FinanceTab } from './financeWorkspaceModel'
import './finance-workspace.css'
import '@/ui-ng/applications/club/courtside-club-management.css'
import './finance-courtside.css'

/* Navigation groups only the presentation; every canonical Finance V2 destination remains reachable. */
const FINANCE_GROUPS = [
  { id: 'summary', label: 'Resumen', entries: [['overview', 'Mi economía'], ['health', 'Alertas'], ['ai', 'Consejos']] },
  { id: 'treasury', label: 'Caja', entries: [['cash', 'Movimientos'], ['revenue', 'Ingresos'], ['debt', 'Deuda']] },
  { id: 'planning', label: 'Presupuesto', entries: [['budget', 'Control'], ['costs', 'Gastos'], ['payroll', 'Nóminas']] },
  { id: 'roster', label: 'Plantilla', entries: [['cap', 'Límite salarial'], ['competition', 'Competiciones'], ['regulation', 'Normativa']] },
  { id: 'future', label: 'Futuro', entries: [['forecast', 'Previsiones'], ['valuation', 'Valor del club']] },
] as const
const groupTabs = FINANCE_GROUPS.map(({ id, label }) => ({ id, label }))
const uiTitles: Partial<Record<FinanceTab, string>> = {
  health: 'Señales de alerta', ai: 'Recomendaciones', cash: 'Caja y cobros',
  revenue: 'Ingresos del club', debt: 'Préstamos y deuda', budget: 'Presupuesto',
  costs: 'Gastos del club', payroll: 'Sueldos y contratos',
  competition: 'Ingresos de competición', regulation: 'Normativa financiera',
  forecast: 'Previsión de temporada', valuation: 'Valor estimado del club',
}
const mainTableByTab: Partial<Record<FinanceTab, number[]>> = {
  health: [0], ai: [0], cash: [1, 2], revenue: [1], debt: [0, 1],
  budget: [0], costs: [1, 2], payroll: [0, 1], competition: [2],
  regulation: [0], forecast: [0, 1], valuation: [0],
}

export function FinancesWorkspace({ world: suppliedWorld }: { readonly world?: GameWorld } = {}) {
  const storedWorld = useGameStore((state) => state.world)
  const world = suppliedWorld ?? storedWorld
  const [tab, setTab] = useState<FinanceTab>('overview')
  const [currency, setCurrency] = useState('')
  const [filter, setFilter] = useState('')
  const [scenario, setScenario] = useState<'BASELINE' | 'UPSIDE' | 'DOWNSIDE'>('BASELINE')
  const [method, setMethod] = useState<'REVENUE_MULTIPLE' | 'OPERATING_RESULT_MULTIPLE'>('REVENUE_MULTIPLE')
  const [numerator, setNumerator] = useState('')
  const [denominator, setDenominator] = useState('1')
  const group = FINANCE_GROUPS.find((entry) => entry.entries.some(([id]) => id === tab)) ?? FINANCE_GROUPS[0]
  const team = world ? getUserTeam(world) : undefined
  const organizationId = team?.organizationId
  const profileCurrency = world && organizationId ? world.organizationFinancialProfilesById[organizationId]?.baseCurrencyCode : undefined
  const enteredCurrency = currency.trim().toUpperCase()
  const reportingCurrency = enteredCurrency ? (/^[A-Z]{3}$/.test(enteredCurrency) ? enteredCurrency : undefined) : profileCurrency
  const validMultiple = Number.isSafeInteger(Number(numerator)) && Number(numerator) > 0 && Number.isSafeInteger(Number(denominator)) && Number(denominator) > 0
  const assumptions: ValuationAssumptions | undefined = validMultiple ? {
    id: 'ui-' + method + '-' + numerator + '-' + denominator,
    method,
    multipleNumerator: Number(numerator),
    multipleDenominator: Number(denominator),
    provenance: createFinancialSource({ kind: 'VALUATION_ASSUMPTIONS', id: 'USER_INPUT' }),
  } : undefined
  const section = useMemo(() => world && organizationId && tab !== 'cap' && tab !== 'overview'
    ? buildFinanceWorkspaceSection(world, organizationId, tab, { reportingCurrency, scenario, valuationAssumptions: assumptions })
    : undefined,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [world, organizationId, tab, reportingCurrency, scenario, method, numerator, denominator])

  if (!world) return <NgHoloShell appLabel="Finances" empty emptyMessage="No career loaded." region="finances-workspace" className="cs-club-management cs-club-finances" />
  if (!team || !organizationId) return <NgHoloShell appLabel="Finances" empty emptyMessage="No Organization is assigned to this team." region="finances-workspace" className="cs-club-management cs-club-finances" />

  return <NgHoloShell appLabel="Finances" title={team.name} meta={world.currentDate} teamId={team.id} region="finances-workspace" className="finance-workspace cs-club-management cs-club-finances" tabs={groupTabs} activeTabId={group.id} onTabSelect={(id) => {
    const selected = FINANCE_GROUPS.find((entry) => entry.id === id)
    if (selected) setTab(selected.entries[0][0])
  }}>
    <nav className="fc-subnav" aria-label="Apartados de finanzas">
      {group.entries.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    {tab === 'overview' ? <FinanceCourtsideOverview world={world} organizationId={organizationId} currency={reportingCurrency} onNavigate={setTab} /> : <>
      {(tab === 'forecast' || tab === 'valuation') && <div className="fc-context-controls">
        {tab === 'forecast' && <label>Escenario <select aria-label="Forecast scenario" onChange={(event) => setScenario(event.target.value as typeof scenario)} value={scenario}><option value="BASELINE">Normal</option><option value="UPSIDE">Optimista</option><option value="DOWNSIDE">Pesimista</option></select></label>}
        {tab === 'valuation' && <>
          <label>Método <select aria-label="Valuation method" onChange={(event) => setMethod(event.target.value as typeof method)} value={method}><option value="REVENUE_MULTIPLE">Ingresos</option><option value="OPERATING_RESULT_MULTIPLE">Resultado operativo</option></select></label>
          <label>Multiplicador <input aria-label="Multiple numerator" min="1" onChange={(event) => setNumerator(event.target.value)} type="number" value={numerator} placeholder="Ej. 3" /></label>
          <label>Divisor <input aria-label="Multiple denominator" min="1" onChange={(event) => setDenominator(event.target.value)} type="number" value={denominator} /></label>
        </>}
      </div>}
      <details className="fc-options">
        <summary>Filtros y opciones avanzadas</summary>
        <div className="finance-workspace__controls">
          <label>Moneda de informe <input aria-label="Reporting currency" maxLength={3} onChange={(event) => setCurrency(event.target.value)} placeholder={profileCurrency ?? 'EUR'} value={currency} /></label>
          <label>Buscar registros <input aria-label="Filter facts" onChange={(event) => setFilter(event.target.value)} placeholder="Categoría, importe, origen…" value={filter} /></label>
        </div>
      </details>
      {enteredCurrency && !reportingCurrency && <p className="finance-workspace__input-error" role="alert">Introduce una moneda de tres letras.</p>}
      {tab === 'valuation' && numerator !== '' && !validMultiple && <p className="finance-workspace__input-error" role="alert">Multiplicador no válido. Usa enteros positivos.</p>}
      {tab === 'cap' ? <SalaryCapSection world={world} teamId={team.id} /> : section && <FinanceSectionView section={section} tab={tab} filter={filter} />}
    </>}
  </NgHoloShell>
}

function FinanceSectionView({ section, tab, filter }: { readonly section: FinanceSection; readonly tab: FinanceTab; readonly filter: string }) {
  const term = filter.trim().toLocaleLowerCase()
  const mainIndexes = mainTableByTab[tab] ?? [0]
  const mainTables = section.tables.filter((_, index) => mainIndexes.includes(index))
  const extraTables = section.tables.filter((_, index) => !mainIndexes.includes(index))
  const requiresInput = section.notes.find((note) => /No reporting currency|No valuation assumptions|no positive operating metric/i.test(note))
  return <div className="finance-workspace__section">
    <div className="fc-section-header">
      <h2>{uiTitles[tab] ?? section.title}</h2>
      <span>{mainTables.reduce((count, entry) => count + entry.rows.length, 0)} registros</span>
    </div>
    {section.metrics.length > 0 && <dl className="finance-workspace__metrics">{section.metrics.slice(0, 4).map((metric) => <div className="finance-workspace__metric" key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd>{metric.detail && <small>{metric.detail}</small>}</div>)}</dl>}
    {requiresInput && <p className="finance-workspace__empty">{requiresInput}</p>}
    {mainTables.map((table) => <FinanceTableView key={table.title} table={table} term={term} />)}
    {section.metrics.length > 4 && <details className="fc-extra"><summary>Otros indicadores ({section.metrics.length - 4})</summary><dl className="finance-workspace__metrics">{section.metrics.slice(4).map((metric) => <div className="finance-workspace__metric" key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl></details>}
    {extraTables.length > 0 && <details className="fc-extra"><summary>Movimientos y detalle ({extraTables.length})</summary>
      <div className="fc-extra__tables">{extraTables.map((table) => <FinanceTableView key={table.title} table={table} term={term} />)}</div>
    </details>}
  </div>
}

function FinanceTableView({ table, term }: { readonly table: FinanceTable; readonly term: string }) {
  const rows = term ? table.rows.filter((item) => [...item.cells, item.provenance ?? '', ...(item.references ?? [])].some((value) => value.toLocaleLowerCase().includes(term))) : table.rows
  return <section className="finance-workspace__table-panel">
    <div className="fc-table-header"><h3>{table.title}</h3><span>{rows.length}</span></div>
    {rows.length === 0 ? <p className="finance-workspace__empty">{term && table.rows.length ? 'Sin coincidencias.' : table.empty}</p> : <div className="finance-workspace__table-scroll"><table><thead><tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}<th scope="col">Origen</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}>{item.cells.map((cell, index) => <td key={index}>{cell}</td>)}<td>{item.provenance || item.references?.length ? <details className="fc-row-trace"><summary aria-label="Ver origen del registro">Ver</summary>{item.provenance && <p>{item.provenance}</p>}{item.references?.length ? <ul>{item.references.map((reference) => <li key={reference}>{reference}</li>)}</ul> : null}</details> : '·'}</td></tr>)}</tbody></table></div>}
  </section>
}

function SalaryCapSection({ world, teamId }: { readonly world: GameWorld; readonly teamId: string }) {
  const rules = world.salaryRulesBySeasonId[world.currentSeasonId]
  if (!rules) return <div className="finance-workspace__section"><h2>Salary cap</h2><p className="finance-workspace__empty">No salary-cap rules for the active cycle.</p></div>
  const contracts = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId && getPlayerContractStatus(contract, world.currentDate) === 'active')
  const deadMoney = Object.values(world.deadMoneyChargesById).filter((charge) => charge.teamId === teamId && charge.seasonId === rules.seasonId).reduce((sum, charge) => sum + charge.amount, 0)
  const retainedSalary = getTeamRetainedSalary(world, teamId as never, rules.seasonId)
  const status = calculateTeamSalaryStatus(rules, calculateTeamPayroll(contracts, world.currentDate, deadMoney, retainedSalary))
  const exceptions = Object.values(world.salaryExceptionsById).filter((item) => item.teamId === teamId)
  return <div className="finance-workspace__section"><h2>Salary cap</h2>
    <dl className="finance-workspace__metrics">{[['Cap hit', status.payroll.totalCapHit], ['Cap', status.capAmount], ['Cap space', status.capSpace], ['Tax overage', status.taxOverage]].map(([label, value]) => <div className="finance-workspace__metric" key={label}><dt>{label}</dt><dd>{formatMoney(Number(value))}</dd></div>)}</dl>
    <section className="finance-workspace__table-panel"><h3>Contracts</h3>{contracts.length ? <div className="finance-workspace__table-scroll"><table><thead><tr><th>Player</th><th>Cash salary</th><th>Cap hit</th><th>Guaranteed</th></tr></thead><tbody>{contracts.map((contract) => { const compensation = getContractYearCompensation(contract, world.currentDate); const player = world.players[contract.playerId]; return <tr key={contract.id}><td>{player ? `${player.firstName} ${player.lastName}` : contract.playerId}</td><td>{formatMoney(compensation.cashSalary)}</td><td>{formatMoney(compensation.capHit)}</td><td>{formatMoney(compensation.guaranteedAmount)}</td></tr> })}</tbody></table></div> : <p className="finance-workspace__empty">No active player contracts.</p>}</section>
    <section className="finance-workspace__table-panel"><h3>Exceptions</h3>{exceptions.length ? <div className="finance-workspace__table-scroll"><table><thead><tr><th>Rule</th><th>Original</th><th>Remaining</th><th>Expiry</th></tr></thead><tbody>{exceptions.map((item) => <tr key={item.id}><td>{item.ruleId}</td><td>{formatMoney(item.originalAmount)}</td><td>{formatMoney(item.remainingAmount)}</td><td>{item.expiresAfterSeasonId}</td></tr>)}</tbody></table></div> : <p className="finance-workspace__empty">No salary exceptions.</p>}</section>
  </div>
}
