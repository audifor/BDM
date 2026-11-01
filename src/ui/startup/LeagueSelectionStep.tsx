import { useMemo, useState } from 'react'
import {
  ACB_TEST_UNIVERSE_ID,
  NCAA_D1_2026_MEN_UNIVERSE_ID, NCAA_D1_2026_WOMEN_UNIVERSE_ID,
  WORLD_DB_SPAIN_UNIVERSE_ID, WORLD_DB_V2_UNIVERSE_ID,
  type NewGameUniverseId,
} from '@/app/game/NewGameUniverseCatalog'
import { WORLDDB_V2_GLOBAL_COMPETITIONS } from '@/app/game/WorldDbV2Competitions'

export type LeagueDepth = 'detailed' | 'reduced' | 'off'

interface LeagueSelectionStepProps {
  readonly universeId: NewGameUniverseId
  readonly levels: Readonly<Record<string, LeagueDepth>>
  readonly sourceRoot: string
  readonly startDate: string
  readonly seed: string
  readonly ncaaSeed: string
  readonly onUniverseChange: (id: NewGameUniverseId) => void
  readonly onLevelChange: (id: string, depth: LeagueDepth) => void
  readonly onSourceRootChange: (path: string) => void
  readonly onStartDateChange: (date: string) => void
  readonly onSeedChange: (seed: string) => void
  readonly onNcaaSeedChange: (seed: string) => void
  readonly onCancel: () => void
  readonly onContinue: () => void
}

const countryNames: Readonly<Record<string, string>> = {
  ESP: 'España', FRA: 'Francia', ITA: 'Italia', DEU: 'Alemania', BRA: 'Brasil',
  USA: 'Estados Unidos', ARG: 'Argentina', URY: 'Uruguay', CAN: 'Canadá',
  MEX: 'México', COL: 'Colombia', DOM: 'República Dominicana', PAN: 'Panamá',
  VEN: 'Venezuela', TUR: 'Turquía', ISR: 'Israel', POL: 'Polonia',
  CZE: 'Chequia', UKR: 'Ucrania', PRT: 'Portugal', RUS: 'Rusia',
  CHN: 'China', AUS: 'Australia', NZL: 'Nueva Zelanda', MAC: 'Macao',
  MNE: 'Montenegro', AUT: 'Austria', FIN: 'Finlandia', NOR: 'Noruega',
  ROU: 'Rumanía', ALB: 'Albania', GEO: 'Georgia', ISL: 'Islandia',
  XKX: 'Kosovo', LUX: 'Luxemburgo', PHL: 'Filipinas', TWN: 'Taiwán',
}

function regionOf(code: string): string {
  if (code === 'UNRESOLVED') return 'Sin conciliar'
  if (['USA','ARG','BRA','URY','CAN','MEX','COL','DOM','PAN','VEN'].includes(code)) return 'América'
  if (['CHN','MAC','PHL','TWN','AUS','NZL'].includes(code)) return 'Asia y Oceanía'
  if (['TUR','ISR','GEO'].includes(code)) return 'Europa y proximidad'
  return 'Europa'
}

const catalog = WORLDDB_V2_GLOBAL_COMPETITIONS
const countries = [...new Set(catalog.map(c => c.countryCode))]
  .sort((a,b) => (countryNames[a] ?? a).localeCompare(countryNames[b] ?? b, 'es'))
const regions = [...new Set(countries.map(regionOf))]

const modeDescription: Readonly<Partial<Record<NewGameUniverseId, string>>> = {
  worldDbV2: 'Selecciona ligas reales de WorldDB/PBM. Las personas, parte de los calendarios y las reglas aún pueden ser generadas por BDM.',
  ncaaD1Real2026Men: 'Ambas NCAA D1 se cargan en el mismo universo. Tu equipo inicial será masculino.',
  ncaaD1Real2026Women: 'Ambas NCAA D1 se cargan en el mismo universo. Tu equipo inicial será femenino.',
}

export function LeagueSelectionStep(props: LeagueSelectionStepProps) {
  const [country, setCountry] = useState('ESP')
  const [search, setSearch] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const isWorldDb = props.universeId === WORLD_DB_V2_UNIVERSE_ID
  const isNcaa = props.universeId === NCAA_D1_2026_MEN_UNIVERSE_ID || props.universeId === NCAA_D1_2026_WOMEN_UNIVERSE_ID

  const selected = useMemo(() => catalog.filter(c => (props.levels[c.sourceCompetitionId] ?? 'off') !== 'off'), [props.levels])
  const reduced = selected.filter(c => props.levels[c.sourceCompetitionId] === 'reduced')
  const displayed = catalog.filter(c => {
    const countryMatches = search.trim() ? true : country === 'ALL' || c.countryCode === country
    const query = search.trim().toLocaleLowerCase('es')
    const queryMatches = !query || (c.name + ' ' + (countryNames[c.countryCode] ?? c.countryCode)).toLocaleLowerCase('es').includes(query)
    return countryMatches && queryMatches && (!onlySelected || (props.levels[c.sourceCompetitionId] ?? 'off') !== 'off')
  })
  const ncaaSeedReady = /^\d+$/.test(props.ncaaSeed) && Number.isSafeInteger(Number(props.ncaaSeed)) && Number(props.ncaaSeed) <= 0xffff_ffff
  const ready = isWorldDb ? selected.length > 0 && props.sourceRoot.trim().length > 0 && props.seed.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(props.startDate) : !isNcaa || ncaaSeedReady

  return (
    <main className="start-screen bdm-wizard-page">
      <section className="bdm-wizard">
        <header className="bdm-wizard__heading">
          <div>
            <p className="eyebrow">NUEVA PARTIDA · 1 DE 2</p>
            <h1>Configurar universo</h1>
            <p>Elige los países, las ligas y cuánto detalle tendrán sus partidos.</p>
          </div>
          <nav aria-label="Pasos de nueva partida" className="bdm-wizard__progress">
            <strong aria-current="step">1. Ligas</strong><span>2. Mánager</span>
          </nav>
        </header>
        <div className="bdm-wizard__toolbar">
          <label className="bdm-start-field">
            <span>UNIVERSE</span>
            <select value={props.universeId} onChange={event => props.onUniverseChange(event.target.value as NewGameUniverseId)}>
              <option value={WORLD_DB_V2_UNIVERSE_ID}>WorldDB / PBM · Selección de ligas</option>
              <option value={NCAA_D1_2026_MEN_UNIVERSE_ID}>NCAA D1 2026/27 · Dirigir categoría masculina</option>
              <option value={NCAA_D1_2026_WOMEN_UNIVERSE_ID}>NCAA D1 2026/27 · Dirigir categoría femenina</option>
              <option value={ACB_TEST_UNIVERSE_ID}>ACB 2026/27 · Demostración</option>
              <option value={WORLD_DB_SPAIN_UNIVERSE_ID}>ACB 2025/26 · DB España</option>
              <option value="ncaaSimulated">NCAA · Desarrollo</option>
              <option value="prototype">BDM · Prototipo</option>
            </select>
          </label>
          <p>{modeDescription[props.universeId] ?? 'Modo de prueba. Conserva los datos y reglas propios de su escenario.'}</p>
        </div>
        {isWorldDb && (
          <div className="bdm-wizard__explorer">
            <aside className="bdm-wizard__countries" aria-label="Países y regiones">
              <h2>Regiones</h2>
              <button className={country === 'ALL' ? 'selected' : ''} onClick={() => setCountry('ALL')} type="button">Todas las ligas</button>
              {regions.map(region => (
                <details key={region} open={region === 'Europa' || region === 'América'}>
                  <summary>{region}</summary>
                  {countries.filter(code => regionOf(code) === region).map(code => (
                    <button key={code} type="button" className={country === code ? 'selected' : ''}
                      onClick={() => { setCountry(code); setSearch('') }}>
                      <span>{countryNames[code] ?? (code === 'UNRESOLVED' ? 'País pendiente' : code)}</span>
                      <small>{catalog.filter(c => c.countryCode === code).length}</small>
                    </button>
                  ))}
                </details>
              ))}
            </aside>
            <section className="bdm-wizard__leagues" aria-label="Ligas disponibles">
              <div className="bdm-wizard__list-heading">
                <div><h2>{search ? 'Resultados de búsqueda' : country === 'ALL' ? 'Todas las competiciones' : countryNames[country] ?? (country === 'UNRESOLVED' ? 'País sin conciliar' : country)}</h2>
                  <p>{displayed.length} competiciones en el catálogo</p></div>
                <label><input type="checkbox" checked={onlySelected} onChange={event => setOnlySelected(event.target.checked)}/> Solo seleccionadas</label>
              </div>
              <input className="bdm-wizard__search" aria-label="BUSCAR LIGAS" placeholder="Buscar liga o país…" value={search} onChange={event => setSearch(event.target.value)}/>
              <div className="bdm-wizard__league-list">
                {displayed.map(item => {
                  const level = props.levels[item.sourceCompetitionId] ?? 'off'
                  return <div className="bdm-wizard__league" key={item.sourceCompetitionId}>
                    <div className="bdm-wizard__league-name">
                      <strong>{item.name}</strong>
                      <span>{countryNames[item.countryCode] ?? (item.countryCode === 'UNRESOLVED' ? 'País por verificar' : item.countryCode)} · {item.teamCount} equipos</span>
                      {(item.formatProvenance === 'GENERATED_SIMULATION' || item.simulationPolicy) && <small>Formato provisional simulado</small>}
                    </div>
                    <label className="bdm-wizard__depth">
                      <span className="sr-only">Detalle de {item.name}</span>
                      <select aria-label={'Detalle de ' + item.name} value={level} onChange={event => props.onLevelChange(item.sourceCompetitionId, event.target.value as LeagueDepth)}>
                        <option value="off">Sin cargar</option>
                        <option value="reduced">Reducida</option>
                        <option value="detailed">Detallada</option>
                      </select>
                    </label>
                  </div>
                })}
                {displayed.length === 0 && <p className="bdm-wizard__empty">No hay ligas que coincidan con los filtros.</p>}
              </div>
            </section>
            <aside className="bdm-wizard__summary" aria-label="Resumen de universo">
              <h2>Tu universo</h2>
              <div className="bdm-wizard__metric"><strong>{selected.length}</strong><span>Ligas activas</span></div>
              <div className="bdm-wizard__metric"><strong>{selected.length - reduced.length}</strong><span>Detalladas</span></div>
              <div className="bdm-wizard__metric"><strong>{reduced.length}</strong><span>Reducidas</span></div>
              <p><strong>Detallada</strong>: partidos prioritarios para el motor de mayor precisión, sujetos al presupuesto diario.</p>
              <p><strong>Reducida</strong>: partidos en simulación rápida, con clubes y mercado igualmente cargados. Los partidos de tu equipo siguen teniendo prioridad.</p>
              <p><strong>Sin cargar</strong>: esa competición no se importa a la partida activa.</p>
              <p className="bdm-wizard__notice">Las ligas con formato provisional están etiquetadas. Las NCAA todavía no pueden mezclarse con el universo PBM en una sola partida.</p>
            </aside>
          </div>
        )}
        {isNcaa && <section className="bdm-wizard__ncaa" aria-label="Competiciones NCAA">
          <h2>NCAA División I · 2026/27</h2>
          <div><strong>Masculina</strong><span>365 programas · 32 conferencias · incluida</span></div>
          <div><strong>Femenina</strong><span>363 programas · 32 conferencias · incluida</span></div>
          <p>Las dos competiciones comparten universo, pero mantienen equipos, plantillas y torneos separados. Los calendarios incompletos y la selección de torneos son simulados.</p>
        </section>}
        <details className="bdm-wizard__advanced">
          <summary>Configuración avanzada y datos de partida</summary>
          {isWorldDb && <div className="bdm-wizard__advanced-fields">
            <label className="bdm-start-field"><span>WORLDDB SOURCE FOLDER</span><input value={props.sourceRoot} onChange={e => props.onSourceRootChange(e.target.value)}/></label>
            <label className="bdm-start-field"><span>START DATE</span><input type="date" value={props.startDate} onChange={e => props.onStartDateChange(e.target.value)}/></label>
            <label className="bdm-start-field"><span>WORLD SEED</span><input value={props.seed} onChange={e => props.onSeedChange(e.target.value)}/></label>
          </div>}
          {isNcaa && <label className="bdm-start-field"><span>NCAA FIXTURE / PLAYER SEED</span>
            <input type="number" min={0} max={4294967295} step={1} value={props.ncaaSeed} onChange={e => props.onNcaaSeedChange(e.target.value)}/>
          </label>}
          {!isNcaa && !isWorldDb && <p>Este escenario conserva su configuración de desarrollo actual.</p>}
        </details>
        <footer className="bdm-wizard__footer">
          <button className="text-button" type="button" onClick={props.onCancel}>Volver al inicio</button>
          <div className="bdm-wizard__footer-right">
            {isWorldDb && !selected.length && <span role="status">Selecciona al menos una liga.</span>}
            <button className="primary-button" type="button" onClick={props.onContinue} disabled={!ready}>Continuar: crear mánager →</button>
          </div>
        </footer>
      </section>
    </main>
  )
}
