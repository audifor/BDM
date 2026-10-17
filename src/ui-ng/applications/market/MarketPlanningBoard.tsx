import { useMemo, useState } from 'react'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessContractRosterPlanning } from '@/engine/clubNeeds/ContractRosterPlanning'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import { formatMoney } from '@/ui/formatters'
import './market-planning-board.css'

interface Props {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly remainingSalaryBudget: number
  readonly onOpenPlayer: (playerId: PlayerId) => void
  readonly onOpenScouting: () => void
  readonly onOpenTargets: () => void
}
export function MarketPlanningBoard({ world, teamId, remainingSalaryBudget, onOpenPlayer, onOpenScouting, onOpenTargets }: Props) {
  const [horizonId, setHorizonId] = useState<string>('')
  const planning = useMemo(() => assessContractRosterPlanning(world, teamId), [world, teamId])
  const team = world.teams[teamId]
  if (team === undefined) return null
  const selected = planning.horizons.find((item) => item.id === horizonId) ??
    planning.horizons.find((item) => item.kind === 'SEASON_END') ??
    planning.horizons[0]
  if (selected === undefined) return null
  const focuses = Object.values(world.scoutingRecruitmentFocusesById).filter((item) => item.requestingTeamId === teamId && item.status === 'ACTIVE')
  const contracts = selected.unresolvedExpiries
  const riskPositions = new Set(selected.positionalContinuityRisks.map((item) => item.position))
  const positions = BASKETBALL_POSITIONS.map((position) => {
    const currentIds = team.rosterPlayerIds.filter((id) => world.players[id]?.basketball.primaryPosition === position)
    const retained = selected.contractuallyRetainedPlayerIds.filter((id) => world.players[id]?.basketball.primaryPosition === position)
    return { position, current: currentIds.length, retained: retained.length, atRisk: riskPositions.has(position), focuses: focuses.filter((focus) => focus.positions.includes(position)).length }
  })
  return <div className="market-plan" data-testid="market-planning">
    <div className="market-plan__header">
      <div><span className="market-cs__kicker">MERCADO · CONTRATOS</span><h2>Planificación de plantilla</h2>
        <p>Contratos, vencimientos y continuidad por posición.</p></div>
      <label>Horizonte<select aria-label="Horizonte de plantilla" value={selected.id} onChange={(event) => setHorizonId(event.target.value)}>
        {planning.horizons.map((item) => <option key={item.id} value={item.id}>{item.kind === 'AS_OF_DATE' ? 'Hoy' : item.kind === 'SEASON_END' ? 'Final de temporada' : 'Final de próxima temporada'} · {item.date}</option>)}
      </select></label>
    </div>
    <div className="market-plan__stats">
      <div><small>Jugadores actuales</small><strong>{planning.currentRosterCount}</strong><span>Plantilla hoy</span></div>
      <div><small>Contratos vigentes en horizonte</small><strong>{selected.contractuallyRetainedPlayerIds.length}</strong><span>{selected.date}</span></div>
      <div><small>Vencimientos sin sucesor</small><strong>{contracts.length}</strong><span>Hasta el horizonte elegido</span></div>
      <div><small>Margen salarial actual</small><strong className="market-plan__money">{formatMoney(remainingSalaryBudget)}</strong><span>Margen actual</span></div>
    </div>
    <div className="market-plan__grid">
      <section className="market-plan__panel">
        <header><div><span className="market-cs__kicker">CONTINUIDAD POR POSICIÓN</span><h3>Mapa de profundidad</h3></div><button onClick={onOpenTargets} type="button">Ver objetivos →</button></header>
        <div className="market-plan__positions">
          <div className="market-plan__positions-head"><span>Pos.</span><span>Hoy</span><span>Con contrato</span><span>Focos</span><span>Riesgo</span></div>
          {positions.map((row) => <div key={row.position} className="market-plan__position"><b>{row.position}</b><span>{row.current}</span><span>{row.retained}</span><span>{row.focuses}</span><strong className={row.atRisk ? 'is-risk' : ''}>{row.atRisk ? 'Continuidad' : 'Sin alerta'}</strong></div>)}
        </div>
        <p className="market-plan__footnote">Alerta por continuidad contractual.</p>
      </section>
      <section className="market-plan__panel">
        <header><div><span className="market-cs__kicker">FECHAS CRÍTICAS</span><h3>Contratos que requieren seguimiento</h3></div></header>
        {contracts.length === 0 ? <p className="market-plan__empty">No hay vencimientos sin sucesor registrado hasta este horizonte.</p> :
          <div className="market-plan__expires">{contracts.slice(0, 14).map((entry) => {
            const player = world.players[entry.playerId]
            return <div key={entry.contractId}>
              <button onClick={() => onOpenPlayer(entry.playerId)} type="button">{player?.firstName ?? 'Jugador'} {player?.lastName ?? ''}</button>
              <span>{entry.position} · {entry.currentRole}</span><strong>{entry.expiresOn}</strong>
            </div>
          })}</div>}
      </section>
    </div>
    <div className="market-plan__grid market-plan__grid--bottom">
      <section className="market-plan__panel"><header><div><span className="market-cs__kicker">PUESTOS A SEGUIR</span><h3>Focos de búsqueda</h3></div><button onClick={onOpenScouting} type="button">Gestionar red →</button></header>
        {focuses.length === 0 ? <p className="market-plan__empty">Sin focos activos.</p> :
          <div className="market-plan__focuses">{focuses.slice(0, 8).map((focus) => <div key={focus.id}><b>{focus.name}</b><span>{focus.positions.join(', ')} · {focus.daysActive} días</span></div>)}</div>}
      </section>
      <section className="market-plan__panel"><header><div><span className="market-cs__kicker">RECLUTAMIENTO</span><h3>Planificación de scouting</h3></div></header>
        <p className="market-plan__empty">Define perfiles de búsqueda y compara candidatos.</p>
        <div className="market-plan__actions"><button className="market-cs__primary" onClick={onOpenScouting} type="button">Planificar scouting</button><button className="market-cs__secondary" onClick={onOpenTargets} type="button">Comparar candidatos</button></div>
      </section>
    </div>
  </div>
}
