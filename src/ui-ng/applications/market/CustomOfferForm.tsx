import { useState } from 'react'
import type { TeamId } from '@/domain/ids'
import type { NegotiationRole } from '@/domain/market'
import type { GameWorld } from '@/domain/world'
import { MarketViabilityPanel } from './MarketViabilityPanel'
import { buildMarketViability } from './marketViability'

const ROLES: readonly { readonly id: NegotiationRole | ''; readonly label: string }[] = [
  { id: '', label: 'Sin promesa de rol' },
  { id: 'STAR', label: 'Estrella' },
  { id: 'STARTER', label: 'Titular' },
  { id: 'ROTATION', label: 'Rotación' },
  { id: 'DEPTH', label: 'Fondo de plantilla' },
]

export interface CustomOfferTerms { readonly salary: number; readonly years: number; readonly role?: NegotiationRole }

/**
 * The manager's own formal terms. Defaults are only what the club legitimately knows (the contact answer); when nothing is known the
 * fields start empty rather than inventing a number. The contract starts on the signing date because the contract model has no other
 * start, and the role is a promise recorded as a RolePromise (kept/broken later); no other term exists in the model.
 */
export function CustomOfferForm({ world, teamId, negotiationId, defaultSalary, defaultYears, submitLabel = 'Presentar oferta', onSubmit }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly negotiationId: string
  readonly defaultSalary?: number
  readonly defaultYears?: number
  readonly submitLabel?: string
  readonly onSubmit: (terms: CustomOfferTerms) => void
}) {
  const [salary, setSalary] = useState(defaultSalary === undefined ? '' : String(defaultSalary))
  const [years, setYears] = useState(defaultYears === undefined ? '' : String(defaultYears))
  const [role, setRole] = useState<NegotiationRole | ''>('')
  const salaryValue = Number(salary)
  const yearsValue = Number(years)
  const valid = salary !== '' && years !== '' && Number.isSafeInteger(salaryValue) && salaryValue >= 1 && Number.isSafeInteger(yearsValue) && yearsValue >= 1 && yearsValue <= 10
  return <form className="market-custom-offer" aria-label="Oferta a medida" data-negotiation-id={negotiationId} onSubmit={(event) => {
    event.preventDefault()
    if (valid) onSubmit({ salary: salaryValue, years: yearsValue, ...(role === '' ? {} : { role }) })
  }}>
    <strong>TU OFERTA</strong>
    <label>Salario anual<input aria-label={`Salario ofrecido ${negotiationId}`} type="number" min="1" step="1000" value={salary} placeholder="Importe anual" onChange={(event) => setSalary(event.target.value)} /></label>
    <label>Años de contrato<input aria-label={`Años ofrecidos ${negotiationId}`} type="number" min="1" max="10" value={years} placeholder="Años" onChange={(event) => setYears(event.target.value)} /></label>
    <label>Rol prometido<select aria-label={`Rol prometido ${negotiationId}`} value={role} onChange={(event) => setRole(event.target.value as NegotiationRole | '')}>
      {ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <small>El contrato empieza el día de la firma: el modelo de contratos no admite otra fecha de inicio. La respuesta del jugador y de su agente llega al día siguiente.</small>
    {valid ? <MarketViabilityPanel viability={buildMarketViability(world, teamId, { annualSalary: salaryValue, years: yearsValue })} label="Viabilidad económica de tu oferta" /> : null}
    <button type="submit" disabled={!valid}>{submitLabel}</button>
  </form>
}
