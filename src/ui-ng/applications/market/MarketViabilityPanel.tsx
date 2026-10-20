import { formatMoney } from '@/ui/formatters'
import type { MarketViability } from './marketViability'

const SALARY_CAP_TEXT: Readonly<Record<MarketViability['salaryCap'], string>> = Object.freeze({
  NOT_APPLICABLE: 'No aplica: esta competición no define tope salarial',
  APPLICABLE: 'Aplica: se comprueba aparte del presupuesto',
  UNKNOWN: 'Sin datos de reglas salariales',
})

const money = (value: number | null): string => (value === null ? 'Desconocido' : formatMoney(value))

/** Presupuesto ≠ tesorería ≠ compromisos ≠ tope salarial: each is shown on its own line, and an unknown amount is never shown as zero. */
export function MarketViabilityPanel({ viability, label = 'Viabilidad económica' }: { readonly viability: MarketViability; readonly label?: string }) {
  const verdictText = viability.verdict === 'VIABLE' ? 'Viable' : viability.verdict === 'NOT_VIABLE' ? 'No viable' : 'Pendiente de datos'
  return <section className="market-viability" aria-label={label} data-verdict={viability.verdict}>
    <header><strong>{label.toUpperCase()}</strong><b className={`market-viability__verdict is-${viability.verdict.toLowerCase()}`}>{verdictText}</b></header>
    <dl>
      <div><dt>Presupuesto salarial autorizado</dt><dd>{money(viability.authorizedMajor)}</dd></div>
      <div><dt>Compromisos de jugadores en el ejercicio</dt><dd>{money(viability.committedMajor)}</dd></div>
      {viability.reservedMajor !== null && viability.reservedMajor > 0 ? <div><dt>Reservado por operaciones en curso</dt><dd>{money(viability.reservedMajor)}</dd></div> : null}
      <div><dt>Margen realmente disponible</dt><dd data-testid="market-viability-margin">{money(viability.marginMajor)}</dd></div>
      <div><dt>Tesorería (no es margen salarial)</dt><dd>{money(viability.cashMajor)}</dd></div>
      <div><dt>Salario anual del contrato</dt><dd>{money(viability.annualSalaryMajor)}</dd></div>
      <div><dt>Duración</dt><dd>{viability.years === null ? 'Desconocida' : `${viability.years} ${viability.years === 1 ? 'año' : 'años'}`}</dd></div>
      <div><dt>Compromiso total del contrato</dt><dd>{money(viability.totalContractMajor)}</dd></div>
      <div><dt>Margen tras la operación</dt><dd data-testid="market-viability-after">{money(viability.marginAfterMajor)}</dd></div>
      <div><dt>Tope salarial</dt><dd>{SALARY_CAP_TEXT[viability.salaryCap]}</dd></div>
    </dl>
    <ul className="market-viability__reasons">{viability.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
  </section>
}
