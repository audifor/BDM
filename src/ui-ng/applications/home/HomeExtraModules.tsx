import { isInjuryActive, injuryLifecycleStatus, projectedInjuryReviewDate } from '@/domain/injury'
import { trainingDefinitionById } from '@/domain/training/TrainingCatalog'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'
import type { HomeDashboardSlotContext } from './HomeDashboardSlot'

function Empty({text}:{readonly text:string}) {
  return <p className="ng-canon__empty">{text}</p>
}
function OpenApp({label,app}:{readonly label:string;readonly app:'schedule'|'training'|'medical'}) {
  return <button type="button" className="home-micro-module__open" onClick={()=>syncWorkspaceAppQuery(app)}>{label} ↗</button>
}

export function HomeRecentResults({context}:{readonly context:HomeDashboardSlotContext}) {
  const {openEntity}=useNgWorkspaceNavigation()
  const teamId=context.teamId
  const rows=teamId===undefined?[]:Object.values(context.world.games)
    .filter(g=>g.status==='completed'&&g.result!=null&&(g.homeTeamId===teamId||g.awayTeamId===teamId))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,5)
  return <div className="home-micro-module">
    {rows.length===0?<Empty text="Todavía no hay partidos disputados."/>:
      <ul className="home-micro-module__list">{rows.map(g=>{
        const atHome=g.homeTeamId===teamId
        const opponentId=atHome?g.awayTeamId:g.homeTeamId
        const scored=atHome?g.result!.homeScore:g.result!.awayScore
        const allowed=atHome?g.result!.awayScore:g.result!.homeScore
        const result=scored>allowed?'win':scored<allowed?'loss':'draw'
        return <li className="home-micro-module__row" key={g.id}>
          <div className="home-micro-module__primary">
            <button type="button" className="ng-canon__link" onClick={()=>openEntity({type:'team',teamId:opponentId,section:'overview'})}>{context.world.teams[opponentId]?.name??opponentId}</button>
            <small>{formatGameDateLabel(g.date)} · {atHome?'Casa':'Fuera'}</small>
          </div>
          <strong className={`home-micro-module__result is-${result}`}>{scored}–{allowed}</strong>
        </li>
      })}</ul>}
    <OpenApp app="schedule" label="Ver calendario"/>
  </div>
}

export function HomeMedicalReport({context}:{readonly context:HomeDashboardSlotContext}) {
  const {openEntity}=useNgWorkspaceNavigation()
  const roster=new Set(context.teamId===undefined?[]:context.world.teams[context.teamId]?.rosterPlayerIds??[])
  const injuries=Object.values(context.world.injuriesById)
    .filter(i=>roster.has(i.playerId)&&isInjuryActive(i,context.world.currentDate))
    .sort((a,b)=>a.expectedReturnDate.localeCompare(b.expectedReturnDate)||a.id.localeCompare(b.id))
    .slice(0,5)
  return <div className="home-micro-module">
    {injuries.length===0?<Empty text="Sin lesiones activas registradas."/>:
      <ul className="home-micro-module__list">{injuries.map(i=>{
        const player=context.world.players[i.playerId]
        const lifecycle=injuryLifecycleStatus(i,context.world.currentDate)
        return <li className="home-micro-module__row" key={i.id}>
          <div className="home-micro-module__primary">
            <button className="ng-canon__link" type="button" onClick={()=>openEntity({type:'player',playerId:i.playerId,section:'overview'})}>
              {player===undefined?i.playerId:`${player.firstName} ${player.lastName}`}
            </button>
            <small>{lifecycle==='RTP_REVIEW_DUE'?'Revisión pendiente':'En recuperación'} · Revisión: {formatGameDateLabel(projectedInjuryReviewDate(i,context.world.currentDate))}</small>
          </div>
          <span className="home-micro-module__severity">{i.severity==='serious'?'Grave':i.severity==='moderate'?'Moderada':'Leve'}</span>
        </li>
      })}</ul>}
    <OpenApp app="medical" label="Abrir parte médico"/>
  </div>
}

export function HomeTrainingAgenda({context}:{readonly context:HomeDashboardSlotContext}) {
  const teamId=context.teamId
  const sessions=Object.values(context.world.scheduledTrainingSessionsById)
    .filter(s=>s.teamId===teamId&&s.status==='scheduled'&&s.date>=context.world.currentDate)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id)).slice(0,5)
  return <div className="home-micro-module">
    {sessions.length===0?<Empty text="No hay sesiones programadas."/>:
      <ul className="home-micro-module__list">{sessions.map(s=>{
        const player=s.playerId===undefined?undefined:context.world.players[s.playerId]
        return <li className="home-micro-module__row" key={s.id}>
          <div className="home-micro-module__primary">
            <strong>{trainingDefinitionById(s.definitionId).name}</strong>
            <small>{s.scope==='team'?'Equipo':player===undefined?'Individual':`${player.firstName} ${player.lastName}`} · {s.durationMinutes} min</small>
          </div>
          <span className="home-micro-module__when">{formatGameDateLabel(s.date)}<small>{s.startTime}</small></span>
        </li>
      })}</ul>}
    <OpenApp app="training" label="Ir a entrenamientos"/>
  </div>
}
