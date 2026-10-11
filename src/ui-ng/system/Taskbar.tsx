import { useEffect, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import type { PlayerId, StaffPersonId, TeamId, CompetitionId } from '@/domain/ids'
import type { TaskbarInstance } from '@/ui-ng/workspace/taskbarInstances'
import './Taskbar.css'
import { useGameStore } from '@/stores/gameStore'
import { NgStartMenu } from '@/ui-ng/system/NgStartMenu'
import { CourtsideGlyph, CourtsideTaskbarIcon } from '@/ui-ng/system/CourtsideGlyph'
import { isClosableTaskbarApp, taskbarAppLabel } from '@/ui-ng/workspace/taskbarOpenApps'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { WORKSPACE_APP_IDS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

const APP_DRAG = 'application/x-bdm-courtside-app'
function draggedApp(event: DragEvent): WorkspaceAppId | null {
  const value=event.dataTransfer.getData(APP_DRAG)
  return (WORKSPACE_APP_IDS as readonly string[]).includes(value) ? value as WorkspaceAppId : null
}
function instanceLabel(instance: TaskbarInstance, world: ReturnType<typeof useGameStore.getState>['world']) {
  const { entityId, entityKind } = instance
  if (entityId === null) return taskbarAppLabel(instance.app)
  if (world === null) return entityId
  if (entityKind === 'playerId' || entityKind === 'focusPlayerId') {
    const player = world.players[entityId as PlayerId]
    if (player) return [player.firstName, player.lastName].filter(Boolean).join(' ')
  }
  if (entityKind === 'staffId') {
    const person = world.staffPeopleById[entityId as StaffPersonId]
    if (person) return [person.identity.firstName, person.identity.lastName].filter(Boolean).join(' ')
  }
  if (entityKind === 'teamId') {
    const team = world.teams[entityId as TeamId]
    if (team) return team.name
  }
  if (entityKind === 'competitionId') {
    const competition = world.competitions[entityId as CompetitionId]
    if (competition) return competition.name
  }
  return entityKind === 'staffDept' ? entityId : entityId
}
export function Taskbar() {
  const {app,openApps,taskbarApps,pinnedApps,instances,activeInstanceKey,activateInstance,closeInstance,closeApp,setActiveApp,pinApp,unpinApp,moveTaskbarApp}=useNgWorkspaceNavigation()
  const world=useGameStore(s=>s.world)
  const [instanceGroup,setInstanceGroup]=useState<WorkspaceAppId|null>(null)
  const [groupAnchor,setGroupAnchor]=useState({left:0,bottom:0})
  const groupExitTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const cancelGroupClose=()=>{
    if(groupExitTimer.current!==null){clearTimeout(groupExitTimer.current);groupExitTimer.current=null}
  }
  const scheduleGroupClose=()=>{
    cancelGroupClose()
    groupExitTimer.current=setTimeout(()=>{setInstanceGroup(null);groupExitTimer.current=null},200)
  }
  const busy=useGameStore(s=>s.simulationBusy)
  const [startOpen,setStartOpen]=useState(false)
  const [menu,setMenu]=useState<WorkspaceAppId|null>(null)
  const [moreOpen,setMoreOpen]=useState(false)
  const [capacity,setCapacity]=useState(12)
  const count=Math.max(1,capacity-(taskbarApps.length>capacity?1:0))
  const shown=taskbarApps.slice(0,count),overflow=taskbarApps.slice(count)
  const isOpen=(id:WorkspaceAppId)=>openApps.includes(id)
  const isPinned=(id:WorkspaceAppId)=>pinnedApps.includes(id)
  const closeMenu=()=>setMenu(null)
  const openInstanceGroup=(id:WorkspaceAppId, anchor:HTMLButtonElement)=>{
    cancelGroupClose()
    const box=anchor.getBoundingClientRect()
    setGroupAnchor({left:Math.max(8,Math.min(box.left,window.innerWidth-320)),bottom:window.innerHeight-box.top+6})
    setInstanceGroup(id)
    setMenu(null)
    setMoreOpen(false)
    setStartOpen(false)
  }
  const groupInstances=instanceGroup===null?[]:instances.filter(item=>item.app===instanceGroup)
  const beginDrag=(event:DragEvent,id:WorkspaceAppId)=>{
    if(id==='home'){event.preventDefault();return}
    event.dataTransfer.setData(APP_DRAG,id)
    event.dataTransfer.setData('text/plain',id)
    event.dataTransfer.effectAllowed='move'
  }
  const drop=(event:DragEvent,target?:WorkspaceAppId)=>{
    event.preventDefault()
    const id=draggedApp(event)
    if(!id||id==='home')return
    if(!taskbarApps.includes(id))pinApp(id)
    if(target)moveTaskbarApp(id,target)
    setStartOpen(false)
  }
  useEffect(()=>{
    const measure=()=>setCapacity(Math.max(2,Math.floor((window.innerWidth-300)/54)))
    measure();window.addEventListener('resize',measure)
    return()=>window.removeEventListener('resize',measure)
  },[])
  useEffect(()=>()=>cancelGroupClose(),[])
  useEffect(()=>{
    if(instanceGroup===null)return
    const closeOnOutside=(event:PointerEvent)=>{
      const target=event.target
      if(!(target instanceof Element))return
      if(target.closest('.ng-taskbar__instance-popover'))return
      if(target.closest('.ng-taskbar__app-slot[data-app="'+instanceGroup+'"]'))return
      cancelGroupClose()
      setInstanceGroup(null)
    }
    document.addEventListener('pointerdown',closeOnOutside,true)
    return()=>document.removeEventListener('pointerdown',closeOnOutside,true)
  },[instanceGroup])
  useEffect(()=>{
    const keys=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setMenu(null);setMoreOpen(false);setInstanceGroup(null)}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setStartOpen(true);setMenu(null)
      }
    }
    window.addEventListener('keydown',keys)
    return()=>window.removeEventListener('keydown',keys)
  },[])
  return <footer className="ng-taskbar" data-ng-region="taskbar">
    {startOpen?<NgStartMenu onClose={()=>setStartOpen(false)}/>:null}
    <div className="ng-taskbar__apps" role="toolbar" onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event)}>
      <button aria-label="Abrir menú de inicio BDM" aria-haspopup="dialog" aria-expanded={startOpen}
        className={`ng-taskbar__app ng-taskbar__start${startOpen?' is-open':''}`} type="button"
        onClick={()=>{setStartOpen(o=>!o);setMenu(null);setMoreOpen(false);cancelGroupClose();setInstanceGroup(null)}}>
        <CourtsideGlyph name="diamond"/>
      </button>
      {shown.map(id=>{
        const label=taskbarAppLabel(id),active=app===id,pinned=isPinned(id),opened=isOpen(id),menuOpen=menu===id
        const members=instances.filter(instance=>instance.app===id)
        const index=taskbarApps.indexOf(id)
        return <div key={id} className="ng-taskbar__app-slot" data-app={id}
          onPointerLeave={()=>{if(instanceGroup===id)scheduleGroupClose()}}
          onDragOver={event=>event.preventDefault()} onDrop={event=>{event.stopPropagation();drop(event,id)}}>
          <button type="button" aria-label={label} aria-current={active?'page':undefined}
            aria-expanded={id==='home'?undefined:instanceGroup===id||menuOpen} aria-haspopup={id==='home'?undefined:'menu'}
            className={`ng-taskbar__app${active?' is-active':''}${opened?' is-running':''}${pinned?' is-pinned':''}`}
            title={members.length>0?undefined:label} draggable={id!=='home'} onDragStart={event=>beginDrag(event,id)}
            onPointerEnter={event=>{if(members.length>0)openInstanceGroup(id,event.currentTarget)}}
            onFocus={event=>{if(members.length>0)openInstanceGroup(id,event.currentTarget)}}
            onClick={()=>{setActiveApp(id);setStartOpen(false);setMenu(null);setMoreOpen(false);cancelGroupClose();setInstanceGroup(null)}}
            onContextMenu={event=>{event.preventDefault();setStartOpen(false);cancelGroupClose();setInstanceGroup(null);setMenu(id==='home'?null:id)}}
            onAuxClick={event=>{if(event.button===1&&opened&&isClosableTaskbarApp(id)){event.preventDefault();closeApp(id);setMenu(null)}}}
            onMouseDown={event=>{if(event.button===1)event.preventDefault()}}>
            <CourtsideTaskbarIcon id={id}/><span>{label}</span>
          </button>
          {menuOpen?<><div className="ng-taskbar__menu-backdrop" data-ng-region="taskbar-app-menu" onPointerDown={closeMenu}/>
            <div className="ng-taskbar__menu" role="menu" aria-label={`Opciones de ${label}`}>
              <div className="ng-taskbar__menu-heading">{label}</div>
              <button role="menuitem" type="button" onClick={()=>{setActiveApp(id);closeMenu()}}>Activar última instancia</button>
              <button role="menuitem" type="button" onClick={()=>{pinned?unpinApp(id):pinApp(id);closeMenu()}}>
                {pinned?'Desanclar de barra':'Anclar a barra'}</button>
              <button role="menuitem" type="button" disabled={index<=1} onClick={()=>{moveTaskbarApp(id,taskbarApps[index-1]!);closeMenu()}}>Mover a la izquierda</button>
              <button role="menuitem" type="button" disabled={index===taskbarApps.length-1} onClick={()=>{moveTaskbarApp(id,taskbarApps[index+1]!);closeMenu()}}>Mover a la derecha</button>
              {opened&&isClosableTaskbarApp(id)?<button role="menuitem" type="button"
                onClick={()=>{closeApp(id);closeMenu();cancelGroupClose();setInstanceGroup(null)}}>Cerrar</button>:null}
            </div></>:null}
        </div>
      })}
      {overflow.length>0?<div className="ng-taskbar__overflow">
        <button className="ng-taskbar__app ng-taskbar__more" type="button" aria-expanded={moreOpen}
          aria-label={`${overflow.length} aplicaciones más`} onClick={()=>setMoreOpen(v=>!v)}>
          <CourtsideGlyph name="more"/><em>+{overflow.length}</em>
        </button>
        {moreOpen?<div className="ng-taskbar__overflow-list" role="menu">
          {overflow.map(id=><button key={id} type="button" role="menuitem"
            onClick={()=>{setActiveApp(id);setMoreOpen(false)}}>{taskbarAppLabel(id)}</button>)}
        </div>:null}
      </div>:null}
    </div>
    {instanceGroup!==null && groupInstances.length>0 && createPortal(<>
      <div className="ng-taskbar__instance-popover" role="menu"
        onPointerEnter={cancelGroupClose}
        onPointerLeave={scheduleGroupClose}
        aria-label={`Instancias de ${taskbarAppLabel(instanceGroup)}`}
        style={{left:groupAnchor.left,bottom:groupAnchor.bottom}}>
        {groupInstances.map(instance=><div key={instance.key} data-instance={instance.key}
          className={'ng-taskbar__instance-row'+(activeInstanceKey===instance.key?' is-active':'')}>
          <button type="button" role="menuitem" onClick={()=>{activateInstance(instance.key);setInstanceGroup(null)}}>
            <CourtsideTaskbarIcon id={instance.app}/>
            <span>{instanceLabel(instance,world)}</span>
          </button>
          <button type="button" className="ng-taskbar__instance-close"
            aria-label={'Cerrar '+instanceLabel(instance,world)}
            onClick={()=>{closeInstance(instance.key);if(groupInstances.length===1)setInstanceGroup(null)}}>×</button>
        </div>)}
      </div>
    </>,document.querySelector('.bdm-os-ng[data-bdm-courtside-shell="true"]') ?? document.body)}
    <span className="ng-taskbar__status">{busy?'Simulation running':'Simulation idle'}</span>
  </footer>
}
