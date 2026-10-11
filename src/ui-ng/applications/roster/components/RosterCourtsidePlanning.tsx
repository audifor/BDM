import { useMemo, useState } from 'react'
import type { Player } from '@/domain/player'
import type { GameWorld } from '@/domain/world'
import { getCurrentPlayerContract } from '@/domain/world'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import type { BasketballPosition } from '@/domain/primitives'
import { ROSTER_MANAGER_PRIORITY_LABEL, type RosterManagerPriorities, type RosterManagerPriority, type RosterManagerStatus } from '../rosterManagerPlan'

/** Confirmed-contract-only planning. This is not a future squad simulation. */
export function RosterCourtsidePlanning({world,roster,onOpenPlayer,status,priorities,onSetPriority,onOpenDepth,canManage}:{
  readonly world:GameWorld
  readonly roster:readonly Player[]
  readonly onOpenPlayer:(destination:EntityDestination)=>void
  readonly status:RosterManagerStatus
  readonly priorities:RosterManagerPriorities
  readonly onSetPriority:(position:BasketballPosition,priority:RosterManagerPriority|undefined)=>void
  readonly onOpenDepth:()=>void
  readonly canManage:boolean
}) {
  const [offset,setOffset]=useState<0|1|2>(0)
  const currentSeason=world.seasons[world.currentSeasonId]
  const reference=currentSeason?.endDate??world.currentDate
  const cutoffYear=Number(reference.slice(0,4))
  const horizon=useMemo(()=>[0,1,2].map(i=>{
    const date=(cutoffYear+i)+reference.slice(4)
    const count=roster.filter(player=>{
      const contract=getCurrentPlayerContract(world,player.id)
      return contract!==undefined&&contract.term.expiresOn>=date
    }).length
    return {year:cutoffYear+i,date,count}
  }),[world,roster,cutoffYear,reference])
  const cutoff=horizon[offset]!
  const knownContracts=roster.filter(player=>getCurrentPlayerContract(world,player.id)!==undefined).length
  const rows=useMemo(()=>roster.map(player=>{
    const contract=getCurrentPlayerContract(world,player.id)
    const status=contract===undefined?'No consta contrato activo':
      contract.term.expiresOn<cutoff.date?'Sin cobertura confirmada para esta fecha':
      contract.term.expiresOn===cutoff.date?'Vence en fecha de corte':'Contrato vigente en fecha de corte'
    return {player,contract,status,confirmed:contract!==undefined&&contract.term.expiresOn>=cutoff.date}
  }),[roster,world,cutoff.date])
  return <section className="roster-v4-planning" aria-label="Planificar plantilla">
    <header className="roster-v4__section-title">
      <div><span>OPERACIONES / PLANIFICACIÓN DE PLANTILLA</span><h2>PLANIFICAR PLANTILLA</h2>
        <p>Proyección de cobertura contractual confirmada, no de resultados o fichajes futuros.</p></div>
      <strong>{knownContracts===0?'SIN DATOS CONTRACTUALES REGISTRADOS':`${rows.filter(row=>row.confirmed).length} / ${roster.length} con contrato confirmado`}</strong>
    </header>
    <section className="roster-manager-positions" aria-label="Objetivos por posición">
      <div className="roster-manager-positions__heading">
        <div><strong>TU PLAN DE PLANTILLA</strong><span>Decide dónde consolidar, desarrollar o estudiar incorporaciones</span></div>
        <button type="button" onClick={onOpenDepth}>VER ROTACIÓN ↗</button>
      </div>
      <div className="roster-manager-positions__grid">
        {status.positions.map(({position,count,isStarterAssigned})=><article key={position}
          className={'roster-manager-positions__card'+(priorities[position]?' has-decision':'')}>
          <div className="roster-manager-positions__line">
            <strong>{position}</strong><span>{count} jugador{count===1?'':'es'} · {isStarterAssigned?'Titular asignado':'Titular pendiente'}</span>
          </div>
          <div className="roster-manager-positions__options" role="group" aria-label={'Prioridad del mánager en '+position}>
            {(['keep','develop','explore'] as const).map(priority=><button type="button" key={priority}
              disabled={!canManage} aria-pressed={priorities[position]===priority}
              onClick={()=>onSetPriority(position,priorities[position]===priority?undefined:priority)}>
              {ROSTER_MANAGER_PRIORITY_LABEL[priority]}</button>)}
          </div>
          <p>{priorities[position]===undefined?'Sin prioridad definida':
            'Decisión registrada: '+ROSTER_MANAGER_PRIORITY_LABEL[priorities[position]]}</p>
        </article>)}
      </div>
      <p className="roster-manager-positions__note">
        Estas prioridades son notas de gestión locales a este entrenador, club y temporada.
        No ejecutan fichajes, entrenamientos ni conversaciones con jugadores.
      </p>
    </section>
    <div className="roster-v4-planning__horizons">
      {horizon.map((h,i)=><button key={h.year} aria-pressed={offset===i}
        className={offset===i?'is-active':''} type="button" onClick={()=>setOffset(i as 0|1|2)}>
        <span>{i===0?'TEMPORADA ACTUAL':i===1?'HORIZONTE +1':'HORIZONTE +2'}</span>
        <strong>{h.count}</strong>
        <small>Fecha de corte: {h.date}</small>
      </button>)}
    </div>
    <div className="roster-v4-planning__summary">
      <div><strong>{cutoff.count}</strong><span>CON COBERTURA CONTRACTUAL</span></div>
      <div><strong>{roster.length-cutoff.count}</strong><span>COBERTURA NO VERIFICABLE</span></div>
      <div><strong>{roster.length}</strong><span>JUGADORES DEL ROSTER ACTUAL</span></div>
    </div>
    <div className="roster-v4-planning__table-wrap">
      <table className="roster-v4-planning__table">
        <thead><tr><th>JUGADOR</th><th>POSICIÓN</th><th>CONTRATO ACTUAL</th><th>COBERTURA A {cutoff.date}</th><th>GESTIÓN</th></tr></thead>
        <tbody>{rows.map(({player,contract,status,confirmed})=><tr key={player.id}>
          <td>{player.firstName} {player.lastName}</td><td><span className="roster-v4-planning__position">{player.basketball.primaryPosition}</span></td>
          <td>{contract?.term.expiresOn??'—'}</td>
          <td><span className={confirmed?'is-confirmed':'is-unconfirmed'}>{status}</span></td>
          <td><button type="button" onClick={()=>onOpenPlayer({type:'player',playerId:player.id,section:'overview'})}>VER JUGADOR ↗</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="roster-v4-planning__note">La ausencia de contrato registrado no demuestra que un jugador esté libre. Las futuras firmas, renovaciones, inscripciones y bajas dependen del juego y pueden modificar esta situación. Este tablero no crea transacciones ni anticipa acuerdos.</p>
  </section>
}
