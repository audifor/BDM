import { useMemo } from 'react'
import type { GameWorld } from '@/domain/world'
import { getTeamRoster } from '@/domain/world'
import { getPlayerAge } from '@/domain/player'
import type { TeamId } from '@/domain/ids'
import type { RosterBriefingModel, RosterLaneDiagnosis } from '@/ui-ng/applications/roster/buildRosterBriefing'

const DIAGNOSIS:Record<RosterLaneDiagnosis,string>={
  shortage:'SIN COBERTURA',thin:'COBERTURA REDUCIDA',balanced:'COBERTURA DE REFERENCIA',
  overload:'CONCENTRACIÓN ALTA',critical:'CONCENTRACIÓN MUY ALTA',
}

export function RosterCourtsideBriefing({model,world,teamId}:{
  readonly model:RosterBriefingModel
  readonly world:GameWorld
  readonly teamId:TeamId
}) {
  const ages=useMemo(()=>{
    const ageBuckets=[0,0,0,0,0]
    for(const player of getTeamRoster(world,teamId)){
      const age=getPlayerAge(world,player.id)
      if(!Number.isFinite(age))continue
      ageBuckets[age<=20?0:age<=24?1:age<=28?2:age<=32?3:4]!++
    }
    return ageBuckets
  },[world,teamId])
  const ageMax=Math.max(1,...ages)
  const positionAlerts=model.lanes.filter(lane=>lane.diagnosis==='shortage'||lane.diagnosis==='thin')
  return <section className="roster-briefing roster-v4-briefing" data-ng-region="roster-briefing">
    <header className="roster-v4__section-title">
      <div><span>INFORME DE EQUIPO / ANÁLISIS</span><h2>BRIEFING</h2>
        <p>Diagnóstico basado en el estado actual del equipo. Sin recomendaciones inventadas.</p></div>
      <strong>{model.rosterCount} jugadores · {model.unassignedCount} sin rol · {model.injuredCount} baja(s)</strong>
    </header>
    <div className="roster-v4-briefing__metrics">
      {[
        {title:'JUGADORES',value:model.rosterCount,note:'En roster actual'},
        {title:'CON LESIÓN ACTUAL',value:model.injuredCount,note:'Según registros médicos'},
        {title:'SIN ROL ASIGNADO',value:model.unassignedCount,note:'Quinteto y banquillo'},
        {title:'CONOCIMIENTO',value:`${model.knownSignalPercent}%`,note:'Señales disponibles'},
      ].map(item=><div className="roster-v4-briefing__metric" key={item.title}>
        <small>{item.title}</small><strong>{item.value}</strong><span>{item.note}</span>
      </div>)}
    </div>
    <div className="roster-v4-briefing__board">
      <article className="roster-v4-briefing__card roster-v4-briefing__coverage">
        <h3>COBERTURA POSICIONAL</h3><p>Jugadores por posición principal</p>
        <div className="roster-v4-briefing__position-list">
          {model.lanes.map(lane=><div className="roster-briefing__lane" key={lane.position}>
            <strong className="roster-v4-briefing__pos">{lane.position}</strong>
            <div className="roster-v4-briefing__position-track">
              <span style={{width:`${Math.min(100,lane.count/5*100)}%`}}/>
            </div>
            <strong>{lane.count}</strong><em>{DIAGNOSIS[lane.diagnosis]}</em>
          </div>)}
        </div>
        <small>Referencia orientativa de distribución 2–3 jugadores por puesto. No es una regla de inscripción de la competición.</small>
      </article>
      <article className="roster-v4-briefing__card roster-v4-briefing__age">
        <h3>ESTRUCTURA DE EDADES</h3><p>Distribución del roster actual</p>
        <div className="roster-v4-briefing__age-graph">
          {['≤20','21–24','25–28','29–32','33+'].map((label,i)=><div key={label}>
            <strong>{ages[i]}</strong>
            <span className="roster-v4-briefing__age-bar"><i style={{height:`${Math.max(4,ages[i]!/ageMax*100)}%`}}/></span>
            <small>{label}</small>
          </div>)}
        </div>
        <small>Rango real {model.ageMin??'—'}–{model.ageMax??'—'} años</small>
      </article>
      <article className="roster-v4-briefing__card roster-v4-briefing__contracts">
        <h3>SITUACIÓN CONTRACTUAL</h3><p>Tipos de vínculo disponibles en el mundo</p>
        <div className="roster-v4-briefing__contract-number"><strong>{model.contractedCount}</strong><span>CON CONTRATO REGISTRADO</span></div>
        <div className="roster-v4-briefing__contract-number"><strong>{model.scholarshipCount}</strong><span>SIN CONTRATO SALARIAL REGISTRADO</span></div>
        <small>La ausencia de registro salarial no demuestra que un jugador esté libre; también puede corresponder a otros tipos de vínculo.</small>
      </article>
      <article className="roster-v4-briefing__card roster-v4-briefing__alerts">
        <h3>ASUNTOS A REVISAR</h3><p>Señales constatables, no órdenes automáticas</p>
        {positionAlerts.length>0
          ?positionAlerts.map(lane=><div className="roster-v4-briefing__alert" key={lane.position}>
            <strong>{lane.position}</strong><span>{lane.count} jugador(es) en posición principal · {DIAGNOSIS[lane.diagnosis]}</span>
          </div>)
          :<div className="roster-v4-briefing__alert">Ninguna posición principal por debajo de dos jugadores.</div>}
        {model.injuredCount>0&&<div className="roster-v4-briefing__alert"><strong>MÉDICO</strong><span>{model.injuredCount} lesión(es) actuales. Consultar su ficha antes de decidir minutos.</span></div>}
        {model.unassignedCount>0&&<div className="roster-v4-briefing__alert"><strong>ROTACIÓN</strong><span>{model.unassignedCount} jugador(es) sin asignación. Revisar PROFUNDIDAD.</span></div>}
      </article>
    </div>
  </section>
}
