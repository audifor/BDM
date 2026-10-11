import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import type { LineupSlot } from '@/domain/tactics'
import type { PlayerId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'
import { getCurrentPlayerContract, getCurrentPlayerInjury, getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { CanonicalRoster } from '@/ui/pcb-migrated/plantilla/CanonicalRoster'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'
import { RosterCourtsideBriefing } from '@/ui-ng/applications/roster/components/RosterCourtsideBriefing'
import { RosterCourtsideDepth } from '@/ui-ng/applications/roster/components/RosterCourtsideDepth'
import { RosterCourtsidePlanning } from '@/ui-ng/applications/roster/components/RosterCourtsidePlanning'
import { RosterWorkspaceHeader } from '@/ui-ng/applications/roster/components/RosterWorkspaceHeader'
import { RosterV4Controls } from '@/ui-ng/applications/roster/components/RosterV4Controls'
import { RosterRowInspector } from '@/ui-ng/applications/roster/components/RosterRowInspector'
import { RosterManagerRibbon } from '@/ui-ng/applications/roster/components/RosterManagerAgenda'
import { buildRosterManagerStatus, readRosterManagerPriorities, rosterManagerPlanKey, saveRosterManagerPriorities, type RosterManagerPriority, type RosterManagerPriorities } from './rosterManagerPlan'
import { buildRosterBriefing } from '@/ui-ng/applications/roster/buildRosterBriefing'
import { buildRosterDepthChart } from '@/ui-ng/applications/roster/buildRosterDepthChart'
import { buildRosterWorkspaceContext, rosterTeamForWorld } from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { useRosterWorkspaceSession, type RosterNgSessionBridge } from '@/ui-ng/applications/roster/rosterWorkspaceSession'
import { matchesRosterV4Filters, rosterContractStatus } from '@/ui-ng/applications/roster/rosterV4Filters'
import { getClubRosterCandidates } from '@/ui-ng/applications/roster/rosterClubPresence'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { readNgWorkspaceNavigation } from '@/ui-ng/workspace/workspaceApps'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'

import './courtside-roster.css'

export function RosterWorkspace() {
  const world = useGameStore(state=>state.world)
  const setLineupSlot = useGameStore(state=>state.setLineupSlot)
  const clearLineupSlot = useGameStore(state=>state.clearLineupSlot)
  const { openEntity, teamId: navTeamId } = useNgWorkspaceNavigation()
  const teamId = navTeamId ?? readNgWorkspaceNavigation().teamId
  const scrollRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const gridSnapshotRef = useRef({top:0,left:0})
  const [inspectorOpen,setInspectorOpen] = useState(false)
  const tab = useRosterWorkspaceSession(s=>s.tab)
  const setTab = useRosterWorkspaceSession(s=>s.setTab)
  const activePreset = useRosterWorkspaceSession(s=>s.activePreset)
  const searchQuery = useRosterWorkspaceSession(s=>s.searchQuery)
  const positionFilter = useRosterWorkspaceSession(s=>s.positionFilter)
  const selectedRowIds = useRosterWorkspaceSession(s=>s.selectedRowIds)
  const scrollTop = useRosterWorkspaceSession(s=>s.scrollTop)
  const scrollLeft = useRosterWorkspaceSession(s=>s.scrollLeft)
  const customViews = useRosterWorkspaceSession(s=>s.customViews)
  const v4Filters = useRosterWorkspaceSession(s=>s.v4Filters)
  const setActivePreset = useRosterWorkspaceSession(s=>s.setActivePreset)
  const setSearchQuery = useRosterWorkspaceSession(s=>s.setSearchQuery)
  const setPositionFilter = useRosterWorkspaceSession(s=>s.setPositionFilter)
  const setSelectedRowIds = useRosterWorkspaceSession(s=>s.setSelectedRowIds)
  const setScrollTop = useRosterWorkspaceSession(s=>s.setScrollTop)
  const setScrollLeft = useRosterWorkspaceSession(s=>s.setScrollLeft)

  const context = useMemo(()=>world===null?null:buildRosterWorkspaceContext(world,teamId),[world,teamId])
  const team = useMemo(()=>world===null?undefined:rosterTeamForWorld(world,teamId),[world,teamId])
  const userTeam = world===null?undefined:getUserTeam(world)
  const canEditLineup = team!==undefined&&userTeam?.id===team.id
  const roster = useMemo(()=>world===null||team===undefined?[]:getTeamRoster(world,team.id),[world,team])
  const rosterCandidates = useMemo(()=>world===null||team===undefined?[]:getClubRosterCandidates(world,team.id),[world,team])
  const managerStatus = useMemo(()=>world===null||team===undefined?null:buildRosterManagerStatus(world,team.id),[world,team])
  const planScope=world===null||team===undefined?'':rosterManagerPlanKey(world,team.id)
  const [planStore,setPlanStore]=useState<{scope:string;priorities:RosterManagerPriorities}>({scope:'',priorities:{}})
  useEffect(()=>{
    if(world!==null&&team!==undefined)setPlanStore({scope:planScope,priorities:readRosterManagerPriorities(world,team.id)})
  },[planScope,team?.id])
  const managerPriorities: RosterManagerPriorities=planStore.scope===planScope?planStore.priorities:{}
  const setManagerPriority=useCallback((position:BasketballPosition,priority:RosterManagerPriority|undefined)=>{
    if(!canEditLineup||world===null||team===undefined)return
    const next: Partial<Record<BasketballPosition,RosterManagerPriority>>={...managerPriorities}
    if(priority===undefined)delete next[position]
    else next[position]=priority
    setPlanStore({scope:planScope,priorities:next})
    saveRosterManagerPriorities(world,team.id,next)
  },[canEditLineup,world,team?.id,managerPriorities,planScope])
  const injuries = useMemo(()=>world===null?0:roster.filter(player=>getCurrentPlayerInjury(world,player.id)!==undefined).length,[roster,world])
  const expiring = useMemo(()=>world===null?0:roster.filter(player=>rosterContractStatus(world,player)==='expiring').length,[roster,world])
  const hasContractData = useMemo(()=>world!==null&&roster.some(player=>getCurrentPlayerContract(world,player.id)!==undefined),[roster,world])
  const teamStyle = useMemo(()=>{
    if(team===undefined)return undefined
    const colors=deriveTeamColors(team.id)
    return {'--po-team-primary':colors.primary,'--po-team-secondary':colors.secondary,'--po-team-muted':colors.muted} as CSSProperties
  },[team])
  const depthChart = useMemo(()=>world===null||team===undefined?null:buildRosterDepthChart(world,team.id),[world,team])
  const briefing = useMemo(()=>world===null||team===undefined?null:buildRosterBriefing(world,team.id),[world,team])
  const inspectedPlayer = useMemo(()=>{
    if(world===null)return undefined
    const id=selectedRowIds.at(-1)
    return id===undefined?undefined:world.players[id as PlayerId]
  },[world,selectedRowIds])
  const rowPredicate = useCallback((player: typeof roster[number])=>
    world!==null&&matchesRosterV4Filters(world,player,v4Filters,team?.id),[world,v4Filters,team?.id])
  const sessionBridge = useMemo<RosterNgSessionBridge>(()=>({
    activePreset,onActivePresetChange:setActivePreset,
    searchQuery,onSearchQueryChange:setSearchQuery,
    positionFilter,onPositionFilterChange:setPositionFilter,
    selectedRowIds,onSelectedRowIdsChange:setSelectedRowIds,
    customViews,
  }),[activePreset,searchQuery,positionFilter,selectedRowIds,customViews,
    setActivePreset,setSearchQuery,setPositionFilter,setSelectedRowIds])

  const persistScroll = useCallback(()=>{
    const element=scrollRef.current?.querySelector<HTMLElement>('.bdm-data-table')
    if(element!==null && element!==undefined){
      gridSnapshotRef.current={top:element.scrollTop,left:element.scrollLeft}
      setScrollTop(element.scrollTop)
      setScrollLeft(element.scrollLeft)
    }
  },[setScrollTop,setScrollLeft])
  const openPlayer = useCallback((destination: EntityDestination)=>{
    if(destination.type!=='player')return
    persistScroll()
    setInspectorOpen(false)
    openEntity(destination)
  },[openEntity,persistScroll])
  useLayoutEffect(()=>{
    if(tab!=='plantilla')return
    const element=scrollRef.current?.querySelector<HTMLElement>('.bdm-data-table')
    if(element===undefined||element===null)return
    element.scrollTop=scrollTop
    element.scrollLeft=scrollLeft
    const track=()=>persistScroll()
    element.addEventListener('scroll',track,{passive:true})
    return ()=>element.removeEventListener('scroll',track)
    // Restoration is per tab/preset activation, not each scroll tick.
  },[tab,activePreset,persistScroll])
  useEffect(()=>{
    if(!inspectorOpen)return
    const outside=(event:PointerEvent)=>{
      if(popupRef.current!==null&&!popupRef.current.contains(event.target as Node))
        setInspectorOpen(false)
    }
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape')setInspectorOpen(false)}
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',keyboard)
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard)}
  },[inspectorOpen])
  useEffect(()=>{setInspectorOpen(false)},[tab])

  if(world===null||context===null||team===undefined){
    return <div className="courtside-roster-screen courtside-roster-screen--empty" data-ng-region="roster-workspace">
      <section className="roster-workspace__empty-state"><h1>ROSTER</h1><p>No hay equipo asociado al entrenador.</p></section>
    </div>
  }

  return <div className="courtside-roster-screen" style={teamStyle} data-ng-region="roster-workspace">
    <ApplicationWorkspace header={<RosterWorkspaceHeader context={context} activeTab={tab} onTabChange={setTab}/>}>
      <main className="roster-v4__body">
        {tab==='plantilla'&&<>
          <div className="roster-v4__metrics" aria-label="Resumen de plantilla">
            <div><small>JUGADORES EN PLANTILLA</small><strong>{roster.length}</strong></div>
            <div><small>SIN LESIÓN ACTUAL</small><strong className="is-lime">{roster.length-injuries}<em> / {roster.length}</em></strong></div>
            <div title={!hasContractData?'No constan contratos activos para esta plantilla':undefined}><small>VENCIMIENTOS REGISTRADOS</small><strong className="is-orange">{hasContractData?expiring:'—'}</strong></div>
            <div><small>SELECCIÓN ACTIVA</small><strong>{selectedRowIds.length}</strong></div>
          </div>
          {managerStatus!==null&&<RosterManagerRibbon status={managerStatus} priorities={managerPriorities}
            onDepth={()=>setTab('profundidad')} onPlanning={()=>setTab('planificar')}
            onBriefing={()=>setTab('briefing')}/>}
          <RosterV4Controls selectedCount={selectedRowIds.length} onOpenInspector={()=>setInspectorOpen(true)}/>
          <div className="roster-v4__table-pane">
            <ScrollRegion className="roster-workspace__scroll" onScroll={persistScroll} ref={scrollRef}>
              <CanonicalRoster
                embedInspector={false} v4Mode rowPredicate={rowPredicate} rosterCandidates={rosterCandidates}
                onLineupSlotChange={canEditLineup?(slot:LineupSlot,playerId)=>setLineupSlot(slot,playerId):undefined}
                onLineupSlotClear={canEditLineup?(slot:LineupSlot)=>clearLineupSlot(slot):undefined}
                onOpenEntity={openPlayer} sessionBridge={sessionBridge} team={team} variant="ng" world={world}
              />
            </ScrollRegion>
            {inspectorOpen&&inspectedPlayer!==undefined&&selectedRowIds.length===1&&
              <div ref={popupRef} role="dialog" aria-modal="false" aria-label="Inspector flotante de jugador"
                className="roster-v4__popup" data-ng-region="roster-v4-popup">
                <div className="roster-v4__popup-bar">
                  <strong>INSPECTOR · VISTA RÁPIDA</strong>
                  <button type="button" aria-label="Cerrar inspector" onClick={()=>setInspectorOpen(false)}>×</button>
                </div>
                <RosterRowInspector player={inspectedPlayer} team={team} world={world}
                  onOpenPlayer={player=>openPlayer({type:'player',playerId:player.id,section:'overview'})}/>
              </div>}
          </div>
        </>}
        {tab==='profundidad'&&<section className="roster-v4__tab-panel" aria-label="Profundidad de plantilla">
          {depthChart===null?<p>Mapa de profundidad no disponible.</p>:<RosterCourtsideDepth
            model={depthChart} onOpenPlayer={openPlayer} selectedPlayerId={inspectedPlayer?.id}
            onLineupSlotChange={canEditLineup?(slot,playerId)=>setLineupSlot(slot,playerId):undefined}
            onLineupSlotClear={canEditLineup?slot=>clearLineupSlot(slot):undefined}/>}
        </section>}
        {tab==='briefing'&&<section className="roster-v4__tab-panel" aria-label="Briefing de plantilla">
          {briefing===null?<p>Informe no disponible.</p>:<RosterCourtsideBriefing
            model={briefing} teamId={team.id} world={world} onOpenDepth={()=>setTab('profundidad')}
            onOpenPlanning={()=>setTab('planificar')} status={managerStatus??undefined} priorities={managerPriorities}/>}
        </section>}
        {tab==='planificar'&&<section className="roster-v4__tab-panel roster-v4__planning"
          aria-label="Planificar plantilla">
          <RosterCourtsidePlanning world={world} roster={roster} onOpenPlayer={openPlayer}
            status={managerStatus!} priorities={managerPriorities} onSetPriority={setManagerPriority}
            onOpenDepth={()=>setTab('profundidad')} canManage={canEditLineup}/>
        </section>}
      </main>
    </ApplicationWorkspace>
  </div>
}
