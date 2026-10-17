import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { calculateStaffWorkload } from '@/domain/world'
import { getRecruitmentFocusCandidates } from '@/app/scouting'
import { isScoutingStaffRole } from '@/ui-ng/applications/market/isScoutingStaffRole'
import { MarketOperationsBar } from '@/ui-ng/applications/market/MarketOperationsBar'
import { navigateToMarketTab } from '@/ui-ng/workspace/workspaceApps'
import { navigateToStaff, navigateToStaffDepartment, navigateToStaffMarket } from '@/ui-ng/workspace/workspaceApps'
import type { ScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'
import './scouting-war-room.css'

interface Props {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly model: ScoutingWorkspaceModel
  readonly embedded?: boolean
  readonly onOpenPlayer: (id: PlayerId) => void
  readonly onOpenReport: (id: string) => void
  readonly onOpenFocuses: () => void
  readonly onOpenAssignments: () => void
  readonly onOpenCoverage: () => void
  readonly onOpenKnowledge: () => void
  readonly onOpenReports: () => void
}

export function ScoutingWarRoom({ world, teamId, model, embedded = false, onOpenPlayer, onOpenReport, onOpenFocuses, onOpenAssignments, onOpenCoverage, onOpenKnowledge, onOpenReports }: Props) {
  const team = world.teams[teamId]
  if (team === undefined) return null
  const organizationId = team.organizationId
  const focuses = Object.values(world.scoutingRecruitmentFocusesById)
    .filter((focus) => focus.requestingTeamId === teamId && focus.status === 'ACTIVE')
    .sort((a, b) => a.name.localeCompare(b.name))
  const discoveries = Object.values(world.organizationPlayerAwarenessById)
    .filter((item) => item.organizationId === organizationId)
    .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt)).slice(0, 5)
  const scouts = Object.values(world.teamStaffAssignmentsById)
    .filter((item) => item.teamId === teamId && isScoutingStaffRole(item.role)
      && world.staffEmploymentByStaffId[item.staffPersonId]?.status === 'employed')
  const overloaded = scouts.filter((item) => calculateStaffWorkload(world, item.staffPersonId).overloaded)
  const staleKnowledge = model.knowledge.filter((item) => {
    const freshness = Number.parseFloat(item.freshnessLabel)
    return Number.isFinite(freshness) && freshness < 50 && !item.isOwnRoster
  }).slice(0, 3)
  const coverage = Object.values(world.scoutingTerritoryAssignmentsById)
    .filter((item) => item.organizationId === organizationId && item.status === 'ACTIVE')
  const queued = model.assignments.filter((item) => item.status === 'QUEUED').length
  const active = model.assignments.filter((item) => item.status === 'ACTIVE').length
  const completed = model.assignments.filter((item) => item.status === 'COMPLETED').length
  const visibleTotal = Math.max(1, queued + active + completed)
  const countReports = model.reports.length
  const coverageLabel = (territory: typeof coverage[number]['territory']) =>
    territory.kind === 'COUNTRY'
      ? world.countries[territory.countryId]?.name ?? territory.countryId
      : world.competitions[territory.competitionId]?.name ?? territory.competitionId

  return <div className="scouting-war" data-testid="scouting-war-room">
    {embedded ? null : <MarketOperationsBar world={world} teamId={teamId} onOpenScouting={onOpenAssignments}
      onOpenFreeAgents={() => navigateToMarketTab('free-agents')} />}
    <div className="scouting-war__compact-head"><strong>SCOUTING</strong><span>{scouts.length} scouts · {active} misiones activas · {coverage.length} territorios</span>
      <button onClick={onOpenFocuses} type="button">+ Crear foco</button>
      <button onClick={onOpenCoverage} type="button">Territorios</button>
      <button onClick={() => navigateToStaffDepartment('scouting')} type="button">Mi staff</button>
      <button onClick={() => navigateToStaffMarket('scouting')} type="button">Contratar scout</button>
    </div>
    <div className="scouting-war__staff-strip"><b>MI EQUIPO</b>
      {scouts.length === 0 ? <span>Sin scouts contratados</span> : scouts.slice(0, 5).map((item) => {
        const person = world.staffPeopleById[item.staffPersonId]
        const load = calculateStaffWorkload(world, item.staffPersonId)
        return <button key={item.staffPersonId} onClick={() => navigateToStaff(item.staffPersonId)} type="button">{person?.identity.firstName} {person?.identity.lastName} <span>{load.totalCapacityUsed}/{load.capacityLimit}</span></button>
      })}
    </div>
    <div className="scouting-war__kpis">
      <button onClick={onOpenFocuses} type="button"><small>Focos activos</small><strong>{focuses.length}</strong><span>Planificación</span></button>
      <button onClick={onOpenKnowledge} type="button"><small>Jugadores conocidos</small><strong>{model.knownSubjectCount}</strong><span>Conocimiento real</span></button>
      <button onClick={onOpenAssignments} type="button"><small>Misiones abiertas</small><strong>{model.openAssignmentCount}</strong><span>Asignaciones</span></button>
      <button onClick={onOpenReports} type="button"><small>Informes cerrados</small><strong>{countReports}</strong><span>Evidencias</span></button>
      <button onClick={onOpenCoverage} type="button"><small>Territorios activos</small><strong>{coverage.length}</strong><span>Red territorial</span></button>
    </div>
    <div className="scouting-war__layout">
      <section className="scouting-war__panel scouting-war__panel--wide">
        <header><div><span className="scouting-war__eyebrow">COBERTURA</span><h3>Operaciones abiertas</h3></div><button onClick={onOpenCoverage} type="button">Editar red →</button></header>
        <div className="scouting-war__network">
          <div className="scouting-war__rings" aria-label={coverage.length + ' territorios activos'}>
            <div className="scouting-war__ring scouting-war__ring--one" />
            <div className="scouting-war__ring scouting-war__ring--two" />
            <div className="scouting-war__ring scouting-war__ring--three" />
            <div className="scouting-war__ring-center"><b>{coverage.length}</b><span>zonas cubiertas</span></div>
          </div>
          <div className="scouting-war__territories">
            <h4>Territorios en observación</h4>
            {coverage.length === 0 ? <p>Sin cobertura activa.</p> : coverage.slice(0, 5).map((item) => <div key={item.id}><span className="scouting-war__signal" /><strong>{coverageLabel(item.territory)}</strong><small>ACTIVO</small></div>)}
            {coverage.length > 5 ? <p>{coverage.length - 5} territorios adicionales</p> : null}
          </div>
        </div>
      </section>
      <section className="scouting-war__panel">
        <header><div><span className="scouting-war__eyebrow">MISIONES</span><h3>Estado de las misiones</h3></div><button onClick={onOpenAssignments} type="button">Gestionar →</button></header>
        <div className="scouting-war__mission-bar" aria-label={queued + ' en cola, ' + active + ' activas, ' + completed + ' completadas'}>
          <span style={{ width: (100 * queued / visibleTotal) + '%' }} data-state="queued" />
          <span style={{ width: (100 * active / visibleTotal) + '%' }} data-state="active" />
          <span style={{ width: (100 * completed / visibleTotal) + '%' }} data-state="completed" />
        </div>
        <div className="scouting-war__mission-stats"><div><strong>{queued}</strong><span>En cola</span></div><div><strong>{active}</strong><span>En marcha</span></div><div><strong>{completed}</strong><span>Completadas</span></div></div>
        <div className="scouting-war__warning"><b>{scouts.length - overloaded.length} / {scouts.length}</b><span>Scouts sin sobrecarga</span></div>
      </section>
    </div>
    <div className="scouting-war__layout scouting-war__layout--triple">
      <section className="scouting-war__panel">
        <header><div><span className="scouting-war__eyebrow">FOCOS ACTIVOS</span><h3>Objetivos de búsqueda</h3></div><button onClick={onOpenFocuses} type="button">Ver focos →</button></header>
        <div className="scouting-war__feed">
          {focuses.length === 0 ? <p>Sin focos activos.</p> :
            focuses.slice(0, 4).map((focus) => {
              const candidates = getRecruitmentFocusCandidates(world, focus.id)
              return <div key={focus.id}><strong>{focus.name}</strong><span>{focus.positions.join(' · ')} · {candidates.length} candidatos encontrados · {focus.daysActive} días</span></div>
            })}
        </div>
      </section>
      <section className="scouting-war__panel">
        <header><div><span className="scouting-war__eyebrow">INFORMES</span><h3>Descubrimientos e informes</h3></div><button onClick={onOpenReports} type="button">Ver informes →</button></header>
        <div className="scouting-war__feed">
          {model.reports.slice(0, 3).map((report) => <div key={report.id}><button onClick={() => onOpenReport(report.id)} type="button">{report.playerName}</button><span>Informe · {report.missionLabel} · {report.createdLabel}</span></div>)}
          {discoveries.slice(0, 2).map((item) => {
            const player = world.players[item.playerId]
            return player === undefined ? null : <div key={item.id}><button onClick={() => onOpenPlayer(item.playerId)} type="button">{player.firstName} {player.lastName}</button><span>Identidad descubierta · {item.discoveredAt}</span></div>
          })}
          {model.reports.length === 0 && discoveries.length === 0 ? <p>Sin informes ni descubrimientos registrados.</p> : null}
        </div>
      </section>
      <section className="scouting-war__panel">
        <header><div><span className="scouting-war__eyebrow">PENDIENTES</span><h3>Alertas</h3></div></header>
        <div className="scouting-war__feed">
          {overloaded.map((item) => {
            const staff = world.staffPeopleById[item.staffPersonId]
            return <div key={item.staffPersonId}><strong>{staff?.identity.firstName} {staff?.identity.lastName}</strong><span>Scout sobrecargado</span><button onClick={onOpenAssignments} type="button">Reasignar prioridades →</button></div>
          })}
          {staleKnowledge.map((item) => <div key={item.playerId}><button onClick={() => onOpenPlayer(item.playerId)} type="button">{item.name}</button><span>Conocimiento desactualizado · frescura {item.freshnessLabel}</span></div>)}
          {overloaded.length === 0 && staleKnowledge.length === 0 ? <p>Sin alertas de carga ni actualización.</p> : null}
        </div>
      </section>
    </div>
  </div>
}
