import { useMemo } from 'react'

import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import type { PlayerWorkspaceModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import {
  buildScoutedFamilyProfiles, hasScoutedRadarProfile, opponentKnowledgeSummary,
  type ScoutedFamilyProfile,
} from '@/ui-ng/applications/player/data/buildOpponentAttributesPresentation'

type MindsetKey = 'DECISION_MAKING' | 'COMPOSURE' | 'DISCIPLINE' | 'ADAPTABILITY'
const MINDSET: readonly { key: MindsetKey; label: string }[] = [
  { key: 'DECISION_MAKING', label: 'Decisiones' },
  { key: 'COMPOSURE', label: 'Compostura' },
  { key: 'DISCIPLINE', label: 'Disciplina' },
  { key: 'ADAPTABILITY', label: 'Adaptabilidad' },
]
const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  shooting: 'tiro', finishing: 'finalización', ballHandling: 'manejo',
  playmaking: 'creación', offBall: 'juego sin balón', defense: 'defensa',
  physical: 'físico', mental: 'mentalidad',
}

function describeCategory(key: string, fallback: string): string {
  return CATEGORY_NAMES[key] ?? fallback.toLowerCase()
}

function ratingBand(value: number): string {
  if (value >= 75) return 'Alto'
  if (value >= 50) return 'Medio'
  return 'Bajo'
}

/** Read only the same viewer-authorized projection used by rival ATTRIBUTES. */
function evaluatedOpponentFamilies(model: PlayerWorkspaceModel): readonly ScoutedFamilyProfile[] {
  return model.knowledgeAccess.kind === 'own-roster'
    ? []
    : buildScoutedFamilyProfiles(model.knowledgeAccess)
}

/** A meaningful sport interpretation requires enough evidence, even for complete rating reports. */
function supportedScoutedFamilies(families: readonly ScoutedFamilyProfile[]): readonly ScoutedFamilyProfile[] {
  return families.filter((family) =>
    family.estimate !== null && family.observed > 0 &&
    (family.coverage ?? 0) >= 50 && (family.confidence ?? 0) >= 50)
}

function fieldLabel(field: { readonly status: string; readonly value?: unknown; readonly label?: string }): string {
  return field.status === 'available' && field.value !== undefined ? String(field.value) : field.label ?? 'Sin datos'
}

interface ManagerAssessment {
  readonly summary: string
  readonly strengths: readonly string[]
  readonly watchouts: readonly string[]
}

function buildManagerRead(model: PlayerWorkspaceModel): ManagerAssessment {
  const { overview, knowledgeAccess, status } = model
  if (knowledgeAccess.kind === 'unknown') {
    return {
      summary: 'Aún no existe información deportiva contrastada para elaborar un informe individual. La ficha mantiene los datos públicos, pero las capacidades y el carácter siguen sin evaluar.',
      strengths: [],
      watchouts: ['Perfil deportivo por conocer', 'Carácter sin evaluación autorizada'],
    }
  }
  if (knowledgeAccess.kind === 'scouted') {
    const all = evaluatedOpponentFamilies(model)
    const adequate = supportedScoutedFamilies(all)
    const summary = opponentKnowledgeSummary(knowledgeAccess)
    const sorted = [...adequate].sort((a, b) => b.estimate! - a.estimate!)
    const highest = sorted[0]
    const lowest = sorted.length >= 2 ? sorted[sorted.length - 1] : undefined
    if (highest !== undefined && lowest !== undefined && hasScoutedRadarProfile(all)) {
      return {
        summary: `Tu club dispone de estimaciones para ${summary.knownRatings}/${summary.totalRatings} atributos. Según esos informes, el perfil parece más sólido en ${highest.label.toLowerCase()} (≈${highest.estimate}, intervalo ${highest.low}–${highest.high}) y menos desarrollado en ${lowest.label.toLowerCase()} (≈${lowest.estimate}, intervalo ${lowest.low}–${lowest.high}). El índice scout no expresa probabilidad de certeza; los intervalos reflejan incertidumbre. No son sus ratings reales ni permiten evaluar su carácter.`,
        strengths: [`Mayor estimación: ${highest.label} · ≈${highest.estimate} · índice scout ${highest.confidence}/100`],
        watchouts: [`Menor estimación: ${lowest.label} · ≈${lowest.estimate} · índice scout ${lowest.confidence}/100`, 'Estado físico y carácter sin fuente autorizada'],
      }
    }
    const partial = knowledgeAccess.knownDimensions.slice(0, 2)
    return {
      summary: summary.knownRatings > 0
        ? `Tu club tiene estimaciones para ${summary.knownRatings}/${summary.totalRatings} atributos, pero aún no hay suficiente cobertura o confianza para describir con seguridad el perfil global. Revisa las familias evaluadas en Attributes.`
        : partial.length > 0
          ? `Solo hay observaciones generales de scouting: ${partial.map(entry => `${entry.label}: ${entry.displayLabel}`).join(' · ')}. Todavía no existe un perfil individual verificable.`
          : 'Existen indicios parciales de scouting, pero aún no permiten describir las capacidades ni el comportamiento del jugador.',
      strengths: [],
      watchouts: ['Conocimiento deportivo aún limitado', 'Estado interno y carácter sin evaluación autorizada'],
    }
  }

  const strongestRatings = [...overview.identityModule.chips].sort((a, b) => b.value - a.value).slice(0, 2)
  const sortedCategories = [...model.radarAxes].sort((a, b) => a.value - b.value)
  const weakestCategory = sortedCategories[0]
  const strongestCategory = sortedCategories[sortedCategories.length - 1]
  const stageKey = overview.developmentPulse.stageLabel.toLowerCase()
  const stages: Readonly<Record<string, string>> = {
    early: 'formación', developing: 'crecimiento', prime: 'plenitud', declining: 'descenso',
  }
  const phase = stages[stageKey] ?? 'desarrollo'
  const trend = overview.developmentPulse.trendLabel
  const age = model.identity.age.value
  const top = strongestRatings.map(entry => `${entry.label.toLowerCase()} (${entry.value})`)
  const profile = strongestCategory === undefined
    ? 'Su perfil deportivo requiere una evaluación más amplia.'
    : `Su perfil destaca por ${describeCategory(strongestCategory.key, strongestCategory.label)} (${strongestCategory.value}/100).`
  const topRead = top.length ? ` Sobresale en ${top.join(' y ')}.` : ''
  const timeline = ` ${typeof age === 'number' ? `A sus ${age} años, ` : ''}atraviesa una fase de ${phase}; evolución registrada: ${trend}.`
  const available = status.availability.status === 'available' && status.availability.value === 'Available'
  const medicalRead = available ? ' Está disponible.' : ` Disponibilidad: ${fieldLabel(status.availability)}.`
  const risk = status.risk.status === 'available' ? fieldLabel(status.risk) : null
  return {
    summary: `${profile}${topRead}${timeline}${medicalRead} El carácter sigue sin evaluar.`,
    strengths: [
      ...(strongestRatings.length ? [`Destaca en ${strongestRatings[0]!.label.toLowerCase()}`] : []),
      ...(available ? ['Disponible para competir'] : []),
      ...(risk !== null && risk.toLowerCase().includes('low') ? ['Riesgo físico bajo según Medical'] : []),
    ],
    watchouts: [
      ...(weakestCategory !== undefined ? [`Vigilar ${describeCategory(weakestCategory.key, weakestCategory.label)}`] : []),
      ...(overview.developmentPulse.stageLabel.toLowerCase() === 'declining' ? ['Etapa de declive registrada'] : []),
      ...(!available ? ['Revisar disponibilidad'] : []),
      'Carácter pendiente de evaluación',
    ],
  }
}

function PlayerDna({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const own = model.knowledgeAccess.kind === 'own-roster'
  const opponentFamilies = evaluatedOpponentFamilies(model)
  const evaluatedFamilies = supportedScoutedFamilies(opponentFamilies)
  const totalScoutedRatings = own ? null : opponentKnowledgeSummary(model.knowledgeAccess)
  const estimatedHighlights = [...evaluatedFamilies]
    .sort((a, b) => b.estimate! - a.estimate!)
    .slice(0, 4)
  const chips = own
    ? [...model.ratings]
      .sort((a, b) => b.value - a.value)
      .filter((entry, index, all) =>
        all.findIndex((candidate) => candidate.category === entry.category) === index)
      .slice(0, 4)
    : []
  const title = own ? model.overview.identityModule.archetypeTitle
    : (totalScoutedRatings?.knownRatings ?? 0) > 0 ? 'SCOUTING PROFILE'
      : model.knowledgeAccess.kind === 'scouted' ? 'SCOUTING PARCIAL' : 'NOT SCOUTED'
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
          <p>{role}{own ? ' · Perfil derivado de ratings reales'
            : ` · ${totalScoutedRatings?.knownRatings ?? 0}/${totalScoutedRatings?.totalRatings ?? 0} atributos estimados por tu club`}</p>
        </div>
      </div>
      <div className="po-cs-dna__quadrants">
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>01</span><h4>BALONCESTO</h4></div>
          <p>{own ? 'Fortalezas representativas por familia' : 'Familias estimadas con evidencia suficiente'}</p>
          <div className="po-cs-dna__chips">
            {own ? chips.map((chip) => <span className="po-cs-chip" key={chip.id}>{chip.label} {chip.value}</span>)
              : estimatedHighlights.length > 0
                ? estimatedHighlights.map((family) => <span className="po-cs-chip po-cs-chip--estimate" key={family.id}
                    title={`Estimación de tu club: ${family.low}–${family.high}; índice scout ${family.confidence}/100 y cobertura ${family.coverage}%`}>
                    {family.label} ≈{family.estimate}
                  </span>)
                : <span className="po-cs-unknown">Atributos individuales sin información suficiente</span>}
          </div>
          <button className="po-cs-text-link" onClick={() => session.setActiveView('attributes')} type="button">Ver atributos ›</button>
        </section>
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>02</span><h4>MENTALIDAD</h4></div>
          {MINDSET.map(({ key, label }) => {
            const value = own ? model.ratings.find((rating) => rating.id === key)?.value : undefined
            const known = own ? undefined : model.knowledgeAccess.ratingEvaluations
              .find((entry) => entry.key === key && entry.evaluation !== null)
            const estimated = known?.evaluation?.estimate
            const knownValue = typeof estimated === 'number' && Number.isFinite(estimated)
              ? estimated : undefined
            const visible = own ? value : knownValue
            return <div className="po-cs-meter-row" key={key}>
              <span>{label}</span>
              <span className={`po-cs-meter-track${visible === undefined ? ' is-unknown' : ''}`}>
                {visible !== undefined && <i style={{ width: `${Math.max(0,Math.min(100,visible))}%` }} />}
              </span>
              <strong title={!own && known !== undefined
                ? `Estimación de scouting: ${known.displayLabel}; índice scout ${known.evaluation?.confidence ?? 0}/100`
                : undefined}>
                {own ? value === undefined ? 'Sin datos' : ratingBand(value)
                  : known === undefined ? 'Sin datos' : known.displayLabel}
              </strong>
            </div>
          })}
          <button className="po-cs-text-link" onClick={() => { session.setAttributesCategory('mental'); session.setActiveView('attributes') }} type="button">Ver mental ›</button>
        </section>
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>03</span><h4>CARÁCTER</h4></div>
          <div className="po-cs-character__unknown" role="status">
            <strong>CARÁCTER POR CONOCER</strong>
            <p>No hay una evaluación autorizada de profesionalidad, ambición, lealtad ni temperamento.</p>
          </div>
          <button className="po-cs-text-link" onClick={() => session.setActiveView('scouting')} type="button">Consultar conocimiento ›</button>
        </section>
        <section className="po-cs-dna__quadrant">
          <div className="po-cs-dna__quadrant-head"><span>04</span><h4>{own ? 'ESTABILIDAD / RIESGO' : 'ACTIVIDAD COMPETITIVA'}</h4></div>
          {own ? (
            <>
              <div className="po-cs-meter-row"><span>Moral</span><span /><strong>{fieldLabel(model.status.morale)}</strong></div>
              <div className="po-cs-meter-row"><span>Disponibilidad</span><span /><strong>{fieldLabel(model.status.availability)}</strong></div>
              <div className="po-cs-meter-row"><span>Riesgo físico</span><span /><strong>{fieldLabel(model.status.risk)}</strong></div>
              <button className="po-cs-text-link" onClick={() => session.setActiveView('medical')} type="button">Ver estado médico ›</button>
            </>
          ) : (
            <>
              <div className="po-cs-public-games">
                <div><span>PARTIDOS REGISTRADOS</span>
                  <strong>{model.overview.season.status === 'available'
                    ? model.overview.season.gamesPlayed : 'Sin datos'}</strong>
                </div>
                {model.overview.recentForm.games.length > 0 ? (() => {
                  const last = model.overview.recentForm.games[model.overview.recentForm.games.length - 1]!
                  return <>
                    <div><span>ÚLTIMO PARTIDO</span>
                      <strong>{last.points} PTS · {last.minutes} MIN</strong>
                    </div>
                    <p>Último encuentro registrado{last.dateLabel ? ': ' + last.dateLabel : ''}. Los minutos disputados no indican su disponibilidad médica.</p>
                  </>
                })() : <p>Todavía no hay partidos registrados para mostrar su actividad.</p>}
              </div>
              <button className="po-cs-text-link" onClick={() => session.setActiveView('performance')} type="button">Ver partidos ›</button>
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function Radar({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const own = model.knowledgeAccess.kind === 'own-roster'
  const families = evaluatedOpponentFamilies(model)
  // The same organization-scoped evidence threshold as rival ATTRIBUTES.
  const estimable = !own && hasScoutedRadarProfile(families)
  const values = own ? model.radarAxes : estimable ? families.map((family) => ({
    key: family.id, label: family.label, value: family.estimate!,
  })) : []
  const scoutedCount = own ? null : opponentKnowledgeSummary(model.knowledgeAccess)
  const nodes = useMemo(() => {
    const count = values.length
    return values.map((axis, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / count
      return { ...axis, angle }
    })
  }, [values])
  const points = (factor: number, personalized: boolean): string =>
    nodes.map(({ angle, value }) => {
      const radius = 111 * factor * (personalized ? Math.max(0, Math.min(100, value)) / 100 : 1)
      return `${(170 + Math.cos(angle) * radius).toFixed(1)},${(161 + Math.sin(angle) * radius).toFixed(1)}`
    }).join(' ')

  return (
    <section className={`po-cs-card po-cs-radar${own ? '' : ' po-cs-radar--scouted'}`}>
      <header className="po-cs-card__header">
        <h2>{own ? 'ATTRIBUTE RADAR' : 'RADAR ESTIMADO'}</h2>
        <span>{own ? 'Familias reales · 0 a 100' : 'Scouting de tu club · 0 a 100'}</span>
      </header>
      {nodes.length < 3 ? <div className="po-cs-empty po-cs-radar__unknown">
        {own ? 'El radar requiere conocimiento autorizado de los atributos.'
          : <span><strong>PERFIL POR COMPLETAR</strong>
              <small>Tu club ha evaluado {scoutedCount?.knownRatings ?? 0}/{scoutedCount?.totalRatings ?? 0} atributos. El radar estimado requiere ocho familias completas y suficiente cobertura y confianza, nunca datos internos.</small>
            </span>}
      </div> : (
        <svg viewBox="0 0 340 325" className="po-cs-radar__svg" role="img"
          aria-label={`${own ? 'Radar deportivo' : 'Radar estimado por scouting'}: ${values.map(a => `${a.label} ${own ? '' : 'aproximadamente '}${a.value}`).join(', ')}`}>
          {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={points(f, false)} fill="none" stroke="currentColor" strokeOpacity=".18" />)}
          {nodes.map(axis => <line key={axis.key} x1={170} y1={161} x2={170 + 111 * Math.cos(axis.angle)} y2={161 + 111 * Math.sin(axis.angle)} stroke="currentColor" strokeOpacity=".25"/>)}
          <polygon points={points(1, true)} className="po-cs-radar__shape" />
          {nodes.map(axis => {
            const x = 170 + Math.cos(axis.angle) * 140
            const y = 161 + Math.sin(axis.angle) * 140
            return <g key={axis.key}><text x={x} y={y - 2} textAnchor="middle" className="po-cs-radar__label">{axis.label}</text>
              <text x={x} y={y + 13} textAnchor="middle" className="po-cs-radar__value">{own ? axis.value : '≈' + axis.value}</text></g>
          })}
        </svg>
      )}
      {values.length > 0 && <div className="po-cs-radar__insights">
        <span><b>{own ? 'FORTALEZA' : 'ESTIMACIÓN MAYOR'}</b>{[...values].sort((a,b) => b.value - a.value)[0]?.label}</span>
        <span><b>{own ? 'A MEJORAR' : 'ESTIMACIÓN MENOR'}</b>{[...values].sort((a,b) => a.value - b.value)[0]?.label}</span>
      </div>}
      {!own && estimable && <p className="po-cs-radar__disclaimer">Forma aproximada basada en scouting, no en ratings reales.</p>}
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
    {recentForm.games.length > 0 && recentForm.games.length < 5 && (
      <p className="po-cs-form__sample">Muestra reducida: {recentForm.games.length} de 5 encuentros de referencia disponibles.</p>
    )}
    <button className="po-cs-text-link" type="button" onClick={() => session.setActiveView('performance')}>VER PARTIDOS ›</button>
  </section>
}

function ManagerRead({ model }: { readonly model: PlayerWorkspaceModel }) {
  const { session } = usePlayerWorkspace()
  const assessment = useMemo(() => buildManagerRead(model), [model])
  const own = model.knowledgeAccess.kind === 'own-roster'
  return <section className="po-cs-card po-cs-read">
    <header className="po-cs-card__header"><h2>MANAGER READ</h2><span>Interpretación basada en datos autorizados</span></header>
    <div className="po-cs-read__content">
      <p>{assessment.summary}</p>
      <div className="po-cs-read__verdicts">
        <ul className="po-cs-read__strengths">{assessment.strengths.map(item => <li key={item}>{item}</li>)}</ul>
        <ul className="po-cs-read__watchouts">{assessment.watchouts.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
    <div className="po-cs-read__links">
      {own ? <>
        <button type="button" onClick={() => session.setActiveView('development')}>DESARROLLO ›</button>
        <button type="button" onClick={() => session.setActiveView('medical')}>ESTADO FÍSICO ›</button>
      </> : <>
        <button type="button" onClick={() => session.setActiveView('attributes')}>EVALUACIONES ›</button>
        <button type="button" onClick={() => session.setActiveView('performance')}>RENDIMIENTO ›</button>
      </>}
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
