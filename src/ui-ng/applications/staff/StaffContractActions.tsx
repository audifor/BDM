import type { StaffPersonId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { isStaffContractActiveOn } from '@/domain/staffContract'
import { useGameStore } from '@/stores/gameStore'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import '@/ui-ng/applications/market/market-viability.css'

/**
 * F3 · the manager's own staff member: the contract that binds them to the club and the one canonical way to end it
 * (`fireStaffFromTeam`: contract terminated, assignments and responsibilities vacated, vacancy opened). The model defines no severance
 * for staff, so none is invented and the screen says so.
 */
export function StaffContractActions({ staffId }: { readonly staffId: StaffPersonId }) {
  const world = useGameStore((state) => state.world)
  const fireStaff = useGameStore((state) => state.fireStaff)
  const notice = useGameStore((state) => state.marketNotice)
  const clearNotice = useGameStore((state) => state.clearMarketNotice)
  if (world === null) return null
  const team = getUserTeam(world)
  const employment = world.staffEmploymentByStaffId[staffId]
  if (team === undefined || employment?.status !== 'employed' || employment.teamId !== team.id) return notice === null ? null : <p className="market-notice is-info" role="status">{notice.text} <button type="button" onClick={clearNotice}>×</button></p>
  const contract = Object.values(world.staffContractsById).find((item) => item.staffId === staffId && item.teamId === team.id && isStaffContractActiveOn(item, world.currentDate))
  return <section className="staff-contract-actions" aria-label="Contrato del staff" data-testid="staff-contract-actions">
    <strong>CONTRATO CON EL CLUB</strong>
    <span>{employment.roleId === undefined ? 'Staff' : STAFF_ROLE_LABELS[employment.roleId]} · desde {employment.startedOn ?? '—'}</span>
    <span>{contract === undefined ? 'Sin contrato vigente registrado' : `${contract.compensation.annualSalary.toLocaleString('es-ES')} / año · hasta ${contract.term.expiresOn}`}</span>
    <button type="button" onClick={() => { if (window.confirm('¿Rescindir el contrato? El modelo no define indemnización para el staff: no se calcula ni se carga ningún importe. Se abrirá una vacante.')) fireStaff(staffId) }}>Rescindir contrato</button>
    <small>Sin indemnización modelada: ninguna cantidad se inventa. Lo ya reconocido en Finance permanece.</small>
    {notice === null ? null : <p className={`market-notice is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text} <button type="button" onClick={clearNotice}>×</button></p>}
  </section>
}
