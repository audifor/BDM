import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { formatMoney } from '@/ui/formatters'
import './market-command-centre.css'

interface Props {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly availableFreeAgents: number
  readonly remainingSalaryBudget: number
  readonly onOpenScouting: () => void
  readonly onOpenFreeAgents: () => void
  readonly onOpenExplore: () => void
  readonly onOpenTargets: () => void
  readonly onOpenPlanning: () => void
  readonly onOpenOperations: () => void
  readonly onOpenPlayer: (playerId: PlayerId) => void
}

export function MarketCommandCentre({ world, teamId, availableFreeAgents, remainingSalaryBudget, onOpenScouting, onOpenFreeAgents, onOpenExplore, onOpenTargets, onOpenPlanning, onOpenOperations, onOpenPlayer }: Props) {
  const team = world.teams[teamId]
  if (team === undefined) return null
  const organizationId = team.organizationId
  const focuses = Object.values(world.scoutingRecruitmentFocusesById)
    .filter((item) => item.requestingTeamId === teamId && item.status === 'ACTIVE')
    .sort((a, b) => a.name.localeCompare(b.name))
  const assignments = Object.values(world.scoutingAssignmentsById)
    .filter((item) => item.organizationId === organizationId && (item.status === 'ACTIVE' || item.status === 'QUEUED'))
  const awareness = Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId)
  const known = world.organizationKnowledge.filter((item) => item.organizationId === organizationId)
  const reports = Object.values(world.evaluatorReportsById)
    .filter((item) => item.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
  const negotiations = Object.values(world.negotiationsById).filter((item) => item.teamId === teamId)
  const coverage = Object.values(world.scoutingTerritoryAssignmentsById)
    .filter((item) => item.organizationId === organizationId && item.status === 'ACTIVE')
  const pipeline = [
    { label: 'Necesidades', number: focuses.length, description: 'Focos de búsqueda activos' },
    { label: 'Descubrimiento', number: awareness.length, description: 'Identidades descubiertas' },
    { label: 'Evaluación', number: assignments.length, description: 'Misiones en curso o en cola' },
    { label: 'Conocimiento', number: known.length, description: 'Expedientes con conocimiento' },
    { label: 'Operaciones', number: negotiations.length, description: 'Negociaciones registradas' },
  ]
  const lastReports = reports.flatMap((item) => {
    const player = world.players[item.subjectPlayerId]
    return player === undefined ? [] : [{ id: item.id, playerId: item.subjectPlayerId, name: player.firstName + ' ' + player.lastName, date: item.createdAt }]
  })
  const nextAction = assignments.length > 0
    ? { headline: 'Misiones abiertas', explanation: 'Misiones pendientes de seguimiento.', action: onOpenScouting, label: 'Abrir Scouting' }
    : focuses.length === 0
      ? { headline: 'Sin focos activos', explanation: 'Crea un foco de reclutamiento.', action: onOpenScouting, label: 'Crear un foco' }
      : { headline: 'Focos activos', explanation: 'Consulta candidatos y cobertura.', action: onOpenScouting, label: 'Revisar candidatos' }
  return (
    <div className="market-cs" data-testid="market-command-centre">
      <section className="market-cs__hero">
        <div className="market-cs__hero-copy">
          <span className="market-cs__kicker">MERCADO · {world.currentDate}</span>
          <h2>Centro de mercado</h2>
          <p>Scouting, jugadores, agentes libres y operaciones.</p>
          <div className="market-cs__actions">
            <button className="market-cs__primary" onClick={onOpenScouting} type="button">Abrir Scouting</button>
            <button className="market-cs__secondary" onClick={onOpenExplore} type="button">Explorar jugadores</button><button className="market-cs__secondary" onClick={onOpenTargets} type="button">Mesa de objetivos</button>
          </div>
        </div>
        <div aria-label="Estado del departamento" className="market-cs__orbit">
          <div className="market-cs__orbit-ring market-cs__orbit-ring--outer" />
          <div className="market-cs__orbit-ring market-cs__orbit-ring--inner" />
          <div className="market-cs__orbit-centre"><strong>{coverage.length}</strong><span>Territorios activos</span></div>
          <span className="market-cs__orbit-node market-cs__orbit-node--one" />
          <span className="market-cs__orbit-node market-cs__orbit-node--two" />
          <span className="market-cs__orbit-node market-cs__orbit-node--three" />
        </div>
      </section>
      <div className="market-cs__quick-links"><button onClick={onOpenPlanning} type="button">Planificar próxima temporada →</button><button onClick={onOpenFreeAgents} type="button">Consultar agentes libres →</button><button onClick={onOpenOperations} type="button">Seguir operaciones →</button></div>
      <div className="market-cs__metrics">
        <div><span>Focos activos</span><strong>{focuses.length}</strong><small>Focos de reclutamiento</small></div>
        <div><span>Jugadores conocidos</span><strong>{known.length}</strong><small>Expedientes</small></div>
        <div><span>Agentes libres</span><strong>{availableFreeAgents}</strong><small>Disponibles</small></div>
        <div><span>Presupuesto restante</span><strong className="market-cs__money">{formatMoney(remainingSalaryBudget)}</strong><small>Disponible para salarios</small></div>
      </div>
      <div className="market-cs__columns">
        <section className="market-cs__panel">
          <header><div><span className="market-cs__kicker">SEGUIMIENTO</span><h3>Actividad de mercado</h3></div><span>Estado actual</span></header>
          <div className="market-cs__pipeline">
            {pipeline.map((stage, index) => (
              <div className="market-cs__stage" key={stage.label}>
                <div className="market-cs__step">{String(index + 1).padStart(2, '0')}</div>
                <div><strong>{stage.label}</strong><small>{stage.description}</small></div>
                <b>{stage.number}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="market-cs__panel market-cs__panel--decision">
          <header><div><span className="market-cs__kicker">PENDIENTES</span><h3>{nextAction.headline}</h3></div></header>
          <p>{nextAction.explanation}</p>
          <button className="market-cs__primary" onClick={nextAction.action} type="button">{nextAction.label}</button>
          <div className="market-cs__decision-foot">
            <span>{negotiations.length} operaciones registradas</span>
            <button onClick={onOpenOperations} type="button">Ver operaciones →</button>
          </div>
        </section>
      </div>
      <div className="market-cs__columns market-cs__columns--bottom">
        <section className="market-cs__panel">
          <header><div><span className="market-cs__kicker">SCOUTING</span><h3>Focos de reclutamiento</h3></div><button onClick={onOpenScouting} type="button">Gestionar →</button></header>
          {focuses.length === 0 ? <p className="market-cs__empty">Sin focos activos.</p> :
            <div className="market-cs__compact-list">{focuses.slice(0, 4).map((focus) => <div key={focus.id}><strong>{focus.name}</strong><span>{focus.positions.join(' · ')} · {focus.daysActive} días</span></div>)}</div>}
        </section>
        <section className="market-cs__panel">
          <header><div><span className="market-cs__kicker">INFORMES</span><h3>Últimos informes</h3></div><button onClick={onOpenScouting} type="button">Ver todos →</button></header>
          {lastReports.length === 0 ? <p className="market-cs__empty">Sin informes registrados.</p> :
            <div className="market-cs__compact-list">{lastReports.map((report) => <div key={report.id}><button onClick={() => onOpenPlayer(report.playerId)} type="button">{report.name}</button><span>{report.date}</span></div>)}</div>}
        </section>
      </div>
    </div>
  )
}
