import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { getUserTeam } from '@/engine/calendar'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { CourtsideTaskbarIcon, CourtsideGlyph } from '@/ui-ng/system/CourtsideGlyph'
import { filterStartMenuApps, startMenuAppLabel, visibleStartMenuGroups } from '@/ui-ng/system/startMenuCatalog'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'
import './ng-start-menu.css'

export function NgStartMenu({ onClose }: { readonly onClose: () => void }) {
  const {app,setActiveApp,openApps,pinnedApps,pinApp,unpinApp}=useNgWorkspaceNavigation()
  const world=useGameStore(s=>s.world)
  const searchRef=useRef<HTMLInputElement>(null)
  const [query,setQuery]=useState('')
  const [context,setContext]=useState<WorkspaceAppId|null>(null)
  const capabilities=useMemo(()=>world===null?undefined:resolveGameCapabilities(world),[world])
  const visibleApps=useMemo(()=>filterStartMenuApps(query,capabilities),[query,capabilities])
  const groups=useMemo(()=>visibleStartMenuGroups(capabilities),[capabilities])
  const pinned=pinnedApps.filter(id=>visibleApps.includes(id))
  const recent=openApps.filter(id=>id!=='home'&&visibleApps.includes(id)).slice(-6).reverse()
  const team=world===null?undefined:getUserTeam(world)
  const open=(id:WorkspaceAppId)=>{setActiveApp(id);onClose()}
  const drag=(event:DragEvent,id:WorkspaceAppId)=>{
    if(id==='home'){event.preventDefault();return}
    event.dataTransfer.setData('application/x-bdm-courtside-app',id)
    event.dataTransfer.setData('text/plain',id)
    event.dataTransfer.effectAllowed='move'
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){if(context!==null)setContext(null);else onClose()}
    }
    window.addEventListener('keydown',key)
    searchRef.current?.focus()
    return()=>window.removeEventListener('keydown',key)
  },[onClose,context])
  const tile=(id:WorkspaceAppId,kind:'pinned'|'app')=><div className="ng-start-menu__tile-wrap" key={id}>
    <button type="button" className={`ng-start-menu__tile ng-start-menu__tile--${kind}${app===id?' is-current':''}`}
      aria-current={app===id?'page':undefined}
      draggable={id!=='home'} onDragStart={event=>drag(event,id)}
      onContextMenu={event=>{event.preventDefault();setContext(context===id?null:id)}}
      onClick={()=>open(id)}>
      <span className="ng-start-menu__icon"><CourtsideTaskbarIcon id={id}/></span>
      <span className="ng-start-menu__tile-label">{startMenuAppLabel(id)}</span>
      {pinnedApps.includes(id)?<span aria-label="Anclada" className="ng-start-menu__pinned"><CourtsideGlyph name="pin" size={12}/></span>:null}
    </button>
    {context===id?<div className="ng-start-menu__context" role="menu" aria-label={`Opciones de ${startMenuAppLabel(id)}`}>
      <button type="button" role="menuitem" onClick={()=>open(id)}>Abrir</button>
      {id!=='home'?<button type="button" role="menuitem"
        onClick={()=>{pinnedApps.includes(id)?unpinApp(id):pinApp(id);setContext(null)}}>
        {pinnedApps.includes(id)?'Desanclar de barra':'Anclar a barra de tareas'}
      </button>:null}
    </div>:null}
  </div>
  return <div className="ng-start-backdrop" data-ng-region="start-menu-backdrop"
    onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="ng-start-menu" role="dialog" aria-label="BDM Inicio" data-ng-region="start-menu">
      <header className="ng-start-menu__search">
        <label><CourtsideGlyph name="scouting" size={18}/>
          <input ref={searchRef} aria-label="Buscar en BDM" placeholder="Buscar aplicaciones..."
            value={query} onChange={event=>setQuery(event.target.value)}/>
          <kbd>Ctrl K</kbd>
        </label>
      </header>
      {pinned.length>0?<section className="ng-start-menu__pinned-area">
        <h2>FIJADAS <small>Arrastra cualquier aplicación a la barra inferior para anclarla</small></h2>
        <div className="ng-start-menu__pinned-grid">{pinned.map(id=>tile(id,'pinned'))}</div>
      </section>:null}
      {recent.length>0&&query.trim()===''?<section className="ng-start-menu__recent">
        <h2>ABIERTAS RECIENTEMENTE</h2>
        <div className="ng-start-menu__recent-grid">{recent.map(id=>tile(id,'app'))}</div>
      </section>:null}
      <div className="ng-start-menu__categories">
        <h2>TODAS LAS CATEGORÍAS</h2>
        {groups.map(group=>{
          const apps=group.appIds.filter(id=>visibleApps.includes(id))
          if(apps.length===0)return null
          return <section key={group.id} className="ng-start-menu__category">
            <div className="ng-start-menu__category-title">
              <h3>{group.label}</h3><p>{group.description}</p>
            </div>
            <div className="ng-start-menu__category-apps">{apps.map(id=>tile(id,'app'))}</div>
          </section>
        })}
        {visibleApps.length===0?<p className="ng-canon__empty">No hay aplicaciones que coincidan con la búsqueda.</p>:null}
      </div>
      <footer className="ng-start-menu__footer">
        <span className="ng-start-menu__avatar">BDM</span>
        <span>{team?.name??'Basket Dynasty Manager'} <small>{world?.currentDate??''}</small></span>
        <span className="ng-start-menu__footer-right">COURTSIDE</span>
      </footer>
    </section>
  </div>
}
