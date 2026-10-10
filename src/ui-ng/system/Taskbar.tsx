import { useEffect, useState, type DragEvent } from 'react'
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
export function Taskbar() {
  const {app,openApps,taskbarApps,pinnedApps,closeApp,setActiveApp,pinApp,unpinApp,moveTaskbarApp}=useNgWorkspaceNavigation()
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
  useEffect(()=>{
    const keys=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setMenu(null);setMoreOpen(false)}
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
        onClick={()=>{setStartOpen(o=>!o);setMenu(null);setMoreOpen(false)}}>
        <CourtsideGlyph name="diamond"/>
      </button>
      {shown.map(id=>{
        const label=taskbarAppLabel(id),active=app===id,pinned=isPinned(id),opened=isOpen(id),menuOpen=menu===id
        const index=taskbarApps.indexOf(id)
        return <div key={id} className="ng-taskbar__app-slot" data-app={id}
          onDragOver={event=>event.preventDefault()} onDrop={event=>{event.stopPropagation();drop(event,id)}}>
          <button type="button" aria-label={label} aria-current={active?'page':undefined}
            aria-expanded={id==='home'?undefined:menuOpen} aria-haspopup={id==='home'?undefined:'menu'}
            className={`ng-taskbar__app${active?' is-active':''}${opened?' is-running':''}${pinned?' is-pinned':''}`}
            title={label} draggable={id!=='home'} onDragStart={event=>beginDrag(event,id)}
            onClick={()=>{setActiveApp(id);setStartOpen(false);setMenu(null);setMoreOpen(false)}}
            onContextMenu={event=>{event.preventDefault();setStartOpen(false);setMenu(id==='home'?null:id)}}
            onAuxClick={event=>{if(event.button===1&&opened&&isClosableTaskbarApp(id)){event.preventDefault();closeApp(id);setMenu(null)}}}
            onMouseDown={event=>{if(event.button===1)event.preventDefault()}}>
            <CourtsideTaskbarIcon id={id}/><span>{label}</span>
          </button>
          {menuOpen?<><div className="ng-taskbar__menu-backdrop" data-ng-region="taskbar-app-menu" onPointerDown={closeMenu}/>
            <div className="ng-taskbar__menu" role="menu" aria-label={`Opciones de ${label}`}>
              <div className="ng-taskbar__menu-heading">{label}</div>
              <button role="menuitem" type="button" onClick={()=>{setActiveApp(id);closeMenu()}}>Activar</button>
              {opened&&isClosableTaskbarApp(id)?<button role="menuitem" type="button" onClick={()=>{closeApp(id);closeMenu()}}>Cerrar</button>:null}
              <button role="menuitem" type="button" onClick={()=>{pinned?unpinApp(id):pinApp(id);closeMenu()}}>
                {pinned?'Desanclar de barra':'Anclar a barra'}</button>
              <button role="menuitem" type="button" disabled={index<=1} onClick={()=>{moveTaskbarApp(id,taskbarApps[index-1]!);closeMenu()}}>Mover a la izquierda</button>
              <button role="menuitem" type="button" disabled={index===taskbarApps.length-1} onClick={()=>{moveTaskbarApp(id,taskbarApps[index+1]!);closeMenu()}}>Mover a la derecha</button>
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
    <span className="ng-taskbar__status">{busy?'Simulation running':'Simulation idle'}</span>
  </footer>
}
