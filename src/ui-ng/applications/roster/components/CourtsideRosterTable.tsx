import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Player } from '@/domain/player'
import type { DataGridColumn, DataGridSort, DataGridView } from '@/ui/dataGrid/types'
import { loadGridPreferences, saveGridPreferences } from '@/ui/dataGrid/persistence'
import { normalizeColumns, reorderColumn } from '@/ui/dataGrid/columns'
import { searchRows } from '@/ui/dataGrid/filtering'
import { sortRows } from '@/ui/dataGrid/sorting'
import { exportGridCsv } from '@/ui/dataGrid/export'
import { emptySelection, moveFocus, selectRow } from '@/ui/dataGrid/selection'
import { useEntityContextMenu } from '@/ui/entityContextMenu/EntityContextMenuProvider'

/** Independent Courtside presentation. CanonicalRoster prepares real values; no legacy grid styles are reused. */
export const COURTSIDE_ROSTER_GRID_PREFIX = 'courtside-roster-v5-'

export function CourtsideRosterTable({ columns, rows, view, searchQuery, selectedIds, onSelectionChange, onOpenPlayer }: {
  readonly columns: readonly DataGridColumn<Player>[]
  readonly rows: readonly Player[]
  readonly view: DataGridView
  readonly searchQuery: string
  readonly selectedIds: readonly string[]
  readonly onSelectionChange: (ids: readonly string[]) => void
  readonly onOpenPlayer: (player: Player) => void
}) {
  const key=COURTSIDE_ROSTER_GRID_PREFIX+view.id
  const stored=useMemo(()=>loadGridPreferences(key),[key])
  const required=columns.filter(c=>c.required).map(c=>c.id)
  const initialOrder=Array.from(new Set([...required,...view.columnIds]))
  const [order,setOrder]=useState<readonly string[]>(()=>stored?.columnIds??initialOrder)
  const [hidden,setHidden]=useState<readonly string[]>(()=>stored?.hiddenColumnIds??columns.map(c=>c.id).filter(id=>!initialOrder.includes(id)))
  const [widths,setWidths]=useState<Readonly<Record<string,number>>>(()=>stored?.columnWidths??view.columnWidths??{})
  const [sorting,setSorting]=useState<readonly DataGridSort[]>(()=>stored?.sorting??view.sorting??[])
  const [manager,setManager]=useState(false)
  const [menu,setMenu]=useState<string|null>(null)
  const [dragging,setDragging]=useState<string|null>(null)
  const entityMenu=useEntityContextMenu()
  const visibleColumns=useMemo(()=>normalizeColumns(columns,order,hidden),[columns,order,hidden])
  const visibleRows=useMemo(()=>sortRows(searchRows(rows,columns,searchQuery),columns,sorting),[rows,columns,searchQuery,sorting])
  const ids=useMemo(()=>visibleRows.map(row=>row.id),[visibleRows])
  const hasSelected=(id:string)=>selectedIds.includes(id)
  useEffect(()=>{saveGridPreferences(key,{
    schemaVersion:1,activeViewId:view.id,customViews:[],
    columnIds:order,hiddenColumnIds:hidden,columnWidths:widths,sorting,filters:[],
  })},[key,view.id,order,hidden,widths,sorting])
  const changeSelection=(next:readonly string[])=>onSelectionChange(next)
  const clickRow=(id:string,ctrl:boolean,shift:boolean)=>{
    const current={selectedIds,anchorId:selectedIds[0],focusedId:selectedIds[selectedIds.length-1]}
    changeSelection(selectRow(current,ids,id,ctrl,shift).selectedIds)
  }
  const changeSort=(id:string,append:boolean)=>{
    setSorting(old=>{
      const previous=old.find(s=>s.id===id)
      const next:DataGridSort={id,direction:previous?.direction==='ascending'?'descending':'ascending'}
      return [...(append?old.filter(s=>s.id!==id):[]),next]
    })
    setMenu(null)
  }
  const resize=(id:string,event:ReactPointerEvent<HTMLSpanElement>)=>{
    event.preventDefault();event.stopPropagation()
    const col=columns.find(c=>c.id===id)
    const start=event.clientX
    const from=widths[id]??col?.defaultWidth??col?.width??95
    const move=(e:PointerEvent)=>setWidths(old=>({...old,
      [id]:Math.max(col?.minWidth??48,Math.min(col?.maxWidth??600,from+e.clientX-start)),
    }))
    const done=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',done)}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',done)
  }
  const toggleColumn=(id:string)=>setHidden(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])
  const exportCsv=()=>{
    const blob=new Blob([exportGridCsv(visibleColumns,visibleRows)],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download='BDM-Roster-'+view.name.replace(/[^a-z0-9]+/gi,'-')+'.csv';link.click()
    URL.revokeObjectURL(url)
  }
  const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
    if((event.target as HTMLElement).closest('input,select,textarea,button'))return
    if(event.key==='Escape'){setManager(false);setMenu(null);changeSelection([]);return}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();changeSelection(ids);return}
    if(event.key==='Enter'){const p=visibleRows.find(r=>r.id===selectedIds.at(-1));if(p)onOpenPlayer(p);return}
    const delta=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='PageDown'?10:event.key==='PageUp'?-10:undefined
    if(delta!==undefined){event.preventDefault()
      const next=moveFocus({selectedIds,anchorId:selectedIds[0],focusedId:selectedIds.at(-1)},ids,delta,event.shiftKey)
      changeSelection(next.selectedIds)
    }
  }
  const totalWidth=visibleColumns.reduce((n,c)=>n+(widths[c.id]??c.defaultWidth??c.width??90),0)
  const style={width:Math.max(750,totalWidth)} as CSSProperties
  return <div className="courtside-roster-table bdm-data-table" role="region"
    aria-label="Plantilla Courtside" tabIndex={0} onKeyDown={keyboard}>
    <div className="courtside-roster-table__hidden-tools">
      <button type="button" aria-label="Configurar columnas Courtside" className="courtside-roster-table__columns-button"
        onClick={()=>{setManager(v=>!v);setMenu(null)}}>Columnas</button>
    </div>
    {manager&&<aside className="courtside-roster-table__manager" aria-label="Editor de columnas">
      <div className="courtside-roster-table__manager-head"><strong>COLUMNAS · {view.name}</strong>
        <button type="button" onClick={()=>setManager(false)}>CERRAR ×</button></div>
      <p>Marca las columnas que quieres ver. Arrastra sus cabeceras para ordenarlas y sus bordes para cambiar su anchura.</p>
      <div className="courtside-roster-table__manager-list">
        {columns.map(c=><label key={c.id}><input type="checkbox" checked={!hidden.includes(c.id)}
          disabled={c.required} onChange={()=>toggleColumn(c.id)}/>{c.label}</label>)}
      </div>
      <div className="courtside-roster-table__manager-foot">
        <button type="button" onClick={()=>{
          setOrder(initialOrder)
          setHidden(columns.map(c=>c.id).filter(id=>!initialOrder.includes(id)))
          setWidths({})
          setSorting([])
        }}>RESTAURAR VISTA</button>
        <button type="button" onClick={exportCsv}>EXPORTAR CSV</button>
      </div>
    </aside>}
    <table style={style}>
      <thead><tr>{visibleColumns.map(c=><th key={c.id} draggable={!c.required}
        style={{width:widths[c.id]??c.defaultWidth??c.width??90,
          minWidth:c.minWidth??48}} className={c.numeric?'is-numeric':undefined}
        aria-sort={sorting[0]?.id===c.id?sorting[0].direction:undefined}
        onDragStart={()=>setDragging(c.id)}
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{e.preventDefault();if(dragging&&dragging!==c.id)
          setOrder(old=>reorderColumn(old,dragging,c.id,e.clientX>e.currentTarget.getBoundingClientRect().left+e.currentTarget.clientWidth/2))
          setDragging(null)}}
        onContextMenu={e=>{e.preventDefault();setMenu(c.id)}}>
        <button type="button" title={'Ordenar: '+c.label} onClick={e=>changeSort(c.id,e.shiftKey)}>
          {c.shortLabel??c.label}{sorting.map((s,i)=>s.id===c.id?(s.direction==='ascending'?' ↑':' ↓')+(i>0?String(i+1):''):'').join('')}
        </button><span className="courtside-roster-table__resize" aria-label={'Resize '+c.label}
          onPointerDown={e=>resize(c.id,e)}/></th>)}</tr></thead>
      <tbody>{visibleRows.length===0?<tr><td colSpan={visibleColumns.length} className="courtside-roster-table__empty">No hay jugadores que coincidan con los filtros.</td></tr>:
        visibleRows.map(player=><tr key={player.id} data-player-id={player.id}
          aria-selected={hasSelected(player.id)} className={hasSelected(player.id)?'is-selected':''}
          onClick={e=>clickRow(player.id,e.ctrlKey||e.metaKey,e.shiftKey)}
          onDoubleClick={()=>onOpenPlayer(player)}
          onContextMenu={e=>{e.preventDefault();entityMenu.open({type:'player',id:player.id},e,{surface:'roster'})}}>
          {visibleColumns.map(c=><td key={c.id} className={c.numeric?'is-numeric':undefined}
            style={{width:widths[c.id]??c.defaultWidth??c.width??90,minWidth:c.minWidth??48}}>
            {c.render(player)}</td>)}</tr>)}
      </tbody>
    </table>
    {menu&&<div role="menu" className="courtside-roster-table__header-menu">
      <button onClick={()=>changeSort(menu,false)}>Orden ascendente</button>
      <button onClick={()=>changeSort(menu,false)}>Invertir orden</button>
      <button onClick={()=>{toggleColumn(menu);setMenu(null)}}>Ocultar columna</button>
      <button onClick={()=>{setManager(true);setMenu(null)}}>Configurar columnas</button>
      <button onClick={()=>setMenu(null)}>Cerrar</button>
    </div>}
  </div>
}
