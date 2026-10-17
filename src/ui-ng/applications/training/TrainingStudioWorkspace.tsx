import { useMemo, useState, type ReactNode } from 'react'
import { getUserTeam } from '@/engine/calendar'
import { buildTrainingPlanningContext, canTeamTrainOnDate, nextEligibleTrainingDate } from '@/engine/training'
import { getCareerFatigueForPlayer, getTeamRoster } from '@/domain/world'
import { createEntityId, type PlayerId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import { TRAINING_CATALOG, type TrainingIntensity } from '@/domain/training'
import { emptyTrainingStudioPlan, putTrainingStudioPlan, type TrainingStudioPlan, type TrainingMacrocycle, type TrainingMesocycle } from '@/domain/training/TrainingStudioPlan'
import { BASKETBALL_RATING_KEYS } from '@/domain/player'
import { ATTRIBUTE_LABELS } from '@/ui/attributeLabels'
import { useGameStore } from '@/stores/gameStore'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { TrainingPcbPage, type TrainingPcbTab } from '@/ui/pcb-migrated/training/TrainingPcbPage'
import './training-studio.css'

type Section = 'planner' | 'individual' | 'development' | 'mentoring' | 'results'
type Scale = 'week' | 'month' | 'season'
const SECTIONS: readonly [Section,string][] = [['planner','PLANIFICADOR'],['individual','INDIVIDUAL'],['development','DESARROLLO'],['mentoring','MENTORING'],['results','RESULTADOS']]
const SCALES: readonly [Scale,string][] = [['week','Semana'],['month','Mes'],['season','Temporada']]
const TRAINABLE = TRAINING_CATALOG.filter(item => item.scope !== 'individual')
const DAY_MS = 86400000
const at = (date: string) => new Date(date + 'T12:00:00Z')
const plus = (date: string, days: number) => new Date(at(date).getTime() + days * DAY_MS).toISOString().slice(0,10)
const monday = (date: string) => plus(date, -((at(date).getUTCDay() + 6) % 7))
const monthStart = (date: string) => date.slice(0,7) + '-01'
const afterMonth = (date: string, delta: number) => { const d=at(monthStart(date));d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,10) }
const fmt = (date: string) => at(date).toLocaleDateString('es-ES',{day:'2-digit',month:'short',timeZone:'UTC'})
const full = (date: string) => at(date).toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'UTC'})
const title = (id: string) => TRAINING_CATALOG.find(item=>item.id===id)?.name ?? id
const baseMacro = (date:string):TrainingMacrocycle => ({id:'macro:'+createEntityId(),name:'Nuevo macrociclo',startDate:date,endDate:plus(date,83),objective:'Objetivo competitivo'})
const baseMeso = (macro:TrainingMacrocycle):TrainingMesocycle => ({id:'meso:'+createEntityId(),macrocycleId:macro.id,name:'Nuevo bloque',startDate:macro.startDate,endDate:plus(macro.startDate,Math.min(27,Math.floor((at(macro.endDate).getTime()-at(macro.startDate).getTime())/DAY_MS))),objective:'Trabajo técnico-táctico',moduleId:'offensiveSystem',intensity:'normal'})
const RATING_OPTIONS=BASKETBALL_RATING_KEYS
function mark(value:number, max=100){return <div className="cts-meter"><i style={{width:String(Math.max(0,Math.min(100,value/max*100)))+'%'}} /></div>}
function SectionTitle({eyebrow,heading,children}:{eyebrow:string;heading:string;children?:ReactNode}){return <div className="cts-titlebar"><div><div className="cts-eyebrow">{eyebrow}</div><h2>{heading}</h2></div><div className="cts-title-actions">{children}</div></div>}
export function TrainingStudioWorkspace({initialTab='planner'}:{initialTab?:Section}) {
 const world = useGameStore(state=>state.world)
 const [tab,setTab]=useState<Section>(initialTab)
 const [scale,setScale]=useState<Scale>('week')
 const [anchor,setAnchor]=useState<string|null>(null)
 const [message,setMessage]=useState('')
 const [advanced,setAdvanced]=useState<TrainingPcbTab|null>(null)
 const [chosenModule,setChosenModule]=useState('threePoint')
 const [intensity,setIntensity]=useState<TrainingIntensity>('normal')
 const [chosenPlayer,setChosenPlayer]=useState('')
 const [chosenRating,setChosenRating]=useState<string>('threePointShooting')
 const [chosenMentor,setChosenMentor]=useState('')
 const [chosenMentee,setChosenMentee]=useState('')
 const [chosenFocus,setChosenFocus]=useState('Profesionalidad')
 const [chosenDate,setChosenDate]=useState('')
 const [targetValue,setTargetValue]=useState(75)
 const [targetDate,setTargetDate]=useState('')
 const {openEntity}=useNgWorkspaceNavigation()
 const team=world===null?undefined:getUserTeam(world)
 const teamId=team?.id
 const roster=useMemo(()=>world && team?getTeamRoster(world,team.id):[],[world,team])
 const plan=world && teamId ? world.trainingStudioPlansByTeamId[teamId] ?? emptyTrainingStudioPlan(teamId,world.currentSeasonId):null
 const date=anchor??world?.currentDate??'2026-07-01'
 const mondayDate=monday(date)
 const sessions=useMemo(()=>world && teamId?Object.values(world.scheduledTrainingSessionsById).filter(item=>item.teamId===teamId):[],[world,teamId])
 const completed=sessions.filter(item=>item.status==='completed')
 const upcoming=sessions.filter(item=>item.status==='scheduled')
 const teamAvg=roster.length&&world?roster.reduce((s,p)=>s+getCareerFatigueForPlayer(world,p.id),0)/roster.length:0
 const context=world && team?buildTrainingPlanningContext(world,team.id):null
 const playerName=(id:string)=>{const p=world?.players[id as keyof typeof world.players];return p?p.firstName+' '+p.lastName:'Jugador'}
 const report=(action:()=>void,ok:string)=>{try{action();setMessage(ok)}catch(e){setMessage(e instanceof Error?e.message:'No se pudo aplicar la operación')}}
 const save=(next:TrainingStudioPlan,ok='Plan guardado')=>report(()=>{
   const current=useGameStore.getState().world
   if(current)useGameStore.getState().replaceWorld(putTrainingStudioPlan(current,next))
 },ok)
 const updateMacro=(id:string,patch:Partial<TrainingMacrocycle>)=>{if(plan)save({...plan,macrocycles:plan.macrocycles.map(item=>item.id===id?{...item,...patch}:item)})}
 const updateMeso=(id:string,patch:Partial<TrainingMesocycle>)=>{if(plan)save({...plan,mesocycles:plan.mesocycles.map(item=>item.id===id?{...item,...patch}:item)})}
 const schedule=(when:string,moduleId=chosenModule,load=intensity)=>{
   const current=useGameStore.getState().world
   if(!current||!team)return
   const def=TRAINING_CATALOG.find(item=>item.id===moduleId)
   if(!def)throw new Error('Módulo no encontrado')
   useGameStore.getState().scheduleTeamModuleSession({moduleId,date:when as GameDate,startTime:'10:00',durationMinutes:def.durationMinutes,sessionId:'studio:'+createEntityId(),intensity:load})
 }
 const generate=(blocks:readonly TrainingMesocycle[])=>report(()=>{
   if(!world||!team)return
   let count=0
   for(const block of blocks){
    for(let day=block.startDate;day<=block.endDate;day=plus(day,1)){
     const wd=at(day).getUTCDay()
     if(wd!==2&&wd!==4)continue
     const current=useGameStore.getState().world
     if(!current||day<=current.currentDate || !canTeamTrainOnDate(current,team.id,day as GameDate))continue
     if(Object.values(current.scheduledTrainingSessionsById).some(s=>s.teamId===team.id&&s.date===day))continue
     schedule(day,block.moduleId,block.intensity);count++
    }
   }
   setMessage(String(count)+' sesiones generadas. Las existentes se han conservado.')
 },'Plan aplicado')
 const openPlayer=(id:string)=>openEntity({type:'player',playerId:id as PlayerId,section:'overview'})
 if(!world||!team||!plan) return <div className="cts-studio cts-studio--empty">Training Studio necesita una partida con club asignado.</div>
 const activeSessions=(day:string)=>sessions.filter(s=>s.date===day)
 const activePhase=plan.macrocycles.find(m=>m.startDate<=date&&m.endDate>=date)
 const activeMeso=plan.mesocycles.find(m=>m.startDate<=date&&m.endDate>=date)
 const liveTeam=world
 return <div className="cts-studio" data-ng-region="training-studio">
  <header className="cts-header"><div className="cts-ident"><span className="cts-kicker">PERFORMANCE LAB / BASKET DYNASTY MANAGER</span><div><strong>TRAINING<span> STUDIO</span></strong><em>{team.name} · {world.currentSeasonId}</em></div></div><div className="cts-header-metrics"><span>FATIGA MEDIA <b>{teamAvg.toFixed(1)}%</b></span><span>SESIONES <b>{upcoming.length}</b></span><span>MENTORING <b>{plan.mentoringGroups.length}</b></span></div></header>
  <nav className="cts-tabs" aria-label="Secciones de Training Studio">{SECTIONS.map(([id,label])=><button className={tab===id?'active':''} key={id} onClick={()=>{setTab(id);setMessage('')}}>{label}</button>)}<button className="cts-tools" title="Acceso a todas las funciones de Training anterior" onClick={()=>setAdvanced('modules')}>MÓDULOS / STAFF <span>↗</span></button></nav>
  <main className="cts-content">
   {message&&<div className="cts-feedback" role="status"><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Cerrar aviso">×</button></div>}
   {tab==='planner'&&<>
    <SectionTitle eyebrow="CONSTRUYE LA IDENTIDAD DE TU EQUIPO" heading="PLANIFICACIÓN"><div className="cts-switch">{SCALES.map(([id,label])=><button className={scale===id?'active':''} key={id} onClick={()=>setScale(id)}>{label}</button>)}</div></SectionTitle>
    <div className="cts-summary">
     <div><small>MACROCICLO ACTIVO</small><strong>{activePhase?.name??'Sin fase definida'}</strong><span>{activePhase?.objective??'Define tu proyecto de temporada'}</span></div>
     <div><small>MESOCICLO ACTIVO</small><strong>{activeMeso?.name??'Sin bloque'}</strong><span>{activeMeso?.objective??'Crea un bloque de trabajo'}</span></div>
     <div><small>ESTADO FÍSICO</small><strong>{teamAvg.toFixed(1)}%</strong><span>Fatiga media observada</span>{mark(teamAvg)}</div>
     <div><small>PRÓXIMOS 7 DÍAS</small><strong>{context?.fixtureDensity.gamesNext7Days??0} partidos</strong><span>{context?.scheduledSessionsNext7Days??0} sesiones programadas</span></div>
    </div>
    {scale==='week'&&<>
      <div className="cts-toolbar"><div className="cts-step"><button onClick={()=>setAnchor(plus(mondayDate,-7))}>‹</button><strong>{fmt(mondayDate)} - {fmt(plus(mondayDate,6))}</strong><button onClick={()=>setAnchor(plus(mondayDate,7))}>›</button></div><div className="cts-actions"><button onClick={()=>{setAnchor(world.currentDate)}}>Hoy</button><button onClick={()=>report(()=>useGameStore.getState().scheduleAutomaticTeamTrainingWeek(mondayDate as GameDate),'Semana planificada')}>Generar semana automática</button></div></div>
      <div className="cts-week">
       {Array.from({length:7},(_,i)=>plus(mondayDate,i)).map((day,i)=><article key={day} className={'cts-day '+(day===world.currentDate?'today':'')}><header><span>{['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'][i]}</span><b>{fmt(day)}</b></header><div className="cts-day-events">{activeSessions(day).map(s=><div key={s.id} className={'cts-session '+(s.status==='completed'?'done':'')}><strong>{title(s.definitionId)}</strong><small>{s.startTime} · {s.intensity==='high'?'Alta':s.intensity==='light'?'Baja':'Media'}</small>{s.status==='scheduled'&&<button title="Cancelar" onClick={()=>report(()=>useGameStore.getState().cancelTrainingSession(s.id),'Sesión cancelada')}>×</button>}</div>)}{!activeSessions(day).length&&<span className="cts-rest">{canTeamTrainOnDate(world,team.id,day as GameDate)?'Descanso':'PARTIDO'}</span>}</div><button className="cts-add" disabled={day<=world.currentDate||!canTeamTrainOnDate(world,team.id,day as GameDate)} onClick={()=>report(()=>schedule(day),'Sesión programada')}>+ Sesión</button></article>)}
      </div>
      <div className="cts-columns"><div className="cts-panel"><h3>DISEÑAR UNA SESIÓN</h3><div className="cts-fields"><label>Ejercicio<select value={chosenModule} onChange={e=>setChosenModule(e.target.value)}>{TRAINABLE.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Intensidad<select value={intensity} onChange={e=>setIntensity(e.target.value as TrainingIntensity)}><option value="light">Baja</option><option value="normal">Media</option><option value="high">Alta</option></select></label><label>Fecha<input type="date" min={nextEligibleTrainingDate(world.currentDate)} value={chosenDate||nextEligibleTrainingDate(world.currentDate)} onChange={e=>setChosenDate(e.target.value)} /></label><button className="cts-primary" onClick={()=>report(()=>schedule(chosenDate||nextEligibleTrainingDate(world.currentDate)),'Sesión creada')}>PROGRAMAR</button></div></div><div className="cts-panel"><h3>CRITERIO DEL STAFF</h3><p>{context?.warnings.length?context.warnings.join(' · '):'Sin advertencias extraordinarias de planificación.'}</p><p>La carga, el calendario y la elegibilidad se verifican mediante el motor canónico antes de guardar.</p><button onClick={()=>setAdvanced('load')}>ABRIR GESTIÓN DE CARGA ↗</button></div></div>
    </>}
    {scale==='month'&&<>
      <div className="cts-toolbar"><div className="cts-step"><button onClick={()=>setAnchor(afterMonth(date,-1))}>‹</button><strong>{full(date)}</strong><button onClick={()=>setAnchor(afterMonth(date,1))}>›</button></div><button onClick={()=>setScale('season')}>Ver macrociclos</button></div>
      <div className="cts-month">{Array.from({length:(at(monthStart(date)).getUTCDay()+6)%7},(_,i)=><div className="cts-month-empty" key={'gap'+i} />)}{Array.from({length:at(afterMonth(date,1)).getTime()/DAY_MS-at(monthStart(date)).getTime()/DAY_MS},(_,i)=>plus(monthStart(date),i)).map(day=><button className="cts-month-day" key={day} onClick={()=>{setAnchor(day);setScale('week')}}><strong>{at(day).getUTCDate()}</strong><small>{activeSessions(day).length} sesiones</small>{activeSessions(day).slice(0,3).map(s=><i key={s.id}>{title(s.definitionId)}</i>)}</button>)}</div>
    </>}
    {scale==='season'&&<>
      <div className="cts-toolbar"><div><strong>PERIODIZACIÓN DE LA TEMPORADA</strong><p>Define fases largas y bloques específicos. El calendario generado seguirá siendo editable por sesión.</p></div><div className="cts-actions"><button onClick={()=>{const phase=baseMacro(world.currentDate);save({...plan,macrocycles:[...plan.macrocycles,phase]},'Macrociclo creado')}}>+ Macrociclo</button><button className="cts-primary" disabled={!plan.mesocycles.length} onClick={()=>generate(plan.mesocycles)}>GENERAR TEMPORADA</button></div></div>
      <div className="cts-season-grid">{plan.macrocycles.length===0&&<p className="cts-empty">Aún no tienes macrociclos. Pulsa «+ Macrociclo» para comenzar a planificar.</p>}{plan.macrocycles.map(phase=><section key={phase.id} className="cts-panel cts-macro"><div className="cts-macro-heading"><span className="cts-eyebrow">MACROCICLO</span><div><button onClick={()=>{const block=baseMeso(phase);save({...plan,mesocycles:[...plan.mesocycles,block]},'Mesociclo añadido')}}>+ Mesociclo</button><button title="Eliminar macrociclo y sus mesociclos" onClick={()=>save({...plan,macrocycles:plan.macrocycles.filter(m=>m.id!==phase.id),mesocycles:plan.mesocycles.filter(b=>b.macrocycleId!==phase.id)})}>Eliminar</button></div></div><div className="cts-fields"><label>Fase<input value={phase.name} onChange={e=>updateMacro(phase.id,{name:e.target.value})}/></label><label>Inicio<input type="date" value={phase.startDate} onChange={e=>updateMacro(phase.id,{startDate:e.target.value})}/></label><label>Fin<input type="date" value={phase.endDate} onChange={e=>updateMacro(phase.id,{endDate:e.target.value})}/></label><label>Objetivo<input value={phase.objective} onChange={e=>updateMacro(phase.id,{objective:e.target.value})}/></label></div><div className="cts-blocks">{plan.mesocycles.filter(block=>block.macrocycleId===phase.id).map(block=><article className="cts-block" key={block.id}><header><strong>{block.name}</strong><div><button title="Generar sesiones de este bloque" onClick={()=>generate([block])}>Generar</button><button title="Eliminar bloque" onClick={()=>save({...plan,mesocycles:plan.mesocycles.filter(b=>b.id!==block.id)})}>×</button></div></header><div className="cts-fields"><label>Nombre<input value={block.name} onChange={e=>updateMeso(block.id,{name:e.target.value})}/></label><label>Inicio<input type="date" value={block.startDate} onChange={e=>updateMeso(block.id,{startDate:e.target.value})}/></label><label>Fin<input type="date" value={block.endDate} onChange={e=>updateMeso(block.id,{endDate:e.target.value})}/></label><label>Trabajo<select value={block.moduleId} onChange={e=>updateMeso(block.id,{moduleId:e.target.value})}>{TRAINABLE.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Intensidad<select value={block.intensity} onChange={e=>updateMeso(block.id,{intensity:e.target.value as TrainingIntensity})}><option value="light">Baja</option><option value="normal">Media</option><option value="high">Alta</option></select></label><label>Objetivo<input value={block.objective} onChange={e=>updateMeso(block.id,{objective:e.target.value})}/></label></div></article>)}</div></section>)}</div>
    </>}
   </>}
   {tab==='individual'&&<>
    <SectionTitle eyebrow="CADA JUGADOR ES UN PROYECTO" heading="ENTRENAMIENTO INDIVIDUAL"><button onClick={()=>setAdvanced('personal')}>GESTIÓN DETALLADA ↗</button></SectionTitle>
    <div className="cts-panel"><h3>ASIGNACIÓN RÁPIDA</h3><div className="cts-fields"><label>Jugador<select value={chosenPlayer} onChange={e=>setChosenPlayer(e.target.value)}><option value="">Selecciona un jugador</option>{roster.map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label><label>Ejercicio<select value={chosenModule} onChange={e=>setChosenModule(e.target.value)}>{TRAINING_CATALOG.filter(m=>m.scope!=='team').map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="cts-primary" disabled={!chosenPlayer} onClick={()=>report(()=>useGameStore.getState().assignTrainingModuleToPlayer({playerId:chosenPlayer as typeof roster[number]['id'],moduleId:chosenModule,date:nextEligibleTrainingDate(world.currentDate),startTime:'09:00',sessionId:'studio:'+createEntityId()}),'Sesión individual asignada')}>ASIGNAR EJERCICIO</button></div></div>
    <div className="cts-roster">{roster.map(p=>{const fatigue=getCareerFatigueForPlayer(world,p.id);const own=upcoming.filter(s=>s.scope==='individual'&&s.playerId===p.id);return <article key={p.id} className="cts-person"><button className="cts-person-name" onClick={()=>openPlayer(p.id)}><strong>{p.firstName} {p.lastName}</strong><small>{p.basketball.primaryPosition}</small></button><div><small>FATIGA {fatigue.toFixed(1)}%</small>{mark(fatigue)}</div><div><small>PRÓXIMA SESIÓN</small><strong>{own[0]?title(own[0].definitionId):'Sin programar'}</strong></div><button onClick={()=>{setChosenPlayer(p.id);setTab('development')}}>PLAN ↗</button></article>})}</div>
   </>}
   {tab==='development'&&<>
    <SectionTitle eyebrow="DE LA PROMESA A LA LEYENDA" heading="DESARROLLO A LARGO PLAZO"><button onClick={()=>setAdvanced('personal')}>ENTRENAMIENTO INDIVIDUAL ↗</button></SectionTitle>
    <div className="cts-panel"><h3>NUEVO OBJETIVO PERSONAL</h3><div className="cts-fields"><label>Jugador<select value={chosenPlayer} onChange={e=>setChosenPlayer(e.target.value)}><option value="">Elegir</option>{roster.map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label><label>Atributo<select value={chosenRating} onChange={e=>setChosenRating(e.target.value)}>{RATING_OPTIONS.map(k=><option key={k} value={k}>{ATTRIBUTE_LABELS[k]??k}</option>)}</select></label><label>Meta<input type="number" min="0" max="100" value={targetValue} onChange={e=>setTargetValue(Number(e.target.value))}/></label><label>Fecha objetivo<input type="date" value={targetDate||plus(world.currentDate,120)} onChange={e=>setTargetDate(e.target.value)} /></label><button className="cts-primary" disabled={!chosenPlayer} onClick={()=>save({...plan,individualGoals:[...plan.individualGoals.filter(g=>!(g.playerId===chosenPlayer&&g.targetRating===chosenRating)),{playerId:chosenPlayer,targetRating:chosenRating,targetValue,targetDate:targetDate||plus(world.currentDate,120),note:'Objetivo del entrenador'}]},'Objetivo guardado')}>AÑADIR OBJETIVO</button></div></div>
    <div className="cts-goals">{plan.individualGoals.length===0?<div className="cts-panel cts-empty">Todavía no hay objetivos. Cada jugador puede tener metas técnicas y físicas persistentes.</div>:plan.individualGoals.map((goal,i)=>{const p=world.players[goal.playerId as keyof typeof world.players];const current=p?.basketball.ratings[goal.targetRating as keyof typeof p.basketball.ratings]??0;return <div className="cts-panel cts-goal" key={goal.playerId+goal.targetRating}><button onClick={()=>openPlayer(goal.playerId)}><strong>{playerName(goal.playerId)}</strong></button><span>{ATTRIBUTE_LABELS[goal.targetRating as keyof typeof ATTRIBUTE_LABELS]??goal.targetRating}</span><div>{mark(Number(current))}<small>{Number(current).toFixed(0)} actual / {goal.targetValue} objetivo</small></div><span>{fmt(goal.targetDate)}</span><button title="Eliminar objetivo" onClick={()=>save({...plan,individualGoals:plan.individualGoals.filter((_,j)=>j!==i)})}>×</button></div>})}</div>
    <div className="cts-panel"><h3>PROGRESO REAL</h3><p>Los objetivos son decisiones de gestión. Los cambios efectivos de atributos siguen siendo responsabilidad exclusiva del desarrollo canónico del jugador.</p></div>
   </>}
   {tab==='mentoring'&&<>
     <SectionTitle eyebrow="LAS PERSONAS CONSTRUYEN EL CLUB" heading="MENTORING & LEGADO"><span className="cts-chip">{plan.mentoringGroups.length} grupos guardados</span></SectionTitle>
     <div className="cts-columns"><div className="cts-panel"><h3>CREAR RELACIÓN</h3><div className="cts-fields cts-fields--vertical"><label>Mentor<select value={chosenMentor} onChange={e=>setChosenMentor(e.target.value)}><option value="">Seleccionar</option>{roster.map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label><label>Aprendiz<select value={chosenMentee} onChange={e=>setChosenMentee(e.target.value)}><option value="">Seleccionar</option>{roster.filter(p=>p.id!==chosenMentor).map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label><label>Área de aprendizaje<select value={chosenFocus} onChange={e=>setChosenFocus(e.target.value)}>{['Profesionalidad','Liderazgo','Lectura del juego','Comunicación','Resiliencia','Hábitos de entrenamiento','Cultura de equipo'].map(x=><option key={x}>{x}</option>)}</select></label><button className="cts-primary" disabled={!chosenMentor||!chosenMentee||chosenMentor===chosenMentee} onClick={()=>save({...plan,mentoringGroups:[...plan.mentoringGroups,{id:'mentor:'+createEntityId(),mentorId:chosenMentor,menteeIds:[chosenMentee],focus:chosenFocus,createdDate:world.currentDate}]},'Grupo de mentoring guardado')}>CREAR GRUPO</button></div></div><div className="cts-panel"><h3>EL ÁRBOL DEL LEGADO</h3><p>Cada vínculo se conserva en la partida y puede consultarse durante la temporada. La transmisión automática de rasgos y efectos de personalidad requiere su propia conexión certificada al motor.</p><div className="cts-legacy"><span>VETERANO</span><i>→</i><span>APRENDIZ</span><i>→</i><span>FUTURO MENTOR</span></div></div></div>
     <div className="cts-mentor-list">{plan.mentoringGroups.map(group=><article className="cts-panel cts-mentor" key={group.id}><span className="cts-eyebrow">{group.focus}</span><button onClick={()=>openPlayer(group.mentorId)}><strong>{playerName(group.mentorId)}</strong></button><span className="cts-arrow">→</span><div>{group.menteeIds.map(id=><button key={id} onClick={()=>openPlayer(id)}>{playerName(id)}</button>)}</div><button onClick={()=>save({...plan,mentoringGroups:plan.mentoringGroups.filter(item=>item.id!==group.id)},'Grupo eliminado')}>Eliminar</button></article>)}</div>
   </>}
   {tab==='results'&&<>
    <SectionTitle eyebrow="MEDIR LO QUE REALMENTE CAMBIA" heading="RESULTADOS"><button onClick={()=>setAdvanced('team')}>HISTORIAL COMPLETO ↗</button></SectionTitle>
    <div className="cts-summary"><div><small>COMPLETADAS</small><strong>{completed.length}</strong><span>Sesiones ejecutadas</span></div><div><small>PROGRAMADAS</small><strong>{upcoming.length}</strong><span>Sesiones futuras</span></div><div><small>FATIGA MEDIA</small><strong>{teamAvg.toFixed(1)}%</strong><span>Estado actual del equipo</span></div><div><small>OBJETIVOS</small><strong>{plan.individualGoals.length}</strong><span>Planes individuales</span></div></div>
    <div className="cts-columns"><div className="cts-panel"><h3>PARTICIPACIÓN EN SESIONES</h3>{completed.slice(-12).map(s=><div className="cts-result" key={s.id}><span>{fmt(s.date)} · {title(s.definitionId)}</span><div>{mark(s.execution?.participants.length??0,Math.max(1,roster.length))}</div><small>{s.execution?.participants.length??0} jugadores</small></div>)}{!completed.length&&<p>El historial aparece cuando el motor complete entrenamientos reales.</p>}</div><div className="cts-panel"><h3>CARGA POR JUGADOR</h3>{roster.slice().sort((a,b)=>getCareerFatigueForPlayer(world,b.id)-getCareerFatigueForPlayer(world,a.id)).map(p=><div className="cts-result" key={p.id}><button onClick={()=>openPlayer(p.id)}>{p.firstName} {p.lastName}</button>{mark(getCareerFatigueForPlayer(world,p.id))}<small>{getCareerFatigueForPlayer(world,p.id).toFixed(1)}%</small></div>)}</div></div>
   </>}
  </main>
  {advanced!==null&&<div className="cts-advanced-mask"><div className="cts-advanced-head"><strong>HERRAMIENTAS DE ENTRENAMIENTO</strong><div>{([['team','Equipo'],['personal','Individual'],['load','Carga'],['staff','Staff'],['modules','Módulos']] as const).map(([id,label])=><button className={advanced===id?'active':''} key={id} onClick={()=>setAdvanced(id)}>{label}</button>)}<button onClick={()=>setAdvanced(null)}>CERRAR ×</button></div></div><div className="cts-advanced-body"><TrainingPcbPage variant="ng" world={liveTeam} activeTab={advanced} onTabChange={setAdvanced} onIntensity={v=>useGameStore.getState().setTrainingIntensity(v)} onFocus={v=>useGameStore.getState().setTrainingFocus(v)} onScheduleSession={s=>useGameStore.getState().scheduleTrainingSession(s)} onScheduleTeamModule={v=>useGameStore.getState().scheduleTeamModuleSession(v)} onScheduleAutomaticWeek={v=>useGameStore.getState().scheduleAutomaticTeamTrainingWeek(v)} onCancelSession={v=>useGameStore.getState().cancelTrainingSession(v)} onSetTrainingParticipation={(sessionId,playerId,participation)=>useGameStore.getState().setTrainingParticipation({sessionId,playerId,participation})} onSaveModule={v=>useGameStore.getState().saveUserTrainingModule(v)} onDeleteModule={v=>useGameStore.getState().deleteUserTrainingModule(v)} onAssignModule={v=>useGameStore.getState().assignTrainingModuleToPlayer(v)} onOpenPlayer={v=>openPlayer(v)} /></div></div>}
 </div>
}
