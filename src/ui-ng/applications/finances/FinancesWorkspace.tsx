import { useMemo, useState } from 'react'
import { getPlayerContractStatus, getContractYearCompensation } from '@/domain/contract'
import { createFinancialSource, type ValuationAssumptions } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculateTeamPayroll, calculateTeamSalaryStatus } from '@/engine/salary'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { buildFinanceWorkspaceSection, FINANCE_TABS, type FinanceSection, type FinanceTab } from './financeWorkspaceModel'
import './finance-workspace.css'

const tabs = FINANCE_TABS.map(([id, label]) => ({ id, label }))

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
  const team = world ? getUserTeam(world) : undefined
  const organizationId = team?.organizationId
  const profileCurrency = world && organizationId ? world.organizationFinancialProfilesById[organizationId]?.baseCurrencyCode : undefined
  const enteredCurrency = currency.trim().toUpperCase()
  const reportingCurrency = enteredCurrency ? (/^[A-Z]{3}$/.test(enteredCurrency) ? enteredCurrency : undefined) : profileCurrency
  const validMultiple = Number.isSafeInteger(Number(numerator)) && Number(numerator) > 0 && Number.isSafeInteger(Number(denominator)) && Number(denominator) > 0
  const assumptions: ValuationAssumptions | undefined = validMultiple ? {
    id: `ui-${method}-${numerator}-${denominator}`,
    method,
    multipleNumerator: Number(numerator),
    multipleDenominator: Number(denominator),
    provenance: createFinancialSource({ kind: 'VALUATION_ASSUMPTIONS', id: 'USER_INPUT' }),
  } : undefined
  const section = useMemo(() => world && organizationId && tab !== 'cap'
    ? buildFinanceWorkspaceSection(world, organizationId, tab, { reportingCurrency, scenario, valuationAssumptions: assumptions })
    : undefined,
  // The primitive values are the actual valuation inputs; the transient assumption object need not invalidate other tabs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [world, organizationId, tab, reportingCurrency, scenario, method, numerator, denominator])

  if (!world) return <NgHoloShell appLabel="Finances" empty emptyMessage="No career loaded." region="finances-workspace" />
  if (!team || !organizationId) return <NgHoloShell appLabel="Finances" empty emptyMessage="No Organization is assigned to this team." region="finances-workspace" />

  return <NgHoloShell appLabel="Finances" title={team.name} meta={`As of ${world.currentDate}`} teamId={team.id} region="finances-workspace" className="finance-workspace" tabs={tabs} activeTabId={tab} onTabSelect={(id) => setTab(id as FinanceTab)}>
    {tab !== 'cap' && <div className="finance-workspace__controls">
      <label>Reporting currency <input aria-label="Reporting currency" maxLength={3} onChange={(event) => setCurrency(event.target.value)} placeholder={profileCurrency ?? 'e.g. EUR'} value={currency} /></label>
      <label>Filter facts <input aria-label="Filter facts" onChange={(event) => setFilter(event.target.value)} placeholder="Currency, category, team, source…" value={filter} /></label>
      {tab === 'forecast' && <label>Scenario <select aria-label="Forecast scenario" onChange={(event) => setScenario(event.target.value as typeof scenario)} value={scenario}><option value="BASELINE">Baseline</option><option value="UPSIDE">Upside</option><option value="DOWNSIDE">Downside</option></select></label>}
      {tab === 'valuation' && <>
        <label>Method <select aria-label="Valuation method" onChange={(event) => setMethod(event.target.value as typeof method)} value={method}><option value="REVENUE_MULTIPLE">Revenue multiple</option><option value="OPERATING_RESULT_MULTIPLE">Operating result multiple</option></select></label>
        <label>Multiple numerator <input aria-label="Multiple numerator" min="1" onChange={(event) => setNumerator(event.target.value)} type="number" value={numerator} /></label>
        <label>Multiple denominator <input aria-label="Multiple denominator" min="1" onChange={(event) => setDenominator(event.target.value)} type="number" value={denominator} /></label>
      </>}
    </div>}
    {enteredCurrency && !reportingCurrency && <p className="finance-workspace__input-error" role="alert">Enter a three-letter reporting currency.</p>}
    {tab === 'valuation' && numerator !== '' && !validMultiple && <p className="finance-workspace__input-error" role="alert">Invalid valuation multiple. Use positive whole numbers.</p>}
    {tab === 'cap' ? <SalaryCapSection world={world} teamId={team.id} /> : section && <FinanceSectionView section={section} filter={filter} />}
  </NgHoloShell>
}

function FinanceSectionView({ section, filter }: { readonly section: FinanceSection; readonly filter: string }) {
  const term = filter.trim().toLocaleLowerCase()
  return <div className="finance-workspace__section">
    <h2>{section.title}</h2>
    {section.metrics.length > 0 && <dl className="finance-workspace__metrics">{section.metrics.map((metric) => <div className="finance-workspace__metric" key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd>{metric.detail && <small>{metric.detail}</small>}</div>)}</dl>}
    {section.notes.map((note) => <p className="finance-workspace__note" key={note}>{note}</p>)}
    {section.tables.map((table) => { const rows = term ? table.rows.filter((row) => [...row.cells, row.provenance ?? '', ...(row.references ?? [])].some((value) => value.toLocaleLowerCase().includes(term))) : table.rows; return <section className="finance-workspace__table-panel" key={table.title}>
      <h3>{table.title}</h3>
      {rows.length === 0 ? <p className="finance-workspace__empty">{term && table.rows.length ? 'No facts match this filter.' : table.empty}</p> : <div className="finance-workspace__table-scroll"><table><thead><tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}<th scope="col">Source</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}<td>{row.provenance || row.references?.length ? <details><summary>Trace</summary>{row.provenance && <p>{row.provenance}</p>}{row.references?.length ? <ul>{row.references.map((reference) => <li key={reference}>{reference}</li>)}</ul> : null}</details> : '—'}</td></tr>)}</tbody></table></div>}
    </section> })}
  </div>
}

function SalaryCapSection({ world, teamId }: { readonly world: GameWorld; readonly teamId: string }) {
  const rules = world.salaryRulesBySeasonId[world.currentSeasonId]
  if (!rules) return <div className="finance-workspace__section"><h2>Salary cap</h2><p className="finance-workspace__note">Competition roster charge. This is separate from Organization cash and financial payroll.</p><p className="finance-workspace__empty">No salary-cap rules for the active cycle.</p></div>
  const contracts = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId && getPlayerContractStatus(contract, world.currentDate) === 'active')
  const deadMoney = Object.values(world.deadMoneyChargesById).filter((charge) => charge.teamId === teamId && charge.seasonId === rules.seasonId).reduce((sum, charge) => sum + charge.amount, 0)
  const status = calculateTeamSalaryStatus(rules, calculateTeamPayroll(contracts, world.currentDate, deadMoney))
  const exceptions = Object.values(world.salaryExceptionsById).filter((item) => item.teamId === teamId)
  return <div className="finance-workspace__section"><h2>Salary cap</h2><p className="finance-workspace__note">Competition roster charge. This is separate from Organization cash and financial payroll.</p>
    <dl className="finance-workspace__metrics">{[['Cap hit', status.payroll.totalCapHit], ['Cap', status.capAmount], ['Cap space', status.capSpace], ['Tax overage', status.taxOverage]].map(([label, value]) => <div className="finance-workspace__metric" key={label}><dt>{label}</dt><dd>{formatMoney(Number(value))}</dd></div>)}</dl>
    <section className="finance-workspace__table-panel"><h3>Contracts</h3>{contracts.length ? <div className="finance-workspace__table-scroll"><table><thead><tr><th>Player</th><th>Cash salary</th><th>Cap hit</th><th>Guaranteed</th></tr></thead><tbody>{contracts.map((contract) => { const compensation = getContractYearCompensation(contract, world.currentDate); const player = world.players[contract.playerId]; return <tr key={contract.id}><td>{player ? `${player.firstName} ${player.lastName}` : contract.playerId}</td><td>{formatMoney(compensation.cashSalary)}</td><td>{formatMoney(compensation.capHit)}</td><td>{formatMoney(compensation.guaranteedAmount)}</td></tr> })}</tbody></table></div> : <p className="finance-workspace__empty">No active player contracts.</p>}</section>
    <section className="finance-workspace__table-panel"><h3>Exceptions</h3>{exceptions.length ? <div className="finance-workspace__table-scroll"><table><thead><tr><th>Rule</th><th>Original</th><th>Remaining</th><th>Expiry</th></tr></thead><tbody>{exceptions.map((item) => <tr key={item.id}><td>{item.ruleId}</td><td>{formatMoney(item.originalAmount)}</td><td>{formatMoney(item.remainingAmount)}</td><td>{item.expiresAfterSeasonId}</td></tr>)}</tbody></table></div> : <p className="finance-workspace__empty">No salary exceptions.</p>}</section>
  </div>
}
