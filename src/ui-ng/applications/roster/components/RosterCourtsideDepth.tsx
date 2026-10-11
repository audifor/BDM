import type { PlayerId } from '@/domain/ids'
import { BENCH_SLOTS, type LineupSlot } from '@/domain/tactics'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { EntityLink } from '@/ui/navigation/EntityLink'
import type { RosterDepthChartModel, RosterDepthBand } from '@/ui-ng/applications/roster/buildRosterDepthChart'
import { buildDepthChartLaneItems, laneHasAssignedRoles } from '@/ui-ng/applications/roster/buildRosterDepthChartView'

const BAND_LABEL: Record<RosterDepthBand,string> = {
  starter:'TITULAR', rotation:'ROTACIÓN', bench:'BANQUILLO', unassigned:'SIN ASIGNAR',
}
const BALANCE: Record<string,string> = {thin:'POCA PROFUNDIDAD',ok:'COBERTURA',loaded:'ALTA CONCENTRACIÓN'}

export function RosterCourtsideDepth({model,onOpenPlayer,selectedPlayerId,onLineupSlotChange,onLineupSlotClear}:{
  readonly model:RosterDepthChartModel
  readonly onOpenPlayer:(destination:EntityDestination)=>void
  readonly selectedPlayerId?:PlayerId
  readonly onLineupSlotChange?: (slot:LineupSlot,playerId:PlayerId)=>void
  readonly onLineupSlotClear?: (slot:LineupSlot)=>void
}) {
  return <section className="roster-v4-depth" aria-label="Depth chart" data-ng-region="roster-depth-chart">
    <header className="roster-v4__section-title">
      <div><span>GESTIÓN DE EQUIPO / ROTACIÓN</span><h2>PROFUNDIDAD</h2>
        <p>Quinteto, relevos y cobertura por posición principal · datos reales de la plantilla.</p></div>
      <strong>{model.rosterCount} jugadores</strong>
    </header>
    <div className="roster-v4-depth__legend" aria-label="Leyenda de distribución de roles">
      <span><i className="is-starter" aria-hidden="true"/>Titulares</span>
      <span><i className="is-bench" aria-hidden="true"/>Banquillo</span>
      <span><i className="is-unassigned" aria-hidden="true"/>Sin asignar</span>
    </div>
    <div className="roster-v4-depth__lanes roster-depth-chart__lanes">
      {model.lanes.map(lane=>{
        const withRoles=laneHasAssignedRoles(lane.players)
        const items=buildDepthChartLaneItems(lane.players)
        const chosen=lane.players.some(p=>p.id===selectedPlayerId)
        const total=Math.max(1,lane.count)
        const benchCount=lane.rotationCount+lane.benchCount
        return <article className={`roster-depth-chart__lane roster-v4-depth__lane is-${lane.balance}${withRoles?' has-roles':''}${chosen?' is-selected':''}`} key={lane.position}>
          <div className="roster-depth-chart__lane-head">
            <div className="roster-depth-chart__identity"><span className="roster-depth-chart__pos">{lane.position}</span>
              <strong className="roster-depth-chart__count">{lane.count}</strong></div>
            <span className="roster-depth-chart__balance">{BALANCE[lane.balance]}</span>
          </div>
          <div className="roster-depth-chart__meter" role="img"
            aria-label={`${lane.position}: ${lane.starterCount} titulares, ${benchCount} en banquillo y ${lane.unassignedCount} sin asignar de ${lane.count} jugadores`}>
            <span className="is-starter" style={{width:`${lane.starterCount/total*100}%`}}/>
            <span className="is-bench" style={{width:`${benchCount/total*100}%`}}/>
            <span className="is-unassigned" style={{width:`${lane.unassignedCount/total*100}%`}}/>
          </div>
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
                  {onLineupSlotChange!==undefined
                    ? <select className="roster-v4-depth__slot" value={item.player.slot??''}
                        aria-label={`Asignar rotación a ${item.player.name}`}
                        title="Los cambios se aplican a la rotación del equipo"
                        onChange={event=>{
                          const next=event.target.value
                          if(next==='') {
                            if(item.player.slot!==undefined)onLineupSlotClear?.(item.player.slot)
                          } else onLineupSlotChange(next as LineupSlot,item.player.id)
                        }}>
                        <option value="">Sin rol</option>
                        <option value={lane.position}>TITULAR {lane.position}</option>
                        {BENCH_SLOTS.map(slot=><option key={slot} value={slot}>BANQUILLO {slot}</option>)}
                      </select>
                    : <span className="roster-v4-depth__slot">{item.player.slot??BAND_LABEL[item.player.band]}</span>}
                </li>)}
          </ul>
          <footer className="roster-v4-depth__summary">
            <span>TITULARES {lane.starterCount}</span><span>BANQUILLO {benchCount}</span>
            <span>SIN ROL {lane.unassignedCount}</span>
          </footer>
        </article>
      })}
    </div>
    <div className="roster-v4-depth__footnote">
      <strong>LECTURA DE PROFUNDIDAD</strong>
      <p>La barra muestra titulares, banquillo y jugadores sin asignar respecto al total de la posición principal. Las asignaciones modifican la rotación real; no indican compatibilidad con posiciones secundarias ni minutos garantizados.</p>
    </div>
  </section>
}
