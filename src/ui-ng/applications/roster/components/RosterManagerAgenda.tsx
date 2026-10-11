import type { RosterManagerPriorities, RosterManagerStatus } from '../rosterManagerPlan'
import { ROSTER_MANAGER_PRIORITY_LABEL } from '../rosterManagerPlan'

export function RosterManagerRibbon({status,priorities,onDepth,onPlanning,onBriefing}:{
  readonly status:RosterManagerStatus
  readonly priorities:RosterManagerPriorities
  readonly onDepth:()=>void
  readonly onPlanning:()=>void
  readonly onBriefing:()=>void
}){
  const targeted=Object.entries(priorities).filter(([,value])=>value==='explore').map(([key])=>key)
  return <div className="roster-manager-ribbon" aria-label="Agenda del mánager">
    <span className="roster-manager-ribbon__eyebrow">TU DESPACHO</span>
    <button type="button" onClick={onDepth} aria-label="Abrir profundidad y completar quinteto">
      <strong>{status.startingCount}/5</strong><span>QUINTETO</span>
    </button>
    <button type="button" onClick={onDepth}><strong>{status.benchCount}/7</strong><span>BANQUILLO</span></button>
    <button type="button" onClick={onBriefing}><strong>{status.injuredAssignedCount}</strong><span>ASIGNADOS CON LESIÓN</span></button>
    <button type="button" onClick={onPlanning}>
      <strong>{targeted.length>0?targeted.join(' · '):'—'}</strong>
      <span>{targeted.length>0?'PUESTOS A ESTUDIAR':'PLAN DE PUESTOS'}</span>
    </button>
  </div>
}

export function RosterManagerAgenda({status,priorities,onDepth,onPlanning}:{
  readonly status:RosterManagerStatus
  readonly priorities:RosterManagerPriorities
  readonly onDepth:()=>void
  readonly onPlanning:()=>void
}){
  const planned=Object.entries(priorities).filter(([,value])=>value!==undefined)
  return <section className="roster-manager-agenda" aria-label="Decisiones del mánager">
    <header><div><span>HOJA DE RUTA / DIRECCIÓN DEPORTIVA</span><h3>DECISIONES PENDIENTES</h3></div>
      <span>LA SITUACIÓN CAMBIA AL ACTUAR EN EL JUEGO</span></header>
    <div className="roster-manager-agenda__cards">
      <article>
        <span className="roster-manager-agenda__step">01 / QUINTETO</span>
        <strong>{status.startingCount}/5 <small>puestos cubiertos</small></strong>
        <p>{status.missingStarterPositions.length===0?'Quinteto completo en la rotación actual.':
          'Por decidir: '+status.missingStarterPositions.join(' · ')+'.'}</p>
        <button type="button" onClick={onDepth}>GESTIONAR QUINTETO ↗</button>
      </article>
      <article>
        <span className="roster-manager-agenda__step">02 / DISPONIBILIDAD</span>
        <strong>{status.injuredAssignedCount} <small>asignados lesionados</small></strong>
        <p>{status.injuredAssignedCount===0
          ?status.injuredPlayerCount===0?'Sin lesiones activas en la plantilla.':
            status.injuredPlayerCount+' lesionados sin puesto asignado.'
          :'Revisar roles: hay lesionados entre los elegidos para jugar.'}</p>
        <button type="button" onClick={onDepth}>REVISAR ROTACIÓN ↗</button>
      </article>
      <article>
        <span className="roster-manager-agenda__step">03 / PLAN DE CLUB</span>
        <strong>{planned.length}/5 <small>puestos con objetivo</small></strong>
        <p>{planned.length===0?'Establece qué posiciones conservar, desarrollar o explorar.':
          planned.map(([position,goal])=>position+' · '+ROSTER_MANAGER_PRIORITY_LABEL[goal!]).join(' / ')}</p>
        <button type="button" onClick={onPlanning}>FIJAR PRIORIDADES ↗</button>
      </article>
    </div>
    <p className="roster-manager-agenda__disclaimer">
      Las asignaciones de rotación cambian el juego. Las prioridades por puesto son apuntes del mánager;
      no ejecutan fichajes, entrenamientos ni promesas automáticamente.
    </p>
  </section>
}
