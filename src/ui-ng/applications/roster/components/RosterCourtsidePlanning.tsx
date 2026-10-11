import { useMemo, useState } from 'react'
import type { Player } from '@/domain/player'
import type { GameWorld } from '@/domain/world'
import { getCurrentPlayerContract } from '@/domain/world'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'

/** Confirmed-contract-only planning. This is not a future squad simulation. */
export function RosterCourtsidePlanning({world,roster,onOpenPlayer}:{
  readonly world:GameWorld
  readonly roster:readonly Player[]
  readonly onOpenPlayer:(destination:EntityDestination)=>void
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
  const rows=useMemo(()=>roster.map(player=>{
    const contract=getCurrentPlayerContract(world,player.id)
    const status=contract===undefined?'Sin contrato activo':
      contract.term.expiresOn<cutoff.date?'Sin cobertura confirmada para esta fecha':
      contract.term.expiresOn===cutoff.date?'Vence en fecha de corte':'Contrato vigente en fecha de corte'
    return {player,contract,status,confirmed:contract!==undefined&&contract.term.expiresOn>=cutoff.date}
  }),[roster,world,cutoff.date])
  return <section className="roster-v4-planning" aria-label="Planificar plantilla">
    <header className="roster-v4__section-title">
      <div><span>OPERACIONES / PLANIFICACIÓN DE PLANTILLA</span><h2>PLANIFICAR PLANTILLA</h2>
        <p>Proyección de cobertura contractual confirmada, no de resultados o fichajes futuros.</p></div>
      <strong>{rows.filter(row=>row.confirmed).length} / {roster.length} con contrato hasta la fecha de corte</strong>
    </header>
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
      <div><strong>{roster.length-cutoff.count}</strong><span>SIN COBERTURA CONFIRMADA</span></div>
      <div><strong>{roster.length}</strong><span>JUGADORES DEL ROSTER ACTUAL</span></div>
    </div>
    <div className="roster-v4-planning__table-wrap">
      <table className="roster-v4-planning__table">
        <thead><tr><th>JUGADOR</th><th>POSICIÓN</th><th>CONTRATO ACTUAL</th><th>COBERTURA A {cutoff.date}</th><th>GESTIÓN</th></tr></thead>
        <tbody>{rows.map(({player,contract,status,confirmed})=><tr key={player.id}>
          <td>{player.firstName} {player.lastName}</td><td><span className="roster-v4-planning__position">{player.basketball.primaryPosition}</span></td>
          <td>{contract?.term.expiresOn??'—'}</td>
          <td><span className={confirmed?'is-confirmed':'is-unconfirmed'}>{status}</span></td>
          <td><button type="button" onClick={()=>onOpenPlayer({type:'player',playerId:player.id,section:'contract'})}>ABRIR CONTRATO ↗</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="roster-v4-planning__note">Las futuras firmas, renovaciones, inscripciones y bajas dependen del juego y pueden modificar esta situación. Este tablero no crea transacciones ni anticipa acuerdos.</p>
  </section>
}
