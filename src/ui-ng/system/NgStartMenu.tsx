import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { getUserTeam } from '@/engine/calendar'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { CourtsideTaskbarIcon, CourtsideGlyph } from '@/ui-ng/system/CourtsideGlyph'
import {
  filterStartMenuApps,
  startMenuAppLabel,
  visibleStartMenuGroups,
  type StartMenuGroup,
} from '@/ui-ng/system/startMenuCatalog'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import type { WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'
import './ng-start-menu.css'

/** Icons are the exact static SVG set imported from Courtside's art.js. */
const CATEGORY_GLYPHS: Readonly<Record<string, string>> = {
  equipo: 'roster',
  talent: 'target',
  partidos: 'trophy',
  mercado: 'swap',
  club: 'building',
  carrera: 'player',
  mundo: 'news',
  college: 'graduation',
}

function groupGlyph(group: StartMenuGroup): string {
  return CATEGORY_GLYPHS[group.id] ?? 'more'
}

export function NgStartMenu({ onClose }: { readonly onClose: () => void }) {
  const {app,setActiveApp,pinnedApps,pinApp,unpinApp}=useNgWorkspaceNavigation()
  const world=useGameStore(s=>s.world)
  const searchRef=useRef<HTMLInputElement>(null)
  const [query,setQuery]=useState('')
  const [selectedGroup,setSelectedGroup]=useState<string>('equipo')
  const [context,setContext]=useState<WorkspaceAppId|null>(null)
  const capabilities=useMemo(()=>world===null?undefined:resolveGameCapabilities(world),[world])
  const visibleApps=useMemo(()=>filterStartMenuApps(query,capabilities),[query,capabilities])
  const groups=useMemo(()=>visibleStartMenuGroups(capabilities),[capabilities])
  const activeGroup=groups.find(group=>group.id===selectedGroup) ?? groups[0]
  const searching=query.trim().length>0
  const listedApps=searching ? visibleApps : activeGroup?.appIds ?? []
  const categoryPanelRef=useRef<HTMLDivElement>(null)
  const team=world===null?undefined:getUserTeam(world)

  const open=(id:WorkspaceAppId)=>{setActiveApp(id);onClose()}
  const drag=(event:DragEvent,id:WorkspaceAppId)=>{
    if(id==='home'){event.preventDefault();return}
    event.dataTransfer.setData('application/x-bdm-courtside-app',id)
    event.dataTransfer.setData('text/plain',id)
    event.dataTransfer.effectAllowed='move'
  }
  const pickGroup=(id:string)=>{
    setSelectedGroup(id)
    setQuery('')
    setContext(null)
    categoryPanelRef.current?.scrollTo({top:0,behavior:'instant'})
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){if(context!==null)setContext(null);else onClose()}
    }
    window.addEventListener('keydown',key)
    searchRef.current?.focus()
    return()=>window.removeEventListener('keydown',key)
  },[onClose,context])

  const tile=(id:WorkspaceAppId)=><div className="ng-start-menu__tile-wrap" key={id}>
    <button type="button" className={`ng-start-menu__tile ng-start-menu__tile--app${app===id?' is-current':''}`}
      aria-current={app===id?'page':undefined} title={startMenuAppLabel(id)}
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

      <nav className="ng-start-menu__group-picker" aria-label="Categorías de aplicaciones">
        <div className="ng-start-menu__group-heading">
          <h2>CATEGORÍAS</h2>
          <small>Selecciona una categoría para ver sus aplicaciones</small>
        </div>
        <div className="ng-start-menu__group-list">
          {groups.map(group=><button key={group.id} type="button"
            className={`ng-start-menu__group-button${!searching&&activeGroup?.id===group.id?' is-selected':''}`}
            aria-pressed={!searching&&activeGroup?.id===group.id}
            aria-controls="bdm-start-active-category"
            onClick={()=>pickGroup(group.id)}>
            <span className="ng-start-menu__group-icon"><CourtsideGlyph name={groupGlyph(group)} size={26}/></span>
            <span className="ng-start-menu__group-label">{group.label}</span>
          </button>)}
        </div>
      </nav>

      <div id="bdm-start-active-category" className="ng-start-menu__categories" ref={categoryPanelRef}>
        <section className="ng-start-menu__category"
          data-category={searching?'search':activeGroup?.id??'none'}>
          <div className="ng-start-menu__category-title">
            <h3>{searching?'Resultados de búsqueda':activeGroup?.label??'Sin categorías disponibles'}</h3>
            <p>{searching
              ? `${listedApps.length} aplicaciones encontradas en todas las categorías`
              : activeGroup?.description??'No hay aplicaciones disponibles'}</p>
          </div>
          {listedApps.length>0
            ? <div className="ng-start-menu__category-apps">{listedApps.map(tile)}</div>
            : <p className="ng-canon__empty">No hay aplicaciones que coincidan con la búsqueda.</p>}
        </section>
      </div>

      <footer className="ng-start-menu__footer">
        <span className="ng-start-menu__avatar">BDM</span>
        <span>{team?.name??'Basket Dynasty Manager'} <small>{world?.currentDate??''}</small></span>
        <span className="ng-start-menu__footer-right">COURTSIDE</span>
      </footer>
    </section>
  </div>
}
