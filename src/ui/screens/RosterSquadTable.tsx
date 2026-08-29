import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { Player } from '@/domain/player'
import { exportGridCsv, loadGridPreferences, normalizeColumns, reorderColumn, saveGridPreferences, searchRows, sortRows, cycleSort, type DataGridColumn, type DataGridSelection, type DataGridSort, type DataGridView } from '@/ui/dataGrid'
import { moveFocus, selectRow } from '@/ui/dataGrid/selection'
import rosterIcon from '@/ui/assets/dock-icons-v3/roster.png'
import './RosterSquadTable.css'

type PositionFilter = 'ALL' | Player['basketball']['primaryPosition']

export type RosterSquadTableProps = {
  readonly title?: string
  readonly columns: readonly DataGridColumn<Player>[]
  readonly rows: readonly Player[]
  readonly views: readonly DataGridView[]
  readonly position: PositionFilter
  readonly onPositionChange: (position: PositionFilter) => void
  readonly selectedId?: Player['id']
  readonly onSelectedIdChange: (id: Player['id']) => void
  readonly onOpenPlayer?: (player: Player) => void
  readonly onOpenSection?: (appId: 'squad' | 'training' | 'tactics' | 'coach') => void
}

const gridKey = 'roster-squad-table-v1'
const positions: readonly PositionFilter[] = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C']

export function rosterViewColumns(views: readonly DataGridView[], activeViewId: string) {
  return views.find((view) => view.id === activeViewId)?.columnIds ?? views[0]?.columnIds ?? []
}

export function RosterSquadTable({ columns, rows, title = 'Roster', views, position, onPositionChange, selectedId, onSelectedIdChange, onOpenPlayer, onOpenSection }: RosterSquadTableProps) {
  const saved = useMemo(() => loadGridPreferences(gridKey), [])
  const [activeViewId, setActiveViewId] = useState(() => saved?.activeViewId ?? views[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [headerMenu, setHeaderMenu] = useState<{ readonly id: string; readonly x: number; readonly y: number }>()
  const [rowMenu, setRowMenu] = useState<{ readonly player: Player; readonly x: number; readonly y: number }>()
  const [sorts, setSorts] = useState<readonly DataGridSort[]>(() => saved?.sorting ?? [{ id: 'position', direction: 'ascending' }])
  const [order, setOrder] = useState<readonly string[]>(() => saved?.columnIds ?? rosterViewColumns(views, saved?.activeViewId ?? views[0]?.id ?? ''))
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>(() => saved?.columnWidths ?? {})
  const [selection, setSelection] = useState<DataGridSelection>(() => selectedId === undefined ? { selectedIds: [] } : { selectedIds: [selectedId], focusedId: selectedId, anchorId: selectedId })
  const [draggedColumn, setDraggedColumn] = useState<string>()
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0]
  const viewOrder = rosterViewColumns(views, activeView?.id ?? '')
  const viewColumns = useMemo(() => columns.filter((column) => viewOrder.includes(column.id)), [columns, viewOrder])
  const activeColumns = useMemo(() => normalizeColumns(viewColumns, order, []), [order, viewColumns])
  const filtered = useMemo(() => rows.filter((player) => position === 'ALL' || player.basketball.primaryPosition === position), [position, rows])
  const visibleRows = useMemo(() => sortRows(searchRows(filtered, columns, query), columns, sorts), [columns, filtered, query, sorts])
  const visibleIds = visibleRows.map((player) => player.id)
  const gridTemplateColumns = activeColumns.map((column) => `${columnWidth(column, widths)}px`).join(' ')

  useEffect(() => {
    const ids = rosterViewColumns(views, activeView?.id ?? '')
    setOrder((current) => {
      const next = [...current.filter((id) => ids.includes(id)), ...ids.filter((id) => !current.includes(id))]
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next
    })
  }, [activeView?.id, views])
  useEffect(() => {
    saveGridPreferences(gridKey, { schemaVersion: 1, activeViewId: activeView?.id ?? '', customViews: [], columnIds: order, hiddenColumnIds: [], columnWidths: widths, sorting: sorts, filters: [] })
  }, [activeView?.id, order, sorts, widths])
  useEffect(() => {
    if (selectedId !== undefined && !selection.selectedIds.includes(selectedId)) setSelection({ selectedIds: [selectedId], focusedId: selectedId, anchorId: selectedId })
  }, [selectedId, selection.selectedIds])

  const chooseView = (view: DataGridView) => setActiveViewId(view.id)
  const changeSort = (id: string, additive: boolean) => setSorts((current) => cycleSort(current, id, additive))
  const chooseRow = (player: Player, additive: boolean, range: boolean) => { const next = selectRow(selection, visibleIds, player.id, additive, range); setSelection(next); onSelectedIdChange(player.id) }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const next = moveFocus(selection, visibleIds, event.key === 'ArrowDown' ? 1 : -1, event.shiftKey)
    setSelection(next)
    if (next.focusedId !== undefined) onSelectedIdChange(next.focusedId as Player['id'])
  }
  const beginResize = (event: PointerEvent<HTMLSpanElement>, column: DataGridColumn<Player>) => {
    event.preventDefault(); const start = event.clientX; const initial = columnWidth(column, widths)
    const move = (moveEvent: globalThis.PointerEvent) => setWidths((current) => ({ ...current, [column.id]: clamp(initial + moveEvent.clientX - start, column.minWidth, column.maxWidth) }))
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  const csv = exportGridCsv(activeColumns, visibleRows)

  return <section aria-label="Roster squad table" className="roster-squad-table roster-page" onKeyDown={onKeyDown} tabIndex={0}>
    <div className="card roster-toolbar roster-full">
      <div className="roster-toolbar-top">
        <div className="roster-toolbar-left"><span className="roster-toolbar-icon"><img alt="" src={rosterIcon} /></span><span><strong className="roster-toolbar-title">Plantilla ({rows.length})</strong><small className="roster-toolbar-sub">{title}</small></span></div>
        <div className="roster-golden-selectors">{onOpenSection !== undefined && <label>SecciÃ³n<select aria-label="SecciÃ³n" onChange={(event) => { const id = event.target.value as 'squad' | 'training' | 'tactics' | 'coach'; if (id !== 'squad') onOpenSection(id) }} value="squad"><option value="squad">Plantilla</option><option value="training">Entrenamiento</option><option value="tactics">TÃ¡cticas</option><option value="coach">Club</option><option disabled value="medical">Medical (no disponible)</option></select></label>}<label>Vista<select aria-label="Vista" onChange={(event) => setActiveViewId(event.target.value)} value={activeView?.id ?? ''}>{views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label></div>
        <div className="roster-toolbar-right"><input aria-label="Search roster" className="roster-search" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugador..." value={query} /><button aria-expanded={filterOpen} className="icon-btn" onClick={() => { setFilterOpen((open) => !open); setMoreMenuOpen(false) }} type="button">Filtros</button><button aria-expanded={moreMenuOpen} className="icon-btn" onClick={() => setMoreMenuOpen((open) => !open)} title="Más acciones" type="button">•••</button></div>
      </div>
      <div className="roster-view-tabs">{views.map((view) => <button className={`roster-view-tab${view.id === activeView?.id ? ' active' : ''}`} key={view.id} onClick={() => chooseView(view)} type="button">{view.name}</button>)}<div aria-label="Position filter" className="roster-squad-table__positions">{positions.map((item) => <button className={item === position ? 'is-active' : ''} key={item} onClick={() => onPositionChange(item)} type="button">{item}</button>)}</div><span className="roster-squad-table__count">{visibleRows.length} / {rows.length}</span></div>
      {filterOpen && <div className="roster-squad-table__menu roster-squad-table__filter-menu"><button onClick={() => { onPositionChange('ALL'); setFilterOpen(false) }} type="button">Limpiar filtros de posición</button></div>}
      {moreMenuOpen && <div className="roster-squad-table__menu roster-squad-table__more-menu"><button onClick={() => { setQuery(''); setMoreMenuOpen(false) }} type="button">Limpiar búsqueda</button><a download="roster.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>Exportar CSV</a></div>}
    </div>
    <div className="card roster roster-full roster-grid-card"><div className="table roster-table roster-squad-table__viewport">
      <div className="row head roster-table roster-squad-table__grid" role="grid" style={{ gridTemplateColumns }}>
        {activeColumns.map((column) => <div className={`roster-head-cell${column.numeric ? ' is-numeric' : ''}`} draggable={column.id !== 'status'} key={column.id} onContextMenu={(event) => { event.preventDefault(); setHeaderMenu({ id: column.id, x: event.clientX, y: event.clientY }) }} onDragEnd={() => setDraggedColumn(undefined)} onDragOver={(event) => event.preventDefault()} onDragStart={() => setDraggedColumn(column.id)} onDrop={() => { if (draggedColumn !== undefined) setOrder((current) => reorderColumn(current, draggedColumn, column.id, false)) }} role="columnheader" title={column.label}>
          <button disabled={!column.sortable} onClick={(event) => column.sortable && changeSort(column.id, event.shiftKey)} type="button">{column.shortLabel ?? column.label}{sorts.find((sort) => sort.id === column.id)?.direction === 'ascending' ? ' ↑' : sorts.find((sort) => sort.id === column.id)?.direction === 'descending' ? ' ↓' : ''}</button>
          {column.resizable !== false && <span aria-label={`Resize ${column.label}`} className="roster-squad-table__resize" onPointerDown={(event) => beginResize(event, column)} />}
        </div>)}
        {visibleRows.map((player) => <RosterRow activeColumns={activeColumns} key={player.id} onContextMenu={(event) => setRowMenu({ player, x: event.clientX, y: event.clientY })} onOpen={onOpenPlayer} onSelect={chooseRow} player={player} selected={selection.selectedIds.includes(player.id)} />)}
      </div>
      {visibleRows.length === 0 && <p className="roster-squad-table__empty">Sin jugadores que coincidan.</p>}
    </div></div>
    {headerMenu !== undefined && <div className="roster-squad-table__context-menu" role="menu" style={{ left: headerMenu.x, top: headerMenu.y }}><button onClick={() => { setSorts((current) => [...current.filter((sort) => sort.id !== headerMenu.id), { id: headerMenu.id, direction: 'ascending' }]); setHeaderMenu(undefined) }} type="button">Sort ascending</button><button onClick={() => { setSorts((current) => [...current.filter((sort) => sort.id !== headerMenu.id), { id: headerMenu.id, direction: 'descending' }]); setHeaderMenu(undefined) }} type="button">Sort descending</button><button onClick={() => { setSorts((current) => current.filter((sort) => sort.id !== headerMenu.id)); setHeaderMenu(undefined) }} type="button">Clear sort</button><button onClick={() => { changeSort(headerMenu.id, true); setHeaderMenu(undefined) }} type="button">Add secondary sort</button><button onClick={() => { setWidths((current) => { const { [headerMenu.id]: _, ...next } = current; return next }); setHeaderMenu(undefined) }} type="button">Reset width</button></div>}
    {rowMenu !== undefined && <div className="roster-squad-table__context-menu" role="menu" style={{ left: rowMenu.x, top: rowMenu.y }}><button onClick={() => { onOpenPlayer?.(rowMenu.player); setRowMenu(undefined) }} type="button">Open player</button></div>}
  </section>
}

function RosterRow({ activeColumns, onContextMenu, onOpen, onSelect, player, selected }: { readonly activeColumns: readonly DataGridColumn<Player>[]; readonly onContextMenu: (event: MouseEvent<HTMLDivElement>) => void; readonly onOpen?: (player: Player) => void; readonly onSelect: (player: Player, additive: boolean, range: boolean) => void; readonly player: Player; readonly selected: boolean }) {
  return <>{activeColumns.map((column, index) => <div className={`roster-cell${column.numeric ? ' is-numeric' : ''}${selected ? ' is-selected' : ''}${index === 0 ? ' is-row-start' : ''}`} key={`${player.id}-${column.id}`} onClick={(event) => onSelect(player, event.metaKey || event.ctrlKey, event.shiftKey)} onDoubleClick={() => onOpen?.(player)} onContextMenu={(event) => { event.preventDefault(); onContextMenu(event) }} role="gridcell">{column.render(player) as ReactNode}</div>)}</>
}

function columnWidth(column: DataGridColumn<Player>, widths: Readonly<Record<string, number>>) { return clamp(widths[column.id] ?? column.width ?? column.defaultWidth ?? 80, column.minWidth, column.maxWidth) }
function clamp(value: number, min?: number, max?: number) { return Math.max(min ?? 20, Math.min(max ?? Number.POSITIVE_INFINITY, value)) }
