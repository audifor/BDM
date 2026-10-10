import { useMemo } from 'react'

import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import type { PlayerWorkspaceModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

type MindsetKey = 'DECISION_MAKING' | 'COMPOSURE' | 'DISCIPLINE' | 'ADAPTABILITY'
const MINDSET: readonly { key: MindsetKey; label: string }[] = [
  { key: 'DECISION_MAKING', label: 'Decisiones' },
  { key: 'COMPOSURE', label: 'Compostura' },
  { key: 'DISCIPLINE', label: 'Disciplina' },
  { key: 'ADAPTABILITY', label: 'Adaptabilidad' },
]
const CHARACTER = ['Competitividad', 'Profesionalidad', 'Orientación al equipo', 'Temperamento'] as const

function ratingBand(value: number): string {
  if (value >= 75) return 'Alto'
  if (value >= 50) return 'Medio'
  return 'Bajo'
}

function fieldLabel(field: { readonly status: string; readonly value?: unknown; readonly label?: string }): string {
  return field.status === 'available' && field.value !== undefined ? String(field.value) : field.label ?? 'Sin datos'
}

function buildManagerRead(model: PlayerWorkspaceModel): string {
  const { overview, knowledgeAccess, status } = model
  if (knowledgeAccess.kind === 'unknown') {
    return 'No existe información deportiva suficiente para definir este perfil. Una observación autorizada permitirá distinguir capacidades, mentalidad y posibles necesidades de gestión.'
  }
  if (knowledgeAccess.kind === 'scouted') {
    const dimensions = knowledgeAccess.knownDimensions.slice(0, 2).map((entry) => `${entry.label}: ${entry.displayLabel}`)
    return dimensions.length
      ? `El conocimiento disponible es parcial (${dimensions.join('; ')}). No se puede confirmar todavía un arquetipo completo ni emitir conclusiones sobre su personalidad.`
      : 'La información observada todavía es insuficiente para una lectura integral. No se muestran ratings ni rasgos internos desconocidos.'
  }
  const best = [...overview.identityModule.chips].sort((a, b) => b.value - a.value).slice(0, 2)
  const strengths = best.length
    ? `Sus puntos más destacados son ${best.map((entry) => `${entry.label} (${entry.value})`).join(' y ')}.`
    : 'Todavía no se dispone de un conjunto de fortalezas representativo.'
  const stage = overview.developmentPulse.stageLabel
  const trend = overview.developmentPulse.trendLabel
  const condition = fieldLabel(status.availability)
  const morale = fieldLabel(status.morale)
  return `${strengths} Se encuentra en la etapa ${stage.toLowerCase()} de su desarrollo, con tendencia ${trend}. Su estado actual es ${condition.toLowerCase()} y su moral figura como ${morale.toLowerCase()}. La profesionalidad, la lealtad y el temperamento requieren una evaluación humana válida antes de extraer conclusiones.`
}

function PlayerDna({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const own = model.knowledgeAccess.kind === 'own-roster'
  const chips = own ? model.overview.identityModule.chips.slice(0, 4) : []
  const title = model.overview.identityModule.archetypeTitle
  const role = model.overview.identityModule.roleTitle

  return (
    <section className="po-cs-card po-cs-dna" aria-label="Player DNA">
      <header className="po-cs-card__header">
        <h2>PLAYER DNA</h2>
        <span>Baloncesto · Mentalidad · Carácter · Estabilidad</span>
        <button type="button" onClick={() => session.setActiveView('attributes')}>VER DETALLE ›</button>
      </header>
      <div className="po-cs-dna__hero">
        <span className="po-cs-dna__star" aria-hidden="true">✦</span>
        <div>
          <h3>{title}</h3>
          <p>{role}{own ? ' · Perfil derivado de ratings reales' : ' · Conocimiento deportivo parcial'}</p>
        </div>
      </div>
      <div className="po-cs-dna__quadrants">
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>01</span><h4>BALONCESTO</h4></div>
          <p>Identidad sobre la pista</p>
          <div className="po-cs-dna__chips">
            {chips.length ? chips.map((chip) => <span className="po-cs-chip" key={chip.id}>{chip.label} {chip.value}</span>)
              : <span className="po-cs-unknown">Atributos individuales no conocidos</span>}
          </div>
          <button className="po-cs-text-link" onClick={() => session.setActiveView('attributes')} type="button">Ver atributos ›</button>
        </section>
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>02</span><h4>MENTALIDAD</h4></div>
          {MINDSET.map(({ key, label }) => {
            const value = own ? model.ratings.find((rating) => rating.id === key)?.value : undefined
            return <div className="po-cs-meter-row" key={key}>
              <span>{label}</span>
              <span className="po-cs-meter-track"><i style={{ width: value === undefined ? '0%' : `${value}%` }} /></span>
              <strong>{value === undefined ? 'Sin datos' : ratingBand(value)}</strong>
            </div>
          })}
          <button className="po-cs-text-link" onClick={() => { session.setAttributesCategory('mental'); session.setActiveView('attributes') }} type="button">Ver mental ›</button>
        </section>
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>03</span><h4>CARÁCTER</h4></div>
          {CHARACTER.map((label) => <div className="po-cs-meter-row" key={label}>
            <span>{label}</span><span className="po-cs-meter-track is-unknown" /><strong>Sin evaluar</strong>
          </div>)}
          <button className="po-cs-text-link" onClick={() => session.setActiveView('scouting')} type="button">Ver conocimiento ›</button>
        </section>
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>04</span><h4>ESTABILIDAD / RIESGO</h4></div>
          <div className="po-cs-meter-row"><span>Moral</span><span /><strong>{fieldLabel(model.status.morale)}</strong></div>
          <div className="po-cs-meter-row"><span>Disponibilidad</span><span /><strong>{fieldLabel(model.status.availability)}</strong></div>
          <div className="po-cs-meter-row"><span>Riesgo físico</span><span /><strong>{fieldLabel(model.status.risk)}</strong></div>
          <div className="po-cs-meter-row"><span>Fiabilidad</span><span /><strong>Sin evaluar</strong></div>
          <button className="po-cs-text-link" onClick={() => session.setActiveView('medical')} type="button">Ver estado médico ›</button>
        </section>
      </div>
    </section>
  )
}

function Radar({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const values = model.radarAxes
  const nodes = useMemo(() => {
    const count = values.length
    return values.map((axis, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / count
      return { ...axis, angle }
    })
  }, [values])
  const points = (factor: number, personalized: boolean): string =>
    nodes.map(({ angle, value }) => {
      const radius = 88 * factor * (personalized ? Math.max(0, Math.min(100, value)) / 100 : 1)
      return `${(170 + Math.cos(angle) * radius).toFixed(1)},${(142 + Math.sin(angle) * radius).toFixed(1)}`
    }).join(' ')

  return (
    <section className="po-cs-card po-cs-radar">
      <header className="po-cs-card__header"><h2>ATTRIBUTE RADAR</h2><span>Familias reales · 0 a 100</span></header>
      {nodes.length < 3 ? <div className="po-cs-empty">El radar requiere conocimiento autorizado de los atributos.</div> : (
        <svg viewBox="0 0 340 290" className="po-cs-radar__svg" role="img"
          aria-label={`Radar deportivo: ${values.map(a => `${a.label} ${a.value}`).join(', ')}`}>
          {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={points(f, false)} fill="none" stroke="currentColor" strokeOpacity=".18" />)}
          {nodes.map(axis => <line key={axis.key} x1={170} y1={142} x2={170 + 88 * Math.cos(axis.angle)} y2={142 + 88 * Math.sin(axis.angle)} stroke="currentColor" strokeOpacity=".25"/>)}
          <polygon points={points(1, true)} className="po-cs-radar__shape" />
          {nodes.map(axis => {
            const x = 170 + Math.cos(axis.angle) * 116
            const y = 142 + Math.sin(axis.angle) * 116
            return <g key={axis.key}><text x={x} y={y - 2} textAnchor="middle" className="po-cs-radar__label">{axis.label}</text>
              <text x={x} y={y + 13} textAnchor="middle" className="po-cs-radar__value">{axis.value}</text></g>
          })}
        </svg>
      )}
      <button type="button" className="po-cs-radar__more" onClick={() => session.setActiveView('attributes')}>ANALIZAR ATRIBUTOS ›</button>
    </section>
  )
}

function Season({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const season = model.overview.season
  const metrics = season.headline.slice(0, 5)
  const gameBars = model.overview.recentForm.games.slice(-5).map(game => {
    const statistic = (id: string) => {
      const item = game.figures.find(figure => figure.id === id)
      return item === undefined ? null : Number.isFinite(Number(item.value)) ? Number(item.value) : null
    }
    return { id: game.id, opponent: game.opponent, points: statistic('pts'), rebounds: statistic('reb'), assists: statistic('ast') }
  })
  const maxStat = Math.max(1, ...gameBars.flatMap(game => [game.points ?? 0, game.rebounds ?? 0, game.assists ?? 0]))
  return <section className="po-cs-card po-cs-season">
    <header className="po-cs-card__header"><h2>SEASON SNAPSHOT</h2><span>{season.seasonLabel ?? 'Sin temporada'} · {season.competitionLabel ?? 'Sin competición'}</span></header>
    <div className="po-cs-season__metrics">
      {season.status === 'available' && metrics.length ? metrics.map(metric => <div key={metric.id}>
        <strong>{metric.value}</strong><span>{metric.label}</span>
      </div>) : <div className="po-cs-empty">Todavía no hay partidos disputados esta temporada.</div>}
    </div>
    <div className="po-cs-season__chart-legend" aria-hidden="true"><span>PTS</span><span>REB</span><span>AST</span></div>
    {gameBars.length > 0 && <div className="po-cs-season__chart" role="img" aria-label="Puntos, rebotes y asistencias en partidos recientes">
      {gameBars.map(game => <div className="po-cs-season__chart-game" key={game.id}>
        <div className="po-cs-season__bars">
          {([['points', game.points], ['rebounds', game.rebounds], ['assists', game.assists]] as const).map(([id, value]) =>
            <span key={id} className={`is-${id}`} title={`${id}: ${value === null ? 'sin datos' : value}`}>
              {value !== null && <i style={{ height: `${Math.max(2, (value / maxStat) * 100)}%` }} />}
            </span>
          )}
        </div>
        <small>vs {game.opponent}</small>
      </div>)}
    </div>}
    <p className="po-cs-season__caption">{season.gamesPlayed} partidos registrados</p>
    <button className="po-cs-text-link" type="button" onClick={() => session.setActiveView('performance')}>ANALIZAR RENDIMIENTO ›</button>
  </section>
}

function Form({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const { recentForm } = model.overview
  return <section className="po-cs-card po-cs-form">
    <header className="po-cs-card__header"><h2>RECENT FORM</h2><span>{recentForm.windowLabel}</span></header>
    <div className="po-cs-form__games">
      {recentForm.games.length ? [...recentForm.games].reverse().map(game => <details key={game.id} className="po-cs-form__game">
        <summary><span><strong>{game.dateLabel ?? 'Sin fecha'}</strong><small>vs {game.opponent}</small></span>
          <span className="po-cs-form__value"><b>{game.points}</b><small>PTS</small></span>
          <span className="po-cs-form__value"><b>{game.minutes}</b><small>MIN</small></span>
          <span className="po-cs-form__mini"><i style={{ width: `${game.height}%` }} /></span></summary>
        <dl>{game.figures.map(stat => <div key={stat.id}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
      </details>) : <div className="po-cs-empty">{recentForm.averageLabel}</div>}
    </div>
    <button className="po-cs-text-link" type="button" onClick={() => session.setActiveView('performance')}>VER PARTIDOS ›</button>
  </section>
}

function ManagerRead({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const text = useMemo(() => buildManagerRead(model), [model])
  return <section className="po-cs-card po-cs-read">
    <header className="po-cs-card__header"><h2>MANAGER READ</h2><span>Interpretación basada en datos autorizados</span></header>
    <p>{text}</p>
    <div className="po-cs-read__links">
      <button type="button" onClick={() => session.setActiveView('development')}>DESARROLLO ›</button>
      <button type="button" onClick={() => session.setActiveView('medical')}>ESTADO FÍSICO ›</button>
      <button type="button" onClick={() => session.setActiveView('scouting')}>CONOCIMIENTO ›</button>
    </div>
  </section>
}

export function PlayerCourtsideOverview() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null
  return <div className="po-cs-board" data-ng-region="player-courtside-overview">
    <PlayerDna model={model} />
    <Radar model={model} />
    <div className="po-cs-board__right"><Season model={model}/><Form model={model}/></div>
    <ManagerRead model={model} />
  </div>
}
