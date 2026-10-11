import type { PlayerId } from '@/domain/ids'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { EntityLink } from '@/ui/navigation/EntityLink'
import type { RosterDepthChartModel, RosterDepthBand } from '@/ui-ng/applications/roster/buildRosterDepthChart'
import { buildDepthChartLaneItems, laneHasAssignedRoles } from '@/ui-ng/applications/roster/buildRosterDepthChartView'

const BAND_LABEL: Record<RosterDepthBand,string> = {
  starter:'TITULAR', rotation:'ROTACIÓN', bench:'BANQUILLO', unassigned:'SIN ASIGNAR',
}
const BALANCE: Record<string,string> = {thin:'POCA PROFUNDIDAD',ok:'COBERTURA',loaded:'ALTA CONCENTRACIÓN'}

export function RosterCourtsideDepth({model,onOpenPlayer,selectedPlayerId}:{
  readonly model:RosterDepthChartModel
  readonly onOpenPlayer:(destination:EntityDestination)=>void
  readonly selectedPlayerId?:PlayerId
}) {
  return <section className="roster-depth-chart roster-v4-depth" aria-label="Depth chart" data-ng-region="roster-depth-chart">
    <header className="roster-v4__section-title">
      <div><span>GESTIÓN DE EQUIPO / ROTACIÓN</span><h2>PROFUNDIDAD</h2>
        <p>Quinteto, relevos y cobertura por posición principal · datos reales de la plantilla.</p></div>
      <strong>{model.rosterCount} players</strong>
    </header>
    <div className="roster-v4-depth__lanes roster-depth-chart__lanes">
      {model.lanes.map(lane=>{
        const withRoles=laneHasAssignedRoles(lane.players)
        const items=buildDepthChartLaneItems(lane.players)
        const chosen=lane.players.some(p=>p.id===selectedPlayerId)
        const total=Math.max(1,lane.starterCount+lane.rotationCount+lane.benchCount)
        return <article className={`roster-depth-chart__lane roster-v4-depth__lane is-${lane.balance}${withRoles?' has-roles':''}${chosen?' is-selected':''}`} key={lane.position}>
          <div className="roster-depth-chart__lane-head">
            <div className="roster-depth-chart__identity"><span className="roster-depth-chart__pos">{lane.position}</span>
              <strong className="roster-depth-chart__count">{lane.count}</strong></div>
            <span className="roster-depth-chart__balance">{BALANCE[lane.balance]}</span>
          </div>
          {withRoles&&<div className="roster-depth-chart__meter" aria-label="Distribución de roles">
            <span className="is-starter" style={{width:`${lane.starterCount/total*100}%`}}/>
            <span className="is-rotation" style={{width:`${lane.rotationCount/total*100}%`}}/>
            <span className="is-bench" style={{width:`${lane.benchCount/total*100}%`}}/>
          </div>}
          <ul className="roster-depth-chart__players">
            {items.length===0&&<li className="roster-depth-chart__empty">Sin jugadores en esta posición principal</li>}
            {items.map(item=>item.kind==='group'
              ?<li className={`roster-depth-chart__group is-${item.band}`} key={`group-${item.band}`}>{BAND_LABEL[item.band]}</li>
              :<li data-player-id={item.player.id} key={item.player.id}
                className={`roster-depth-chart__row is-${item.player.band}${item.player.id===selectedPlayerId?' is-selected':''}`}>
                  <span className="roster-depth-chart__rank">{item.rank}</span>
                  <EntityLink className="canonical-roster__player-link roster-depth-chart__player"
                    destination={{type:'player',playerId:item.player.id,section:'overview'}}
                    onNavigate={onOpenPlayer}>{item.player.name}</EntityLink>
                  <span className="roster-v4-depth__slot">{item.player.slot??BAND_LABEL[item.player.band]}</span>
                </li>)}
          </ul>
          <footer className="roster-v4-depth__summary">
            <span>TITULARES {lane.starterCount}</span><span>ROTACIÓN {lane.rotationCount}</span>
            <span>SIN ROL {lane.unassignedCount}</span>
          </footer>
        </article>
      })}
    </div>
    <div className="roster-v4-depth__footnote">
      <strong>LECTURA DE PROFUNDIDAD</strong>
      <p>La distribución se basa en posiciones principales y asignaciones de quinteto/banquillo. No demuestra compatibilidad con posiciones secundarias, calidad global ni minutos prometidos.</p>
    </div>
  </section>
}
