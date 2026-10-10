import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { PlayerTruthRatingKey } from '@/domain/player'
import { AttributeCategoryProfiles } from '@/ui-ng/applications/player/components/AttributeCategoryProfiles'
import { AttributeEvolutionChart } from '@/ui-ng/applications/player/components/AttributeEvolutionChart'
import { AttributeRadar } from '@/ui-ng/applications/player/components/visual/BasketballVisuals'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  comparisonProfile, filterCourtsideRatings, getCategoryComparison,
  MAX_FOCUS_ATTRIBUTES, MAX_RADAR_COMPARISONS, toggleFocusAttribute, toggleRadarComparison,
  type AttributeBaselineScope, type AttributeFilter,
} from '@/ui-ng/applications/player/data/courtsideAttributeLogic'
import { ordinalPercentile } from '@/ui-ng/applications/player/data/ratingCatalog'

const FILTERS: readonly { id: AttributeFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'strengths', label: 'Strengths' },
  { id: 'weaknesses', label: 'Weaknesses' }, { id: 'tracked', label: 'Watching' },
  { id: 'improved', label: 'Improved' }, { id: 'declined', label: 'Declined' },
]
type ComparativeScope = Exclude<AttributeBaselineScope, 'none'>
const BASELINES: readonly { id: ComparativeScope; label: string; color: string }[] = [
  { id: 'team', label: 'Equipo', color: 'var(--cs-orange2)' },
  { id: 'league', label: 'Liga', color: 'var(--cs-negative)' },
  { id: 'position', label: 'Posición', color: 'var(--cs-positive)' },
  { id: 'positionLeague', label: 'Posición · Liga', color: 'var(--cs-text2)' },
]

function storageKey(playerId: string): string {
  return 'bdm-ui-player-attribute-focus:v1:' + playerId
}
function readFocus(playerId: string, valid: ReadonlySet<string>): readonly PlayerTruthRatingKey[] {
  try {
    if (typeof window === 'undefined') return []
    const serialized = window.localStorage.getItem(storageKey(playerId))
    const parsed: unknown = serialized === null ? [] : JSON.parse(serialized)
    if (!Array.isArray(parsed)) return []
    const unique = new Set<string>()
    for (const value of parsed) {
      if (typeof value === 'string' && valid.has(value)) unique.add(value)
      if (unique.size >= MAX_FOCUS_ATTRIBUTES) break
    }
    return Array.from(unique) as PlayerTruthRatingKey[]
  } catch {
    return []
  }
}
function writeFocus(playerId: string, ids: readonly PlayerTruthRatingKey[]): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey(playerId), JSON.stringify(ids))
    }
  } catch {
    // Preferences may stay in memory when local browser storage is unavailable.
  }
}

export function PlayerCourtsideAttributes() {
  const { model, session } = usePlayerWorkspace()
  const playerId = model?.identity.playerId ?? ''
  const [filter, setFilter] = useState<AttributeFilter>('all')
  const [search, setSearch] = useState('')
  const [visibleBaselines, setVisibleBaselines] = useState<readonly ComparativeScope[]>([])
  const [compareMenuOpen, setCompareMenuOpen] = useState(false)
  const validIds = useMemo(() => new Set(model?.attributes.allRatings.map((rating) => rating.id) ?? []), [model?.attributes.allRatings])
  const [focusState, setFocusState] = useState(() => ({ playerId, ids: readFocus(playerId, validIds) }))
  useEffect(() => {
    setFocusState({ playerId, ids: readFocus(playerId, validIds) })
  }, [playerId, validIds])
  if (model === null || model.knowledgeAccess.kind !== 'own-roster') return null

  const { attributesCategory, selectedRatingId } = session
  const currentCategory = model.attributes.categories.find((entry) => entry.category === attributesCategory)
    ?? model.attributes.categories[0]
  if (currentCategory === undefined) return <p className="pac-empty">No attribute categories recorded for this player.</p>

  const focus = focusState.playerId === playerId ? focusState.ids : []
  const focusedIds = new Set(focus)
  const strengthIds = new Set(model.attributes.signatureSkills.map((rating) => rating.id))
  const weaknessIds = new Set(model.attributes.weakLinks.map((rating) => rating.id))
  const availableRatings = search.trim() !== '' || filter === 'tracked'
    ? model.attributes.allRatings : currentCategory.all
  const ratings = filterCourtsideRatings(
    availableRatings, filter, search, model.attributes.evolutionByRating,
    strengthIds, weaknessIds, focusedIds,
  )
  const activeRating = ratings.find((rating) => rating.id === selectedRatingId) ?? ratings[0]
  const evolution = activeRating === undefined ? null : model.attributes.evolutionByRating[activeRating.id]
  const radarAxes = model.radarAxes
  const baselineProfiles = BASELINES.map(({ id, label, color }) => ({
    id, label, color,
    axes: comparisonProfile(model.attributes.categories, model.attributes.evolutionByRating, id),
  }))
  const radarOverlays = baselineProfiles.filter((item) => visibleBaselines.includes(item.id) && item.axes !== null)
    .map((item) => ({ key: item.id, label: item.label, color: item.color, axes: item.axes! }))
  const selectedComparisons = baselineProfiles.flatMap((item) => {
    if (!visibleBaselines.includes(item.id) || item.axes === null) return []
    const value = getCategoryComparison(currentCategory, model.attributes.evolutionByRating, item.id)
    return value === null ? [] : [{ ...item, value }]
  })
  const comparisonReading = selectedComparisons.length === 0 ? null
    : selectedComparisons.every((item) => currentCategory.profileValue < item.value)
      ? 'Por debajo de todas las referencias activas'
      : selectedComparisons.every((item) => currentCategory.profileValue > item.value)
        ? 'Por encima de todas las referencias activas'
        : 'Posición mixta respecto a las referencias activas'
  const toggleComparison = (scope: ComparativeScope) => {
    setVisibleBaselines((selected) => toggleRadarComparison(selected, scope))
  }
  const clearComparisons = () => {
    setVisibleBaselines([])
    setCompareMenuOpen(false)
  }
  const activeFamily = activeRating === undefined
    ? currentCategory : model.attributes.categories.find((entry) => entry.category === activeRating.category) ?? currentCategory

  const selectCategory = (category: typeof attributesCategory) => {
    const next = model.attributes.categories.find((entry) => entry.category === category)
    session.setAttributesCategory(category)
    session.setSelectedRatingId(next?.all[0]?.id ?? null)
    setSearch('')
    setFilter('all')
  }
  const selectRating = (ratingId: PlayerTruthRatingKey) => {
    const rating = model.attributes.allRatings.find((entry) => entry.id === ratingId)
    if (rating === undefined) return
    session.setAttributesCategory(rating.category)
    session.setSelectedRatingId(rating.id)
    setSearch('')
    setFilter('all')
  }
  const toggleFocus = (id: PlayerTruthRatingKey) => {
    const next = toggleFocusAttribute(focus, id)
    if (next === focus) return
    setFocusState({ playerId, ids: next })
    writeFocus(playerId, next)
  }
  const trackerFull = focus.length >= MAX_FOCUS_ATTRIBUTES

  return (
    <div className="pac-grid" data-ng-region="player-attributes-courtside">
      <div className="pac-column pac-column--left" data-focus-count={focus.length}>
        <section className="pac-card pac-category">
          <header className="pac-head"><h2>CATEGORY PROFILES</h2><span>Select a category to explore</span></header>
          <AttributeCategoryProfiles
            categories={model.attributes.categories}
            selectedCategory={currentCategory.category}
            structuralCompact={false}
            onSelect={selectCategory}
          />
        </section>
        <section className="pac-card pac-focus">
          <header className="pac-head"><h2>FOCUS TRACKER</h2><span title="Watchlist stored on this device, outside the game Save">{focus.length} / {MAX_FOCUS_ATTRIBUTES} · LOCAL</span></header>
          {focus.length === 0 ? (
            <p className="pac-empty pac-focus__empty">Mark attributes with ☆ to watch them across categories. Saved only on this device.</p>
          ) : <div className="pac-focus__items">
            {focus.map(id => {
              const rating = model.attributes.allRatings.find((entry) => entry.id === id)
              if (rating === undefined) return null
              const family = model.attributes.categories.find((entry) => entry.category === rating.category)
              const recorded = model.attributes.evolutionByRating[id]
              return <div className="pac-focus__item" key={id}>
                <button type="button" className="pac-focus__go" onClick={() => selectRating(id)}>
                  <strong>{rating.label}</strong><small>{family?.label ?? rating.category}</small>
                </button>
                <div className="pac-focus__metric"><b>{rating.value}</b><span className="pac-meter"><i style={{width:rating.value + '%'}} /></span></div>
                <button type="button" className="pac-focus__remove" aria-label={'Stop watching ' + rating.label} title="Remove from focus" onClick={() => toggleFocus(id)}>×</button>
                {recorded?.hasRecordedHistory && <span className="pac-focus__change">{recorded.changeSinceFirst > 0 ? '+' : ''}{recorded.changeSinceFirst}</span>}
              </div>
            })}
          </div>}
          <button className="pac-outline-action" type="button" disabled={activeRating === undefined || (trackerFull && !focusedIds.has(activeRating.id))}
            onClick={() => activeRating !== undefined && toggleFocus(activeRating.id)}>
            {activeRating !== undefined && focusedIds.has(activeRating.id) ? '★ REMOVE SELECTED' : '+ WATCH SELECTED ATTRIBUTE'}
          </button>
        </section>
      </div>

      <div className="pac-column pac-column--center">
        <section className="pac-card pac-profile">
          <header className="pac-head"><h2>ATTRIBUTE PROFILE</h2><span>8 family radar · click an axis to explore</span></header>
          <div className="pac-profile__body">
            <div className="pac-profile__chart">
              <div className="pac-radar-toolbar">
                <span className="pac-radar-key pac-radar-key--player"><i aria-hidden="true" /> Jugador</span>
                <button type="button" className="pac-radar-add"
                  aria-expanded={compareMenuOpen} aria-controls="pac-radar-compare-options"
                  onClick={() => setCompareMenuOpen((open) => !open)}>
                  + COMPARAR {visibleBaselines.length > 0 ? '(' + visibleBaselines.length + '/2)' : ''}
                </button>
                {visibleBaselines.length > 0 && <button type="button" className="pac-radar-clear"
                  onClick={clearComparisons}>LIMPIAR</button>}
              </div>
              {compareMenuOpen && (
                <div className="pac-radar-options" id="pac-radar-compare-options" role="group" aria-label="Referencias de comparación">
                  <p>Activa hasta {MAX_RADAR_COMPARISONS} referencias. El jugador permanece visible.</p>
                  <div className="pac-radar-options__choices">
                    {baselineProfiles.map(({ id, label, color, axes }) => {
                      const selected = visibleBaselines.includes(id)
                      const atLimit = visibleBaselines.length >= MAX_RADAR_COMPARISONS
                      return <button type="button" key={id} className="pac-radar-toggle"
                        style={{ '--pac-series-color': color } as CSSProperties}
                        aria-pressed={selected && axes !== null}
                        disabled={axes === null || (!selected && atLimit)}
                        title={axes === null ? 'Referencia no disponible para las ocho familias' :
                          id === 'position' ? 'Misma posición, todos los planteles BDM: sin ajuste por nivel' :
                          id === 'positionLeague' ? 'Misma posición entre rivales de esta competición' :
                          (!selected && atLimit) ? 'Quita una de las dos referencias para añadir otra' :
                          (selected ? 'Quitar ' : 'Añadir ') + label}
                        onClick={() => toggleComparison(id)}>
                        <span className="pac-radar-toggle__mark" aria-hidden="true" />
                        {label}{selected ? ' ✓' : ''}
                      </button>
                    })}
                  </div>
                </div>
              )}
              {visibleBaselines.length > 0 && <div className="pac-radar-active" aria-label="Comparativas activas">
                {baselineProfiles.filter((item) => visibleBaselines.includes(item.id) && item.axes !== null).map((item) =>
                  <span key={item.id} style={{ '--pac-series-color': item.color } as CSSProperties}>
                    <i aria-hidden="true" /> {item.label}
                  </span>)}
              </div>}
              <div className="pac-profile__radar-wrap">
                <AttributeRadar
                  accent="var(--cs-lime)"
                  axes={radarAxes}
                  selectedCategory={currentCategory.category}
                  onCategorySelect={selectCategory}
                  comparisonSeries={radarOverlays}
                  courtsideFraming
                  showValues
                />
              </div>
              {baselineProfiles.every((entry) => entry.axes === null) && (
                <p className="pac-benchmark-missing">Las comparaciones se activarán cuando exista una muestra válida.</p>
              )}
            </div>
            <div className="pac-profile-compare" aria-label="Comparación de la categoría seleccionada">
              <div className="pac-profile-compare__header">
                <strong>{currentCategory.label.toUpperCase()}</strong>
                <span>Perfil de la familia seleccionada · 0 a 100</span>
              </div>
              <div className="pac-profile-compare__bars">
                <div className="pac-profile-compare__row">
                  <span>Jugador</span>
                  <div className="pac-profile-compare__track"><i className="pac-profile-compare__player" style={{width:currentCategory.profileValue + '%'}} /></div>
                  <strong>{currentCategory.profileValue}</strong>
                </div>
                {selectedComparisons.map((item) => <div className="pac-profile-compare__row" key={item.id}>
                  <span>{item.label}</span>
                  <div className="pac-profile-compare__track"><i style={{
                    width:item.value + '%', background:item.color,
                  }} /></div>
                  <strong>{item.value}</strong>
                </div>)}
              </div>
              {selectedComparisons.length > 0 ? (
                <p>{comparisonReading}. {selectedComparisons.map((item) =>
                  item.label + ' ' + (currentCategory.profileValue - item.value > 0 ? '+' : '') +
                  (currentCategory.profileValue - item.value) ).join(' · ')}.
                </p>
              ) : <p>Añade referencias con + Comparar para analizar esta familia sin saturar el radar.</p>}
              {visibleBaselines.includes('position') && <small>Posición incluye distintas competiciones y niveles, sin ajuste de calidad.</small>}
            </div>
          </div>
        </section>
      </div>

      <div className="pac-column pac-column--right">
        <section className="pac-card pac-attributes">
          <header className="pac-head pac-attributes__heading">
            <div><h2>{search.trim() ? 'SEARCH RESULTS' : filter === 'tracked' ? 'WATCHED ATTRIBUTES' : currentCategory.label.toUpperCase() + ' ATTRIBUTES'}</h2><span>{search.trim() ? 'Search across all 80 attributes' : filter === 'tracked' ? 'Watching across every category' : 'Only the selected family is shown'}</span></div>
            <label className="pac-search"><span className="pac-sr-only">Search attributes</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="⌕  Search attributes…" />
            </label>
          </header>
          <div className="pac-filters" aria-label="Attribute filters">
            {FILTERS.map(item => <button type="button" key={item.id} className={filter === item.id ? 'is-active' : ''}
              aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <div className="pac-attributes__scroll">
            <div className="pac-attr-table__head"><span>ATTRIBUTE</span><span>RATING</span><span>TEAM AVG</span><span>LEAGUE AVG</span><span>PERCENTILE</span><span>PROFILE</span><span>WATCH</span></div>
            {ratings.length === 0 && <p className="pac-empty">No attributes match the selected filter. Change the filter or clear the search.</p>}
            {ratings.map((rating) => {
              const evolutionRow = model.attributes.evolutionByRating[rating.id]
              const selected = activeRating?.id === rating.id
              const watched = focusedIds.has(rating.id)
              return <div className={'pac-attr-row' + (selected ? ' is-selected' : '')} key={rating.id}>
                <button className="pac-attr-row__select" type="button" onClick={() => selectRating(rating.id)} aria-current={selected ? 'true' : undefined}>
                  <span className="pac-attr-row__name">{rating.label}{search.trim() && <small>{rating.category}</small>}</span>
                  <b>{rating.value}</b>
                  <span>{evolutionRow?.team.average?.toFixed(1) ?? '—'}</span>
                  <span>{evolutionRow?.league.average?.toFixed(1) ?? '—'}</span>
                  <span>{evolutionRow?.standing.percentile === null || evolutionRow?.standing.percentile === undefined ? '—' : ordinalPercentile(evolutionRow.standing.percentile)}</span>
                  <span className="pac-meter"><i style={{ width: rating.value + '%' }}/></span>
                </button>
                <button type="button" className={'pac-attr-row__watch' + (watched ? ' is-watched' : '')}
                  disabled={!watched && trackerFull} aria-label={(watched ? 'Stop watching ' : 'Watch ') + rating.label}
                  title={watched ? 'Remove from focus' : trackerFull ? 'Up to three attributes' : 'Track this attribute'} onClick={() => toggleFocus(rating.id)}>
                  {watched ? '★' : '☆'}
                </button>
              </div>
            })}
          </div>
        </section>

        {activeRating === undefined || evolution === null ? (
          <section className="pac-card pac-empty-detail"><h2>ATTRIBUTE DETAIL</h2><p>Select an attribute to see its ratings and comparisons.</p></section>
        ) : (
          <section className={`pac-card pac-detail ${evolution.hasRecordedHistory ? 'pac-detail--recorded' : 'pac-detail--pending'}`}>
            <header className="pac-head"><div><h2>{activeRating.label.toUpperCase()}</h2><span>{activeFamily.label}</span></div>
              <button type="button" className={'pac-detail__watch' + (focusedIds.has(activeRating.id) ? ' is-watched' : '')}
                disabled={!focusedIds.has(activeRating.id) && trackerFull}
                onClick={() => toggleFocus(activeRating.id)}>
                {focusedIds.has(activeRating.id) ? '★ Watching' : '☆ Watch attribute'}
              </button>
            </header>
            <div className="pac-detail__kpis">
              <div><span>RATING</span><strong>{activeRating.value}</strong></div>
              <div><span>PERCENTILE</span><b>{evolution.standing.percentile === null ? '—' : ordinalPercentile(evolution.standing.percentile)}</b></div>
              <div><span>TEAM AVG</span><b>{evolution.team.average?.toFixed(1) ?? '—'}</b></div>
              <div><span>LEAGUE AVG</span><b>{evolution.league.average?.toFixed(1) ?? '—'}</b></div>
              <div><span>POSITION AVG</span><b>{evolution.standing.positionAverage?.toFixed(1) ?? '—'}</b></div>
            </div>
            <p className="pac-detail__description">{evolution.standing.note}</p>
            {evolution.hasRecordedHistory ? (
              <div className="pac-detail__evolution pac-detail__evolution--recorded">
                <div className="pac-detail__trend">
                  <span>CAMBIO REGISTRADO</span>
                  <strong className={evolution.changeSinceFirst > 0 ? 'is-positive' : evolution.changeSinceFirst < 0 ? 'is-negative' : ''}>
                    {evolution.changeSinceFirst > 0 ? '+' : ''}{evolution.changeSinceFirst}
                  </strong>
                </div>
                <AttributeEvolutionChart evolution={evolution} label={activeRating.label} title="RECORDED EVOLUTION"/>
              </div>
            ) : (
              <div className="pac-detail__evolution pac-detail__evolution--pending" role="status">
                <strong>EVOLUCIÓN PENDIENTE</strong>
                <p>Todavía no se ha registrado ningún cambio entre temporadas. No se dibuja una tendencia inexistente.</p>
              </div>
            )}

            <div className="pac-detail__training">
              <strong>TRAINING</strong>
              <span>{evolution.assignment.status === 'available' && evolution.trainings.length > 0
                ? evolution.trainings.length + ' available modules. Scheduling remains in the full attribute analysis.'
                : evolution.assignment.reason ?? 'Direct training assignment is not available for this attribute.'}</span>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
