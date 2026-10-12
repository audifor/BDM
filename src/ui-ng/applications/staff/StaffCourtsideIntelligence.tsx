import { useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { calculateStaffRoleProficiencyByRoleId, STAFF_ROLE_IDS, type StaffRoleId } from '@/domain/staff'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { navigateToStaff } from '@/ui-ng/workspace/workspaceApps'

interface LeagueContext {readonly id:string;readonly name:string;readonly teamIds:readonly TeamId[];readonly season:string}
export function staffLeagueContexts(world:GameWorld,teamId:TeamId):readonly LeagueContext[]{
  const seasons=Object.values(world.seasons).filter(season=>{
    const comp=world.competitions[season.competitionId]
    return (season.participantTeamIds??comp?.participantTeamIds??[]).includes(teamId)
  })
  const current=world.seasons[world.currentSeasonId]
  return seasons.sort((a,b)=>Number(b.id===current?.id)-Number(a.id===current?.id)||b.startDate.localeCompare(a.startDate))
    .map(s=>({id:s.id,name:world.competitions[s.competitionId]?.name??String(s.competitionId),
      teamIds:s.participantTeamIds??world.competitions[s.competitionId]?.participantTeamIds??[],season:s.label}))
}
interface RankRow {readonly teamId:TeamId;readonly teamName:string;readonly score:number;readonly people:readonly {id:string;name:string;score:number}[]}
export function staffRoleLeagueRows(world:GameWorld,teamIds:readonly TeamId[],role:StaffRoleId):readonly RankRow[]{
  const ids=new Set(teamIds)
  const grouped=new Map<TeamId,{id:string;name:string;score:number}[]>()
  for(const assignment of Object.values(world.teamStaffAssignmentsById)){
    if(!ids.has(assignment.teamId)||assignment.role!==role)continue
    const person=world.staffPeopleById[assignment.staffPersonId]
    if(person===undefined)continue
    const group=grouped.get(assignment.teamId)??[]
    group.push({id:person.id,name:person.identity.firstName+' '+person.identity.lastName,
      score:calculateStaffRoleProficiencyByRoleId(person,role)})
    grouped.set(assignment.teamId,group)
  }
  return [...grouped].map(([id,people])=>({
    teamId:id,teamName:world.teams[id]?.name??String(id),
    score:Math.round(people.reduce((s,p)=>s+p.score,0)/people.length),people,
  })).sort((a,b)=>b.score-a.score||a.teamName.localeCompare(b.teamName))
}
interface RoleCompare {readonly role:StaffRoleId;readonly rows:readonly RankRow[];readonly ours:RankRow|undefined;readonly mean:number;readonly rank:number|undefined}
export function StaffCourtsideIntelligence({world,teamId}:{readonly world:GameWorld;readonly teamId:TeamId}){
  const contexts=useMemo(()=>staffLeagueContexts(world,teamId),[world,teamId])
  const [selectedContext,setSelectedContext]=useState('')
  const [selectedRole,setSelectedRole]=useState<StaffRoleId>('assistantCoach')
  const [expanded,setExpanded]=useState(false)
  const [selectedRival,setSelectedRival]=useState('')
  const context=contexts.find(c=>c.id===selectedContext)??contexts[0]
  const comparisons=useMemo<readonly RoleCompare[]>(()=>{
    if(context===undefined)return []
    const present=new Set(Object.values(world.teamStaffAssignmentsById)
      .filter(a=>context.teamIds.includes(a.teamId)).map(a=>a.role))
    return STAFF_ROLE_IDS.filter(role=>present.has(role)).map(role=>{
      const rows=staffRoleLeagueRows(world,context.teamIds,role)
      const ours=rows.find(r=>r.teamId===teamId)
      return {role,rows,ours,mean:Math.round(rows.reduce((sum,r)=>sum+r.score,0)/rows.length),
        rank:ours===undefined?undefined:rows.findIndex(r=>r.teamId===teamId)+1}
    }).sort((a,b)=>Number(b.ours!==undefined)-Number(a.ours!==undefined)||
      (a.ours?.score??0)-a.mean-( (b.ours?.score??0)-b.mean )||
      STAFF_ROLE_LABELS[a.role].localeCompare(STAFF_ROLE_LABELS[b.role]))
  },[context,world,teamId])
  const active=comparisons.find(x=>x.role===selectedRole)??comparisons[0]
  const rivals=active?.rows.filter(x=>x.teamId!==teamId)??[]
  const rival=rivals.find(x=>x.teamId===selectedRival)??rivals[0]
  const difference=active?.ours===undefined?undefined:active.ours.score-active.mean
  const printableDiff=(value:number)=>`${value>0?'+':''}${value}`
  return <div className="cs-staff-intelligence cs-staff-comparison">
    <header className="cs-staff-operational-head">
      <div className="cs-staff-operational-head__identity">
        <div className="cs-staff-eyebrow">DIAGNÓSTICO DEL CUERPO TÉCNICO</div>
        <h1>STAFF INTELLIGENCE</h1>
        <p>Detecta fortalezas y carencias reales por especialidad, frente a tu competición.</p>
      </div>
      <label className="cs-staff-comparison__edition">COMPETICIÓN / EDICIÓN
        <select aria-label="Competición de comparación" value={context?.id??''}
          onChange={e=>{setSelectedContext(e.target.value);setSelectedRival('');setExpanded(false)}}>
          {contexts.map(c=><option value={c.id} key={c.id}>{c.name} · {c.season}</option>)}
        </select>
      </label>
    </header>
    {context===undefined||active===undefined?<p className="cs-staff-empty">
      No hay especialidades comparables en una edición de competición del club.
    </p>:<>
      <div className="cs-staff-comparison__layout">
        <section className="cs-staff-comparison__roles" aria-label="Radiografía por especialidad">
          <div className="cs-staff-section-heading"><h2>RADIOGRAFÍA DEL CLUB</h2>
            <span>Selecciona una especialidad para ver su contexto competitivo</span></div>
          <div className="cs-staff-comparison__role-grid">
            {comparisons.map(item=>{
              const delta=item.ours===undefined?undefined:item.ours.score-item.mean
              return <button type="button" key={item.role} onClick={()=>{setSelectedRole(item.role);setExpanded(false);setSelectedRival('')}}
                className={'cs-staff-comparison__role'+(active.role===item.role?' is-selected':'')}
                aria-pressed={active.role===item.role} aria-label={'Comparar '+STAFF_ROLE_LABELS[item.role]}>
                <span className="cs-staff-comparison__role-name">{STAFF_ROLE_LABELS[item.role]}</span>
                <span className="cs-staff-comparison__role-figures">
                  <strong>{item.ours?.score??'—'}</strong><span>/ {item.mean} media liga</span>
                  <b className={delta===undefined?'is-unknown':delta>=0?'is-positive':'is-negative'}>
                    {delta===undefined?'Sin empleado':printableDiff(delta)}
                  </b>
                </span>
                <span className="cs-staff-comparison__role-rank">{item.rank===undefined?
                  'Sin representación del club':`${item.rank}º de ${item.rows.length} equipos con datos`}</span>
              </button>
            })}
          </div>
          <p className="cs-staff-comparison__method">Idoneidad para el puesto, no rendimiento observado.
            La media solo incluye clubes de esta edición con empleados asignados a esa misma función.</p>
        </section>
        <aside className="cs-staff-comparison__focus" aria-label="Detalle competitivo del puesto">
          <span className="cs-staff-eyebrow">ANÁLISIS SELECCIONADO</span>
          <h2>{STAFF_ROLE_LABELS[active.role]}</h2>
          <div className="cs-staff-comparison__scoreline">
            <div><strong>{active.ours?.score??'—'}</strong><span>TU CLUB</span></div>
            <div><strong>{active.mean}</strong><span>MEDIA LIGA</span></div>
            <div><strong className={difference===undefined?'':difference>=0?'is-positive':'is-negative'}>
              {difference===undefined?'—':printableDiff(difference)}</strong><span>DIFERENCIA</span></div>
          </div>
          <p>{active.ours===undefined?'No hay personal asignado a este puesto en tu club.':
            difference===0?'Tu equipo coincide con la media de idoneidad de los clubes comparables.':
            difference!==undefined&&difference>0?
              'Tu equipo está por encima de la media de idoneidad para este puesto.':
              'Tu equipo está por debajo de la media de idoneidad para este puesto.'}</p>
          <h3>TUS PROFESIONALES</h3>
          {active.ours===undefined?<p>No hay empleados asignados en este puesto.</p>:
            active.ours.people.map(person=><button type="button" className="cs-staff-comparison__person" key={person.id}
              onClick={()=>navigateToStaff(person.id as never)}><span>{person.name}</span>
              <strong>{person.score}/100 ↗</strong></button>)}
          {rivals.length>0&&<div className="cs-staff-comparison__versus">
            <h3>CONTRASTE CON OTRO CLUB</h3>
            <select aria-label="Comparar con club rival" value={rival?.teamId??''} onChange={e=>setSelectedRival(e.target.value)}>
              {rivals.map(r=><option value={r.teamId} key={r.teamId}>{r.teamName}</option>)}
            </select>
            <div><span>{world.teams[teamId]?.name} · {active.ours?.score??'—'}</span>
              <span>{rival?.teamName} · {rival?.score??'—'}</span></div>
          </div>}
        </aside>
      </div>
      <section className="cs-staff-comparison__standings" aria-label="Clasificación completa por especialidad">
        <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
          {expanded?'OCULTAR CLASIFICACIÓN':'VER CLASIFICACIÓN COMPLETA'} · {STAFF_ROLE_LABELS[active.role]} <span>{expanded?'−':'+'}</span>
        </button>
        {expanded&&<div className="cs-staff-comparison__standing-list">
          {active.rows.map((r,i)=><div className={r.teamId===teamId?'is-own':''} key={r.teamId}>
            <span>{i+1}º</span><strong>{r.teamName}</strong><span>{r.people.length} profesional{r.people.length===1?'':'es'}</span><b>{r.score}</b>
          </div>)}
        </div>}
      </section>
    </>}
  </div>
}
