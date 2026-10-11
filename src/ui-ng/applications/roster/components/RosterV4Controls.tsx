import { useState } from 'react'
import { loadGridPreferences } from '@/ui/dataGrid/persistence'
import { COURTSIDE_ROSTER_GRID_PREFIX } from './CourtsideRosterTable'
import type { DataGridView } from '@/ui/dataGrid/types'
import { ROSTER_POSITION_FILTERS } from '@/ui-ng/applications/roster/rosterPositionFilter'
import { useRosterWorkspaceSession } from '@/ui-ng/applications/roster/rosterWorkspaceSession'
import {
  ROSTER_FILTER_FIELDS, EMPTY_ROSTER_V4_FILTERS,
  type RosterV4Filters, type RosterFilterCondition, type RosterFilterGroup, type RosterFilterField,
} from '@/ui-ng/applications/roster/rosterV4Filters'

const OPTIONS = [
  {id:'general',name:'GENERAL'}, {id:'performance',name:'RENDIMIENTO'},
  {id:'offense',name:'ATAQUE'}, {id:'defense',name:'DEFENSA'},
  {id:'brain',name:'MENTAL'}, {id:'physical',name:'FÍSICO'},
  {id:'ballHandling',name:'MANEJO'}, {id:'psico',name:'PSICOLOGÍA'},
  {id:'contracts',name:'CONTRATOS'}, {id:'development',name:'DESARROLLO'},
  {id:'custom',name:'PERSONALIZADA'},
] as const

interface NamedFilter { readonly name: string; readonly filters: RosterV4Filters }
const savedFilters = (): readonly NamedFilter[] => {
  try {
    const raw = localStorage.getItem('bdm:roster:v4:savedFilters')
    return raw === null ? [] : JSON.parse(raw) as NamedFilter[]
  } catch { return [] }
}
const saveFilters = (value: readonly NamedFilter[]) => {
  try { localStorage.setItem('bdm:roster:v4:savedFilters',JSON.stringify(value)) } catch { /* optional storage */ }
}
const viewName = (id: string, custom: readonly DataGridView[]) =>
  OPTIONS.find(option=>option.id===id)?.name ?? custom.find(view=>view.id===id)?.name ?? id

export function RosterV4Controls({ selectedCount, onOpenInspector }: {
  readonly selectedCount: number
  readonly onOpenInspector: () => void
}) {
  const activePreset = useRosterWorkspaceSession(s=>s.activePreset)
  const setActivePreset = useRosterWorkspaceSession(s=>s.setActivePreset)
  const favorites = useRosterWorkspaceSession(s=>s.favoritePresets)
  const setFavorites = useRosterWorkspaceSession(s=>s.setFavoritePresets)
  const customViews = useRosterWorkspaceSession(s=>s.customViews)
  const setCustomViews = useRosterWorkspaceSession(s=>s.setCustomViews)
  const position = useRosterWorkspaceSession(s=>s.positionFilter)
  const setPosition = useRosterWorkspaceSession(s=>s.setPositionFilter)
  const search = useRosterWorkspaceSession(s=>s.searchQuery)
  const setSearch = useRosterWorkspaceSession(s=>s.setSearchQuery)
  const filters = useRosterWorkspaceSession(s=>s.v4Filters)
  const setFilters = useRosterWorkspaceSession(s=>s.setV4Filters)
  const [advancedOpen,setAdvancedOpen] = useState(false)
  const [manageOpen,setManageOpen] = useState(false)
  const [saved,setSaved] = useState(savedFilters)
  const allOptions = [...OPTIONS,...customViews.map(view=>({id:view.id,name:view.name}))]
  const selectedIsCustom = customViews.some(view=>view.id===activePreset)
  const snapshot = () => loadGridPreferences(COURTSIDE_ROSTER_GRID_PREFIX+activePreset)
  const newView = (reuseName?: string) => {
    const name = reuseName ?? window.prompt('Nombre de la nueva vista')
    if (name === null || name === undefined || name.trim()==='') return
    const prefs = snapshot()
    const fallback = ['status','player','position','rotation','age']
    const columnIds = prefs === undefined ? fallback : prefs.columnIds.filter(id=>!prefs.hiddenColumnIds.includes(id))
    const view: DataGridView = {
      id:'roster-v4-'+Date.now(),name:name.trim(),columnIds,
      ...(prefs===undefined?{}:{columnWidths:prefs.columnWidths,sorting:prefs.sorting,filters:prefs.filters}),
    }
    setCustomViews([...customViews,view])
    setActivePreset(view.id)
  }
  const saveCurrentView = () => {
    if (!selectedIsCustom) { newView(); return }
    const prefs = snapshot()
    if (prefs===undefined) return
    setCustomViews(customViews.map(view=>view.id!==activePreset?view:{
      ...view,
      columnIds:prefs.columnIds.filter(id=>!prefs.hiddenColumnIds.includes(id)),
      columnWidths:prefs.columnWidths,sorting:prefs.sorting,filters:prefs.filters,
    }))
  }
  const columnManager = () =>
    document.querySelector<HTMLButtonElement>('.courtside-roster-table__columns-button')?.click()

  const saveFilter = () => {
    const name=window.prompt('Nombre de este filtro')
    if (name===null||name.trim()==='') return
    const next=[...saved.filter(item=>item.name!==name.trim()),{name:name.trim(),filters}]
    setSaved(next);saveFilters(next)
  }
  const addGroup = () => setFilters({...filters,groups:[...filters.groups,{
    id:'group-'+Date.now(),operator:'AND',conditions:[],
  }]})
  const updateGroup = (id:string, value:RosterFilterGroup) =>
    setFilters({...filters,groups:filters.groups.map(group=>group.id===id?value:group)})
  const addCondition = (group:RosterFilterGroup) => updateGroup(group.id,{...group,conditions:[
    ...group.conditions,{id:'condition-'+Date.now(),field:'age',operator:'lte',value:'25'},
  ]})
  const updateCondition = (group:RosterFilterGroup, value:RosterFilterCondition) =>
    updateGroup(group.id,{...group,conditions:group.conditions.map(row=>row.id===value.id?value:row)})
  return <div className="roster-v4__controls" data-ng-region="roster-v4-controls">
    <div className="roster-v4__views" aria-label="Vistas de plantilla">
      <strong>VISTAS ★</strong>
      {favorites.map(id=><button type="button" key={id} aria-pressed={activePreset===id}
        className={activePreset===id?'is-active':''} onClick={()=>setActivePreset(id)}>
        {viewName(id,customViews)}</button>)}
      <select aria-label="Todas las vistas de plantilla" value=""
        onChange={event=>{if(event.target.value)setActivePreset(event.target.value)}}>
        <option value="">TODAS LAS VISTAS ▾</option>
        {allOptions.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}
      </select>
      <span className="roster-v4__push"/>
      <button type="button" onClick={()=>newView()}>+ NUEVA VISTA</button>
      <button type="button" onClick={saveCurrentView}>GUARDAR VISTA</button>
      <button type="button" onClick={()=>setManageOpen(!manageOpen)} aria-expanded={manageOpen}>GESTIONAR</button>
    </div>
    {manageOpen && <section className="roster-v4__manage" aria-label="Gestionar vistas">
      <strong>Vistas favoritas</strong>
      <p>Fija hasta seis vistas en la barra. Las demás siguen disponibles en el desplegable.</p>
      {allOptions.map(view=><label key={view.id}><input type="checkbox"
        checked={favorites.includes(view.id)} disabled={!favorites.includes(view.id)&&favorites.length>=6}
        onChange={()=>setFavorites(favorites.includes(view.id)?favorites.filter(id=>id!==view.id):[...favorites,view.id])}/>
        {view.name}
        {customViews.some(item=>item.id===view.id)&&<button type="button" onClick={()=>{
          const name=window.prompt('Nuevo nombre',view.name)
          if(name?.trim())setCustomViews(customViews.map(item=>item.id===view.id?{...item,name:name.trim()}:item))
        }}>Renombrar</button>}
        {customViews.some(item=>item.id===view.id)&&<button type="button" onClick={()=>{
          setCustomViews(customViews.filter(item=>item.id!==view.id))
          setFavorites(favorites.filter(id=>id!==view.id))
          if(activePreset===view.id)setActivePreset('general')
        }}>Eliminar</button>}
      </label>)}
    </section>}
    <div className="roster-v4__filters">
      <strong>FILTROS RÁPIDOS</strong>
      <label>POSICIÓN<select aria-label="Posición del roster" value={position}
        onChange={event=>setPosition(event.target.value as typeof position)}>
        {ROSTER_POSITION_FILTERS.map(value=><option key={value} value={value}>{value==='ALL'?'Todas':value}</option>)}
      </select></label>
      <label>LESIONES<select aria-label="Filtro lesiones" value={filters.availability}
        onChange={event=>setFilters({...filters,availability:event.target.value as RosterV4Filters['availability']})}>
        <option value="all">Todos</option><option value="without-injury">Sin lesión actual</option>
        <option value="injured">Lesionados</option></select></label>
      <label>EDAD<select aria-label="Filtro edad" value={filters.ageMax??'all'}
        onChange={event=>setFilters({...filters,ageMax:event.target.value==='all'?null:Number(event.target.value)})}>
        <option value="all">Sin límite</option><option value="21">Hasta 21</option>
        <option value="23">Hasta 23</option><option value="25">Hasta 25</option>
        <option value="30">Hasta 30</option></select></label>
      <label>CONTRATO<select aria-label="Filtro contrato" value={filters.contract}
        onChange={event=>setFilters({...filters,contract:event.target.value as RosterV4Filters['contract']})}>
        <option value="all">Todos</option><option value="expiring">Vence esta temporada</option>
        <option value="active">Más allá temporada</option><option value="none">Sin contrato</option></select></label>
      <button type="button" className="roster-v4__filter-trigger" aria-expanded={advancedOpen}
        onClick={()=>setAdvancedOpen(!advancedOpen)}>≡ FILTRO AVANZADO</button>
      <button type="button" onClick={()=>{setFilters(EMPTY_ROSTER_V4_FILTERS);setPosition('ALL');setSearch('')}}>LIMPIAR</button>
      <input type="search" aria-label="Buscar jugador en roster" placeholder="Buscar jugador..."
        value={search} onChange={event=>setSearch(event.target.value)}/>
    </div>
    {advancedOpen && <section className="roster-v4__advanced" aria-label="Constructor de filtros avanzados">
      <div className="roster-v4__advanced-top">
        <strong>CONSTRUCTOR DE FILTROS · Y / O</strong>
        <label>ENTRE GRUPOS <select aria-label="Operador entre grupos" value={filters.groupOperator}
          onChange={event=>setFilters({...filters,groupOperator:event.target.value as 'AND'|'OR'})}>
          <option value="AND">Y</option><option value="OR">O</option></select></label>
        <button type="button" onClick={addGroup}>+ GRUPO</button>
        <button type="button" onClick={saveFilter}>GUARDAR FILTRO</button>
        <select aria-label="Filtros guardados" value="" onChange={event=>{
          const selected=saved.find(item=>item.name===event.target.value)
          if(selected)setFilters(selected.filters)
        }}><option value="">Cargar filtro guardado…</option>{saved.map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select>
        <button type="button" onClick={()=>setAdvancedOpen(false)}>CERRAR</button>
      </div>
      {filters.groups.map(group=><div className="roster-v4__group" key={group.id}>
        <label>CONDICIONES <select aria-label={'Operador del '+group.id} value={group.operator}
          onChange={event=>updateGroup(group.id,{...group,operator:event.target.value as 'AND'|'OR'})}>
          <option value="AND">TODAS (Y)</option><option value="OR">CUALQUIERA (O)</option></select></label>
        {group.conditions.map(condition=><div className="roster-v4__condition" key={condition.id}>
          <select aria-label="Campo filtro" value={condition.field} onChange={event=>{
            const field=event.target.value as RosterFilterField
            updateCondition(group,{...condition,field,operator:ROSTER_FILTER_FIELDS.find(item=>item.id===field)?.numeric?'lte':'equals',value:''})
          }}>{ROSTER_FILTER_FIELDS.map(field=><option key={field.id} value={field.id}>{field.label}</option>)}</select>
          <select aria-label="Comparación filtro" value={condition.operator} onChange={event=>
            updateCondition(group,{...condition,operator:event.target.value as RosterFilterCondition['operator']})}>
            <option value="equals">Es igual a</option>
            {ROSTER_FILTER_FIELDS.find(item=>item.id===condition.field)?.numeric&&<>
              <option value="gte">Mayor o igual</option><option value="lte">Menor o igual</option></>}
          </select>
          <input aria-label="Valor de filtro" value={condition.value} placeholder="Valor"
            onChange={event=>updateCondition(group,{...condition,value:event.target.value})}/>
          <button type="button" onClick={()=>updateGroup(group.id,{...group,
            conditions:group.conditions.filter(item=>item.id!==condition.id)})}>Quitar</button>
        </div>)}
        <button type="button" onClick={()=>addCondition(group)}>+ CONDICIÓN</button>
        <button type="button" onClick={()=>setFilters({...filters,groups:filters.groups.filter(item=>item.id!==group.id)})}>ELIMINAR GRUPO</button>
      </div>)}
      {filters.groups.length===0&&<p>Añade un grupo para combinar edad, posición, fatiga, nacionalidad y contrato sin alterar la vista de columnas.</p>}
      {saved.length>0&&<div className="roster-v4__saved">{saved.map(item=><button key={item.name} type="button"
        onClick={()=>{const next=saved.filter(entry=>entry.name!==item.name);setSaved(next);saveFilters(next)}}>Eliminar: {item.name}</button>)}</div>}
    </section>}
    <div className="roster-v4__table-actions">
      <strong>PLANTILLA / {viewName(activePreset,customViews)}</strong><span>{selectedCount} seleccionado(s)</span>
      <span className="roster-v4__push"/>
      <button type="button" disabled={selectedCount!==1} onClick={onOpenInspector}>INSPECTOR ↗</button>
      <button type="button" onClick={columnManager}>≡ COLUMNAS</button>
      <span className="roster-v4__hint">↔ Deslizar · Redimensionar · Reordenar</span>
    </div>
  </div>
}
