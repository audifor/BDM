import { useMemo, useState } from 'react'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { calculateStaffRoleProficiencyByRoleId, STAFF_ROLE_IDS, type StaffRoleId } from '@/domain/staff'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import { navigateToStaff } from '@/ui-ng/workspace/workspaceApps'

interface LeagueContext {id:string;name:string;teamIds:readonly TeamId[];season:string}
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
interface RankRow {teamId:TeamId;teamName:string;score:number;people:readonly {id:string;name:string;score:number}[]}
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
/** Comparisons are exact same edition, same Staff role and team-average proficiency. */
export function StaffCourtsideIntelligence({world,teamId}:{readonly world:GameWorld;readonly teamId:TeamId}){
  const contexts=useMemo(()=>staffLeagueContexts(world,teamId),[world,teamId])
  const [selectedContext,setSelectedContext]=useState<string>('')
  const [selectedRole,setSelectedRole]=useState<StaffRoleId>('assistantCoach')
  const context=contexts.find(item=>item.id===selectedContext)??contexts[0]
  const availableRoles=useMemo(()=>STAFF_ROLE_IDS.filter(role=>
    context!==undefined&&Object.values(world.teamStaffAssignmentsById).some(assignment=>
      context.teamIds.includes(assignment.teamId)&&assignment.role===role)),[context,world])
  const role=availableRoles.includes(selectedRole)?selectedRole:availableRoles[0]
  const rows=role===undefined||context===undefined?[]:staffRoleLeagueRows(world,context.teamIds,role)
  const user=rows.find(row=>row.teamId===teamId)
  const mean=rows.length===0?undefined:Math.round(rows.reduce((n,r)=>n+r.score,0)/rows.length)
  const rank=user===undefined?undefined:rows.findIndex(row=>row.teamId===teamId)+1
  return <div className="cs-staff-intelligence">
    <div className="cs-staff-operational-head">
      <div className="cs-staff-operational-head__identity">
        <div className="cs-staff-eyebrow">ANÁLISIS DE COMPETICIÓN</div>
        <h1>STAFF INTELLIGENCE</h1>
        <p>Especialistas del mismo puesto · competición y edición verificadas</p>
      </div>
      <div className="cs-staff-filters">
      <label>COMPETICIÓN / EDICIÓN<select aria-label="Competición de comparación" value={context?.id??''}
        onChange={e=>setSelectedContext(e.target.value)}>
        {contexts.map(item=><option value={item.id} key={item.id}>{item.name} · {item.season}</option>)}
      </select></label>
      <label>ESPECIALIDAD<select aria-label="Rol de comparación" value={role??''} onChange={e=>setSelectedRole(e.target.value as StaffRoleId)}>
        {availableRoles.map(id=><option key={id} value={id}>{STAFF_ROLE_LABELS[id]}</option>)}
      </select></label>
      </div>
    </div>
    {context===undefined||role===undefined?<section className="cs-staff-empty">
      No existe una edición de competición vinculada al equipo con personal comparable.
    </section>:<>
      <div className="cs-staff-intelligence-grid">
        <section className="cs-staff-rankings"><h2>COMPARACIÓN ENTRE CLUBES</h2>
          {rows.length<2&&<p className="cs-staff-empty">Sin suficientes clubes con personal asignado para establecer una comparación.</p>}
          {rows.map((row,i)=><div className={'cs-staff-rankings__row'+(row.teamId===teamId?' is-own':'')} key={row.teamId}>
            <span>{i+1}</span><strong>{row.teamName}</strong>
            <div className="cs-staff-rankings__bar"><span style={{width:`${row.score}%`}}/></div>
            <b>{row.score}</b>
          </div>)}
        </section>
        <aside className="cs-staff-rankings__inspect">
          <div className="cs-staff-kpis cs-staff-kpis--side">
        <div><strong>{user?.score??'—'}</strong><span>TU CLUB · MEDIA POR EMPLEADO</span></div>
        <div><strong>{mean??'—'}</strong><span>MEDIA DE EQUIPOS CON ESTE ROL</span></div>
        <div><strong>{rank===undefined?'—':`${rank}/${rows.length}`}</strong><span>POSICIÓN ENTRE EQUIPOS CON DATOS</span></div>
        <div><strong>{context.teamIds.length}</strong><span>PARTICIPANTES DE LA EDICIÓN</span></div>
      </div>
          <h2>TU EQUIPO EN ESTE PUESTO</h2>
          {user===undefined?<p>No hay empleados asignados a este rol.</p>:user.people.map(person=>
            <button type="button" key={person.id} onClick={()=>navigateToStaff(person.id as never)}>
              <strong>{person.name}</strong><span>{person.score}/100 · VER PERFIL ↗</span>
            </button>)}
          <p>La puntuación mide idoneidad profesional para este rol, no impacto observado ni resultados deportivos. Se promedia por equipo, no se mezclan empleados de otras funciones.</p>
        </aside>
      </div>
    </>}
  </div>
}