import { useMemo, useState } from 'react'

import { PLANTILLA_VISUAL_MOCK_ROWS } from './PlantillaVisualMock'
import './CanonicalRoster.css'

const views = ['overview', 'ratings', 'physical', 'contracts'] as const
const labels = { overview: 'Overview', ratings: 'Ratings', physical: 'Physical', contracts: 'Contracts' } as const
const positions = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const
const positionsByRow = ['PG', 'PG', 'SG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'PF', 'C', 'C'] as const

export function CanonicalRoster() {
  const [view, setView] = useState<(typeof views)[number]>('contracts')
  const [position, setPosition] = useState<(typeof positions)[number]>('ALL')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const rows = useMemo(() => PLANTILLA_VISUAL_MOCK_ROWS.filter((row, index) => (position === 'ALL' || positionsByRow[index] === position) && row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [position, query])

  return <section className="canonical-roster">
    <header className="canonical-roster__toolbar">
      <div className="canonical-roster__identity"><span aria-hidden="true">▦</span><div><strong>Plantilla ({PLANTILLA_VISUAL_MOCK_ROWS.length})</strong><small>Casademont Zaragoza</small></div></div>
      <div className="canonical-roster__controls"><label>Vista<select aria-label="Vista" onChange={(event) => setView(event.target.value as typeof view)} value={view}>{views.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label><input aria-label="Buscar jugador" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugador..." value={query} /><button aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} type="button">Filtros</button><button aria-label="Más acciones" onClick={() => { setQuery(''); setPosition('ALL'); setOnlyAvailable(false) }} type="button">•••</button></div>
      <div className="canonical-roster__views">{views.map((item) => <button className={view === item ? 'is-active' : ''} key={item} onClick={() => setView(item)} type="button">{labels[item]}</button>)}<span>{positions.map((item) => <button className={position === item ? 'is-active' : ''} key={item} onClick={() => setPosition(item)} type="button">{item}</button>)}</span><small>{rows.length} / {PLANTILLA_VISUAL_MOCK_ROWS.length}</small></div>
      {filtersOpen && <div className="canonical-roster__filters"><label><input checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} type="checkbox" /> Solo disponibles</label><button onClick={() => { setPosition('ALL'); setOnlyAvailable(false) }} type="button">Limpiar filtros</button></div>}
    </header>
    <div className="canonical-roster__table-wrap"><table><thead><tr>{headersFor(view).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => { const index = PLANTILLA_VISUAL_MOCK_ROWS.indexOf(row); return <tr key={row.id}><td>{row.name}</td><td>{positionsByRow[index]}</td><td>{19 + (index % 12)}</td><td><span className="canonical-roster__status">{onlyAvailable ? 'Ready' : row.status}</span></td>{cellsFor(row.values, index, view).map((value, cellIndex) => <td key={cellIndex}>{value}</td>)}</tr> })}</tbody></table></div>
  </section>
}

function headersFor(view: (typeof views)[number]) { return view === 'contracts' ? ['PLAYER', 'POS', 'AGE', 'STATUS', 'SALARY', 'EXPIRES'] : view === 'physical' ? ['PLAYER', 'POS', 'AGE', 'STATUS', 'ATHLETICISM', 'STRENGTH'] : view === 'ratings' ? ['PLAYER', 'POS', 'AGE', 'STATUS', 'FIN', 'SHO', 'PMK'] : ['PLAYER', 'POS', 'AGE', 'STATUS', 'FIN', 'SHO'] }
function cellsFor(values: readonly number[], index: number, view: (typeof views)[number]) { if (view === 'contracts') return [`$${90 + index * 40}K`, `${2034 + (index % 4)}-10-01`]; if (view === 'physical') return [values[7]!, values[8]!]; return view === 'ratings' ? [values[0]!, values[1]!, values[2]!] : [values[0]!, values[1]!] }
