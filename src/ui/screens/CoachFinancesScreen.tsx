import { getCoachFinancialSecurity, getCoachMonthlyExpenses, getCoachMonthlyExternalIncome, getCoachNetWorth, LIFESTYLE_MONTHLY_COST, type Lifestyle } from '@/domain/coachFinances'
import type { GameWorld } from '@/domain/world'

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

export function CoachFinancesScreen({ world, onLifestyle }: { readonly world: GameWorld; readonly onLifestyle: (lifestyle: Lifestyle) => void }) {
  const profile = world.coachFinancesByCoachId[world.userCoachId]!
  return <section className="screen">
    <div className="page-heading"><div><p className="eyebrow">Carrera personal</p><h1>Finanzas del entrenador</h1><p>Liquidez, patrimonio y margen para decidir tu próxima etapa.</p></div></div>
    <section className="content-panel"><h2>{getCoachFinancialSecurity(profile).toUpperCase()}</h2><div className="stats-grid"><p><strong>{money(getCoachNetWorth(profile))}</strong><span>Patrimonio neto</span></p><p><strong>{money(profile.cash)}</strong><span>Liquidez</span></p><p><strong>{money(profile.annualSalary)}</strong><span>Salario anual</span></p><p><strong>{money(getCoachMonthlyExpenses(profile))}</strong><span>Gasto mensual</span></p><p><strong>{money(getCoachMonthlyExternalIncome(profile))}</strong><span>Otros ingresos netos/mes</span></p></div></section>
    <section className="content-panel"><h2>Nivel de vida</h2><p>Coste estructural: {money(LIFESTYLE_MONTHLY_COST[profile.lifestyle])}/mes</p>{(Object.keys(LIFESTYLE_MONTHLY_COST) as Lifestyle[]).map((lifestyle) => <button key={lifestyle} className={lifestyle === profile.lifestyle ? 'primary-button' : 'secondary-button'} onClick={() => onLifestyle(lifestyle)} type="button">{lifestyle}</button>)}</section>
    <section className="content-panel"><h2>Patrimonio e inversiones</h2>{profile.assets.length === 0 && profile.investments.length === 0 && profile.debts.length === 0 ? <p>No hay posiciones activas.</p> : <ul>{profile.assets.map((item) => <li key={item.id}>{item.name}: {money(item.marketValue)} · {item.kind}</li>)}{profile.investments.map((item) => <li key={item.id}>{item.name}: {money(item.value)} · {item.status}</li>)}{profile.debts.map((item) => <li key={item.id}>{item.name}: -{money(item.principalRemaining)} · {item.status}</li>)}</ul>}</section>
    <section className="content-panel"><h2>Ingresos externos</h2>{profile.externalIncomes.length === 0 ? <p>No hay patrocinios ni participaciones activos.</p> : <ul>{profile.externalIncomes.map((item) => <li key={item.id}>{item.name}: {money(item.monthlyGrossAmount)}/mes · {item.kind}</li>)}</ul>}</section>
    <section className="content-panel"><h2>Historial relevante</h2>{profile.movements.length === 0 ? <p>Los salarios, gastos y decisiones relevantes aparecerán aquí.</p> : <ul>{profile.movements.slice(-12).reverse().map((movement) => <li key={movement.id}>{movement.date} · {movement.description} · {money(movement.amount)}</li>)}</ul>}</section>
  </section>
}
