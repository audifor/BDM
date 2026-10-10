import { useEffect, useMemo, useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { getAddressableScoutingPlayerIds, getAvailableScoutingEvaluators } from '@/app/scouting'
import { useGameStore } from '@/stores/gameStore'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { RequestScoutingModal } from '@/ui-ng/applications/scouting/ScoutingModals'
import type { ScoutingMission } from '@/domain/scouting'

import type { AuthorizedScoutedRating } from '@/app/player/PlayerKnowledgeAccess'
import { AttributeRadar } from '@/ui-ng/applications/player/components/visual/BasketballVisuals'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  buildOpponentFamilyKnowledge, buildScoutedFamilyProfiles, hasScoutedRadarProfile,
  opponentKnowledgeSummary, scoutingConfidenceLabel,
} from '@/ui-ng/applications/player/data/buildOpponentAttributesPresentation'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

/**
 * Rival Attributes is driven exclusively by organization-authorized scouting
 * evaluations. Never consume model.ratings, model.radarAxes or the opponent's
 * raw ratings here, even in an advanced scouting state.
 */
export function PlayerOpponentAttributes() {
  const { model, session, playerId } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const submitScouting = useGameStore((state) => state.requestScoutingAssignment)
  const { setActiveApp } = useNgWorkspaceNavigation()
  const [requestMission, setRequestMission] = useState<ScoutingMission>('QUICK_LOOK')
  const [requestOpen, setRequestOpen] = useState(false)
  const [selectedFamily, setSelectedFamily] = useState<RatingCategory>('shooting')
  const [selectedRating, setSelectedRating] = useState<string | null>(null)
  // A new rival must not inherit the previous rival's open request dialog.
  useEffect(() => {
    setRequestOpen(false)
    setSelectedFamily('shooting')
    setSelectedRating(null)
  }, [playerId])

  const access = model?.knowledgeAccess
  const opponentAccess = access?.kind === 'scouted' || access?.kind === 'unknown' ? access : null
  const groups = useMemo(
    () => opponentAccess === null ? [] : buildOpponentFamilyKnowledge(opponentAccess),
    [opponentAccess],
  )
  if (opponentAccess === null) return null

  const totals = opponentKnowledgeSummary(opponentAccess)
  const familyProfiles = buildScoutedFamilyProfiles(opponentAccess)
  const radarReady = hasScoutedRadarProfile(familyProfiles)
  const radarAxes = radarReady ? familyProfiles.map((family) => ({
    key: family.id,
    label: { shooting: 'SHOOT', finishing: 'FIN', ballHandling: 'HANDLE',
      playmaking: 'PLAY', offBall: 'OFF', defense: 'DEF', physical: 'PHYS', mental: 'MENT' }[family.id],
    value: family.estimate!,
  })) : []
  const estimatedFamilies = familyProfiles.filter((family) => family.estimate !== null)
  const strongestFamily = estimatedFamilies.length === 8
    ? [...estimatedFamilies].sort((left, right) => right.estimate! - left.estimate!)[0] : undefined
  const weakestFamily = estimatedFamilies.length === 8
    ? [...estimatedFamilies].sort((left, right) => left.estimate! - right.estimate!)[0] : undefined
  const selectedProfile = familyProfiles.find((family) => family.id === selectedFamily)
  const activeFamily = groups.find((entry) => entry.id === selectedFamily) ?? groups[0]
  const knownRatings = activeFamily?.ratings.filter((entry) => entry.evaluation !== null) ?? []
  const activeRating = knownRatings.find((entry) => entry.id === selectedRating) ?? knownRatings[0]
  const stateText = totals.knownRatings === 0 && totals.knownDimensions === 0
    ? 'SIN EVALUAR'
    : totals.complete ? 'COBERTURA INDIVIDUAL COMPLETA · ESTIMACIONES'
    : totals.knownRatings === 0 ? 'CONOCIMIENTO GENERAL' : 'EVALUACIÓN PARCIAL'
  const openScouting = () => session.setActiveView('scouting')
  const team = world === null ? undefined : getUserTeam(world)
  const pending = world === null || team === undefined || playerId === null ? undefined
    : Object.values(world.scoutingAssignmentsById).find((item) =>
      item.organizationId === team.organizationId && item.subjectPlayerId === playerId &&
      (item.status === 'QUEUED' || item.status === 'ACTIVE'))
  const addressable = world !== null && team !== undefined && playerId !== null &&
    getAddressableScoutingPlayerIds(world, team.id).includes(playerId)
  const hasAvailableEvaluator = world !== null && team !== undefined &&
    (['QUICK_LOOK', 'FULL_REPORT', 'SKILL_EVALUATION'] as const)
      .some((mission) => getAvailableScoutingEvaluators(world, team.id, mission).length > 0)
  const requestBlocker = pending !== undefined
    ? 'Ya hay una evaluación ' + (pending.status === 'ACTIVE' ? 'en curso' : 'en cola') +
      '. Avanza días para completarla o gestiona la asignación desde Scouting Report.'
    : !addressable
      ? 'El jugador todavía no es una identidad abordable por tu club. Descúbrelo mediante cobertura territorial o contactos autorizados en Scouting.'
      : !hasAvailableEvaluator
        ? 'No hay evaluadores autorizados con capacidad para solicitar una evaluación. Consulta las asignaciones y carga del staff en Scouting.'
        : null
  const requestAssessment = (mission: ScoutingMission) => {
    if (requestBlocker !== null) return
    setRequestMission(mission)
    setRequestOpen(true)
  }
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

      <section className="pac-card pac-opponent__profile" aria-label="Perfil de juego estimado">
        <header className="pac-head"><h2>PERFIL DE JUEGO ESTIMADO</h2><span>Solo informes de tu club</span></header>
        {totals.knownRatings === 0 ? <div className="pac-opponent__unknown">
          <span className="pac-opponent__unknown-icon" aria-hidden="true">?</span>
          <h3>SIN PERFIL DEPORTIVO</h3>
          <p>Este club todavía no dispone de atributos individuales suficientes para describir el juego del rival. Lo desconocido no es una debilidad.</p>
          {totals.knownDimensions > 0 && <p>Existen {totals.knownDimensions} observaciones generales, consultables en Scouting Report.</p>}
          <button className="pac-outline-action" type="button" onClick={() => requestAssessment('QUICK_LOOK')} disabled={requestBlocker !== null}>INICIAR EVALUACIÓN ›</button>
        </div> : (
          <div className="pac-opponent__profile-content">
            <div className="pac-opponent__profile-key">
              <span className="pac-opponent__estimated-key"><i aria-hidden="true" /> ESTIMACIÓN DEL CLUB</span>
              <span>{totals.knownRatings}/{totals.totalRatings} atributos evaluados</span>
            </div>
            {radarReady ? (
              <div className="pac-opponent__radar" aria-label="Radar de ocho familias, construido únicamente con las estimaciones de scouting">
                <AttributeRadar axes={radarAxes}
                  selectedCategory={selectedFamily} onCategorySelect={selectFamily}
                  accent="var(--cs-lime)" showValues courtsideFraming />
              </div>
            ) : (
              <div className="pac-opponent__radar-pending">
                <span className="pac-opponent__unknown-icon" aria-hidden="true">?</span>
                <h3>PERFIL AÚN INCOMPLETO</h3>
                <p>Hay {totals.knownRatings} atributos evaluados, pero faltan estimaciones en algunas familias. El radar solo aparece al conocer las ocho familias completas.</p>
                <p>Selecciona una familia para consultar lo que ya sabemos de ella.</p>
              </div>
            )}
            <div className="pac-opponent__family-reading">
              <div className="pac-opponent__family-reading-head">
                <div><strong>{(selectedProfile?.label ?? 'FAMILIA').toUpperCase()}</strong>
                  <span>{selectedProfile?.observed ?? 0}/{selectedProfile?.total ?? 0} atributos evaluados</span>
                </div>
                <strong className="pac-opponent__family-estimate">
                  {selectedProfile?.estimate === null || selectedProfile?.estimate === undefined
                    ? 'SIN DATOS' : '≈ ' + selectedProfile.estimate}
                </strong>
              </div>
              {selectedProfile?.estimate !== null && selectedProfile?.estimate !== undefined ? (
                <>
                  <div className="pac-opponent__range">
                    <span>Intervalo orientativo</span>
                    <strong>{selectedProfile.low}–{selectedProfile.high}</strong>
                  </div>
                  <div className="pac-opponent__family-meter" aria-hidden="true">
                    <i style={{ width: selectedProfile.estimate + '%' }} />
                  </div>
                  <div className="pac-opponent__confidence-row">
                    <span>Cobertura de informes <strong>{selectedProfile.coverage ?? 0}%</strong></span>
                    <span>Confianza de estimaciones <strong>{selectedProfile.confidence ?? 0}%</strong></span>
                  </div>
                </>
              ) : <p className="pac-opponent__insufficient">Esta familia todavía no tiene una evaluación individual utilizable.</p>}
              {radarReady && strongestFamily !== undefined && weakestFamily !== undefined && (
                <p className="pac-opponent__shape-read">
                  Perfil estimado: más alto en <strong>{strongestFamily.label}</strong> y más bajo en <strong>{weakestFamily.label}</strong>.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="pac-opponent__profile-foot">
          <span>Estimaciones, no ratings reales. Los intervalos reflejan incertidumbre del scouting.</span>
        </div>
      </section>

      <div className="pac-opponent__right">
        <section className="pac-card pac-opponent__ratings">
          <header className="pac-head"><h2>{(activeFamily?.label ?? 'ATTRIBUTES').toUpperCase()}</h2><span>{knownRatings.length} evaluados</span></header>
          {knownRatings.length === 0 ? <div className="pac-opponent__empty">
            <strong>SIN ATRIBUTOS EVALUADOS</strong>
            <p>Esta familia todavía no tiene valoraciones individuales conocidas. No se muestran filas repetidas de «Not scouted».</p>
            <button type="button" onClick={() => requestAssessment('SKILL_EVALUATION')} disabled={requestBlocker !== null}>SOLICITAR EVALUACIÓN DE HABILIDADES ›</button>
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
            <button type="button" onClick={() => requestAssessment(totals.knownRatings > 0 ? 'FULL_REPORT' : 'QUICK_LOOK')} disabled={requestBlocker !== null}>
              {pending === undefined ? 'ASIGNAR SCOUT / SOLICITAR INFORME ›' : 'EVALUACIÓN EN CURSO'}
            </button>
            {requestBlocker !== null && <p className="pac-opponent__blocker" role="status">{requestBlocker}</p>}
            {!addressable && <button className="pac-opponent__secondary" type="button" onClick={() => setActiveApp('scouting')}>IR A SCOUTING CENTRE / COBERTURA ›</button>}
            {pending !== undefined && <button className="pac-opponent__secondary" type="button" onClick={openScouting}>VER ASIGNACIÓN ›</button>}
            <small>La misión utiliza el servicio canónico de scouting. Sus resultados aparecen después de avanzar el tiempo de juego.</small>
          </div>
        </section>
      </div>
    </div>
    {world !== null && team !== undefined && playerId !== null && requestOpen && requestBlocker === null && (
      <RequestScoutingModal
        world={world} teamId={team.id} playerId={playerId} initialMission={requestMission}
        initialSkillFamily={selectedFamily}
        onClose={() => setRequestOpen(false)} onSubmit={submitScouting}
      />
    )}
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
