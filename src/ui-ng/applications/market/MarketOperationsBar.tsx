import { useState } from 'react'
import type { GameWorld } from '@/domain/world'
import { calculateStaffWorkload, getTeamFinancialSnapshot, getTeamStaffPayroll, canTeamAffordAdditionalSalary } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { isScoutingStaffRole } from '@/ui-ng/applications/market/isScoutingStaffRole'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { formatMoney } from '@/ui/formatters'
import { navigateToStaff, navigateToStaffDepartment, navigateToStaffMarket } from '@/ui-ng/workspace/workspaceApps'
import './market-operations-bar.css'

interface Props {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onOpenScouting: () => void
  readonly onOpenFreeAgents: () => void
}
export function MarketOperationsBar({ world, teamId, onOpenScouting, onOpenFreeAgents }: Props) {
  const [open, setOpen] = useState(false)
  const [salary, setSalary] = useState('')
  // Older and partially materialized worlds may not have either salary budget yet.
  // Missing data must not throw during render or be represented as zero.
  const budgets = world.teamFinancesByTeamId[teamId]
  const playerBudget = budgets?.playerSalaryBudget === undefined ? null : getTeamFinancialSnapshot(world, teamId)
  const staffBudget = budgets?.staffSalaryBudget === undefined ? null : getTeamStaffPayroll(world, teamId)
  const staff = Object.values(world.teamStaffAssignmentsById)
    .filter((item) => item.teamId === teamId && isScoutingStaffRole(item.role) &&
      world.staffEmploymentByStaffId[item.staffPersonId]?.status === 'employed')
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.staffPersonId === item.staffPersonId) === index)
  const proposed = salary.trim() === '' ? null : Number(salary)
  const valid = proposed !== null && Number.isSafeInteger(proposed) && proposed >= 0
  const affordable = valid && playerBudget !== null ? canTeamAffordAdditionalSalary(world, teamId, proposed) : null
  return <>
    <div className="market-operations-bar" data-testid="market-operations-bar">
      <button type="button" className="market-operations-bar__budget" onClick={() => setOpen(true)}
        aria-label="Abrir presupuesto de mercado">
        <span>PRESUPUESTO</span><strong>{playerBudget === null ? '—' : formatMoney(playerBudget.remainingPlayerSalaryBudget)}</strong><small>Jugadores</small><b>↗</b>
      </button>
      <div className="market-operations-bar__staff">
        <span>SCOUTING</span><strong>{staff.length} staff</strong><small>{staff.filter((entry) => calculateStaffWorkload(world, entry.staffPersonId).overloaded).length} sobrecargados</small>
      </div>
      <div className="market-operations-bar__actions">
        <button onClick={() => navigateToStaffDepartment('scouting')} type="button">Mi departamento</button>
        <button onClick={() => navigateToStaffMarket('scouting')} type="button">Contratar scout</button>
        <button onClick={onOpenScouting} type="button">Asignar misiones</button>
      </div>
    </div>
    {open && <div className="market-quick-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section aria-label="Presupuesto y decisiones de mercado" aria-modal="true" className="market-quick-modal" role="dialog">
        <header><div><span>PRESUPUESTO · {world.currentDate}</span><h2>Mercado y scouting</h2></div><button aria-label="Cerrar presupuesto" onClick={() => setOpen(false)} type="button">×</button></header>
        <div className="market-quick-modal__figures">
          <div><small>SALARIOS JUGADORES</small><strong>{playerBudget === null ? '—' : formatMoney(playerBudget.remainingPlayerSalaryBudget)}</strong><span>{playerBudget === null ? 'Sin datos financieros' : `${formatMoney(playerBudget.currentPlayerPayroll)} / ${formatMoney(playerBudget.playerSalaryBudget)} comprometidos`}</span>{playerBudget !== null ? <div className="market-quick-modal__track"><i style={{width:Math.max(0, Math.min(100,playerBudget.budgetUsageRatio*100))+'%'}} /></div> : null}</div>
          <div><small>SALARIOS STAFF</small><strong>{staffBudget === null ? '—' : formatMoney(staffBudget.remainingBudget)}</strong><span>{staffBudget === null ? 'Sin datos financieros' : `${formatMoney(staffBudget.activeAnnualSalary)} / ${formatMoney(staffBudget.budget)} comprometidos`}</span>{staffBudget !== null ? <div className="market-quick-modal__track"><i style={{width:Math.max(0, Math.min(100,staffBudget.budget > 0 ? staffBudget.activeAnnualSalary/staffBudget.budget*100 : 0))+'%'}} /></div> : null}</div>
        </div>
        <div className="market-quick-modal__check">
          <h3>Comprobar salario de fichaje</h3>
          <label>Salario anual propuesto<input aria-label="Salario anual propuesto" inputMode="numeric" min="0" step="1" type="number" value={salary} onChange={(event)=>setSalary(event.target.value)} placeholder="Ej. 250000" /></label>
          <div aria-live="polite">{valid && playerBudget === null ? <span>Presupuesto de jugadores no disponible.</span> : valid ? <strong className={affordable ? 'is-ok':'is-over'}>{affordable ? 'Dentro del margen salarial' : 'Supera el presupuesto de jugadores'}</strong> :
            <span>Introduce un importe anual.</span>}</div>
          {valid && playerBudget !== null ? <small>Margen tras la propuesta: {formatMoney(playerBudget.remainingPlayerSalaryBudget - proposed)}</small> : null}
        </div>
        <div className="market-quick-modal__staff"><div><h3>Departamento de scouting</h3><small>{staff.length} empleados · No existe un presupuesto separado de scouting en el modelo financiero actual.</small></div>
        {staff.length === 0 ? <p>Sin scouts empleados.</p> : staff.slice(0, 5).map((item)=>{
          const person=world.staffPeopleById[item.staffPersonId]
          const load=calculateStaffWorkload(world,item.staffPersonId)
          return <button key={item.staffPersonId} onClick={() => { setOpen(false);navigateToStaff(item.staffPersonId) }} type="button"><span>{person?.identity.firstName} {person?.identity.lastName}<small>{STAFF_ROLE_LABELS[item.role]}</small></span><b>{load.totalCapacityUsed}/{load.capacityLimit}</b></button>
        })}
        </div>
        <footer>
          <button type="button" onClick={() => { setOpen(false);onOpenFreeAgents() }}>Agentes libres</button>
          <button type="button" onClick={() => { setOpen(false);navigateToStaffMarket('scouting') }}>Contratar scout</button>
          <button type="button" onClick={() => { setOpen(false);onOpenScouting() }}>Scouting</button>
        </footer>
      </section>
    </div>}
  </>
}
