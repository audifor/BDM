import { useMemo, useState } from 'react'

import type { AuthorizedScoutedRating } from '@/app/player/PlayerKnowledgeAccess'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  buildOpponentFamilyKnowledge, opponentKnowledgeSummary, scoutingConfidenceLabel,
} from '@/ui-ng/applications/player/data/buildOpponentAttributesPresentation'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

/**
 * Rival Attributes is driven exclusively by organization-authorized scouting
 * evaluations. Never consume model.ratings, model.radarAxes or the opponent's
 * raw ratings here, even in an advanced scouting state.
 */
export function PlayerOpponentAttributes() {
  const { model, session } = usePlayerWorkspace()
  const [selectedFamily, setSelectedFamily] = useState<RatingCategory>('shooting')
  const [selectedRating, setSelectedRating] = useState<string | null>(null)

  const access = model?.knowledgeAccess
  const opponentAccess = access?.kind === 'scouted' || access?.kind === 'unknown' ? access : null
  const groups = useMemo(
    () => opponentAccess === null ? [] : buildOpponentFamilyKnowledge(opponentAccess),
    [opponentAccess],
  )
  if (opponentAccess === null) return null

  const totals = opponentKnowledgeSummary(opponentAccess)
  const activeFamily = groups.find((entry) => entry.id === selectedFamily) ?? groups[0]
  const knownRatings = activeFamily?.ratings.filter((entry) => entry.evaluation !== null) ?? []
  const activeRating = knownRatings.find((entry) => entry.id === selectedRating) ?? knownRatings[0]
  const stateText = totals.knownRatings === 0 && totals.knownDimensions === 0
    ? 'SIN EVALUAR'
    : totals.complete ? 'COBERTURA INDIVIDUAL COMPLETA · ESTIMACIONES'
    : totals.knownRatings === 0 ? 'CONOCIMIENTO GENERAL' : 'EVALUACIÓN PARCIAL'
  const openScouting = () => session.setActiveView('scouting')
  const selectFamily = (family: RatingCategory) => {
    setSelectedFamily(family)
    setSelectedRating(null)
  }

  return <div className="pac-workspace pac-opponent" data-ng-region="player-attributes" data-knowledge={opponentAccess.kind}>
    <div className="pac-opponent__notice" role="status">
      <span className="pac-opponent__indicator" aria-hidden="true">◈</span>
      <div><strong>CONOCIMIENTO DE LA ORGANIZACIÓN · {stateText}</strong>
        <p>Solo se muestran valoraciones obtenidas por scouting. Un atributo sin evaluar no equivale a un atributo bajo.</p>
      </div>
      <button type="button" className="pac-opponent__link" onClick={openScouting}>ABRIR SCOUTING ›</button>
    </div>

    <div className="pac-opponent__grid">
      <section className="pac-card pac-opponent__families">
        <header className="pac-head"><h2>ÁREAS DE CONOCIMIENTO</h2><span>{totals.knownRatings} / {totals.totalRatings} atributos</span></header>
        <div className="pac-opponent__families-list">
          {groups.map((entry) => <button type="button" key={entry.id}
            className={'pac-opponent__family' + (activeFamily?.id === entry.id ? ' is-active' : '')}
            aria-pressed={activeFamily?.id === entry.id}
            onClick={() => selectFamily(entry.id)}>
            <span>{entry.label}</span>
            <span>{entry.evaluated === 0 ? 'Sin evaluar' : entry.evaluated + '/' + entry.total + ' observados'}</span>
          </button>)}
        </div>
        <div className="pac-opponent__family-foot">
          <strong>LECTURA FOW</strong>
          <p>El conocimiento pertenece a tu organización. Los valores internos y el potencial oculto no se revelan.</p>
        </div>
      </section>

      <section className="pac-card pac-opponent__profile">
        <header className="pac-head"><h2>PERFIL DE SCOUTING</h2><span>Información autorizada</span></header>
        {totals.knownRatings === 0 && totals.knownDimensions === 0 ? <div className="pac-opponent__unknown">
          <span className="pac-opponent__unknown-icon" aria-hidden="true">?</span>
          <h3>PERFIL SIN EVALUAR</h3>
          <p>No existe una evaluación deportiva contrastada. El radar permanecerá vacío hasta disponer de información verificable.</p>
          <button className="pac-outline-action" type="button" onClick={openScouting}>INICIAR EVALUACIÓN ›</button>
        </div> : <div className="pac-opponent__known">
          <h3>INFORMACIÓN DISPONIBLE</h3>
          <p>Los informes proporcionan observaciones estimadas, no los valores internos del jugador.</p>
          {opponentAccess.knownDimensions.length > 0
            ? opponentAccess.knownDimensions.map((entry) => <div className="pac-opponent__dimension" key={entry.id}>
                <span>{entry.label}</span><strong>{entry.displayLabel}</strong>
                <small>{entry.coveragePercent}% cobertura registrada</small>
              </div>)
            : <p className="pac-opponent__missing">Todavía no hay evaluaciones globales por dimensión.</p>}
          <p className="pac-opponent__missing">La araña de 8 familias no se dibuja a partir de datos parciales o no certificados.</p>
        </div>}
        <div className="pac-opponent__profile-foot"><span>OBSERVACIONES INDIVIDUALES</span>
          <strong>{totals.knownRatings} / {totals.totalRatings}</strong></div>
      </section>

      <div className="pac-opponent__right">
        <section className="pac-card pac-opponent__ratings">
          <header className="pac-head"><h2>{(activeFamily?.label ?? 'ATTRIBUTES').toUpperCase()}</h2><span>{knownRatings.length} evaluados</span></header>
          {knownRatings.length === 0 ? <div className="pac-opponent__empty">
            <strong>SIN ATRIBUTOS EVALUADOS</strong>
            <p>Esta familia todavía no tiene valoraciones individuales conocidas. No se muestran filas repetidas de «Not scouted».</p>
            <button type="button" onClick={openScouting}>SOLICITAR OBSERVACIÓN ›</button>
          </div> : <div className="pac-opponent__rating-list">
            {knownRatings.map((entry) => <button type="button" key={entry.id}
              className={'pac-opponent__rating' + (activeRating?.id === entry.id ? ' is-active' : '')}
              onClick={() => setSelectedRating(entry.id)} aria-pressed={activeRating?.id === entry.id}>
              <span>{entry.label}</span><strong>{entry.displayLabel}</strong>
              <small>{entry.coveragePercent}% cobertura</small>
            </button>)}
          </div>}
        </section>
        <section className="pac-card pac-opponent__detail">
          <header className="pac-head"><h2>DETALLE Y SIGUIENTES PASOS</h2></header>
          {activeRating === undefined
            ? <div className="pac-opponent__detail-body">
                <strong>CONOCIMIENTO INSUFICIENTE</strong>
                <p>El club debe obtener nuevas observaciones antes de elaborar una valoración individual de esta familia.</p>
              </div>
            : <ScoutedRatingDetail rating={activeRating} />}
          <div className="pac-opponent__actions">
            <button type="button" onClick={openScouting}>ASIGNAR SCOUT / SOLICITAR INFORME ›</button>
            <small>La asignación, el coste y las restricciones se gestionan en Scouting Report.</small>
          </div>
        </section>
      </div>
    </div>
  </div>
}

function ScoutedRatingDetail({ rating }: { readonly rating: AuthorizedScoutedRating }) {
  const evaluation = rating.evaluation
  if (evaluation === null) return null
  return <div className="pac-opponent__detail-body">
    <span className="pac-opponent__detail-label">{rating.label.toUpperCase()}</span>
    <strong className="pac-opponent__estimate">{rating.displayLabel}</strong>
    <div className="pac-opponent__metrics">
      <div><span>CONFIANZA</span><strong>{scoutingConfidenceLabel(evaluation.confidence)}</strong></div>
      <div><span>COBERTURA</span><strong>{rating.coveragePercent}%</strong></div>
    </div>
    <p>Estimación registrada por tu organización. Puede variar con nuevas observaciones; no representa el rating real interno.</p>
  </div>
}
