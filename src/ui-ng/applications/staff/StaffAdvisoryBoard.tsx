import { useState } from 'react'

import type { StaffRecommendationCommandResult } from '@/app/staffRecommendations'
import type { DelegationOutcomeId } from '@/domain/responsibility'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { RESPONSIBILITY_DOMAIN_LABELS, STAFF_ROLE_LABELS, staffQualityBand } from '@/ui/staffPresentation'
import {
  getStaffRecommendationsForTeam,
  type StaffRecommendationPresentationItem,
} from '@/ui/staffRecommendationPresentation'

import { InspectorSection, MetricRow } from '@/ui-ng/applications/staff/StaffChrome'
import { RECOMMENDATION_FAILURE_MESSAGES } from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { navigateToStaff } from '@/ui-ng/workspace/workspaceApps'

type AdvisoryFilter = 'open' | 'history'

export function StaffAdvisoryBoard({
  world,
  teamId,
  onAcceptRecommendation,
  onDismissRecommendation,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly onAcceptRecommendation?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult
  readonly onDismissRecommendation?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult
}) {
  const items = getStaffRecommendationsForTeam(world, teamId)
  const [filter, setFilter] = useState<AdvisoryFilter>('open')
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [failureMessage, setFailureMessage] = useState<string | undefined>(undefined)

  const filtered = items.filter((item) =>
    filter === 'open' ? item.status === 'PENDING' || item.status === 'INFORMATIONAL' : item.status === 'ACCEPTED' || item.status === 'DISMISSED',
  )
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0]

  const pending=items.filter(item=>item.status==='PENDING').length
  const info=items.filter(item=>item.status==='INFORMATIONAL').length
  const accepted=items.filter(item=>item.status==='ACCEPTED').length
  const dismissed=items.filter(item=>item.status==='DISMISSED').length
  return (
    <section className="cs-staff-advisory" aria-label="Sala de decisiones del cuerpo técnico">
      <header className="cs-staff-advisory__header">
        <div>
          <span className="cs-staff-eyebrow">CRITERIO DEL CUERPO TÉCNICO / TRAZABILIDAD</span>
          <h1>SALA DE DECISIONES</h1>
          <p>Decide sobre recomendaciones reales y consulta quién propuso cada medida.</p>
        </div>
        <div className="cs-staff-advisory__counts" aria-label="Estado de recomendaciones">
          <span><strong>{pending}</strong> PENDIENTES</span>
          <span><strong>{info}</strong> INFORMATIVAS</span>
          <span><strong>{accepted}</strong> ACEPTADAS</span>
          <span><strong>{dismissed}</strong> DESCARTADAS</span>
        </div>
      </header>
      <nav className="cs-staff-advisory__filters" aria-label="Filtrar recomendaciones">
        <button type="button" aria-pressed={filter==='open'} onClick={()=>{
          setFilter('open');setFailureMessage(undefined)}}>POR DECIDIR <strong>{pending+info}</strong></button>
        <button type="button" aria-pressed={filter==='history'} onClick={()=>{
          setFilter('history');setFailureMessage(undefined)}}>HISTORIAL <strong>{accepted+dismissed}</strong></button>
      </nav>
      {filtered.length===0?
        <div className="cs-staff-advisory__empty">
          <strong>{filter==='open'?'NINGUNA DECISIÓN PENDIENTE':'TODAVÍA NO HAY DECISIONES RESUELTAS'}</strong>
          <p>{filter==='open'?'Cuando tus empleados emitan recomendaciones, aparecerán aquí con autor y evidencias reales.':
            'Las recomendaciones aceptadas y descartadas se registrarán aquí.'}</p>
        </div>:
        <div className="cs-staff-advisory__layout">
          <div className="cs-staff-advisory__inbox" aria-label="Recomendaciones del equipo">
            {filtered.map(item=><button type="button" key={item.id}
              className={'cs-staff-advisory__item'+(selected?.id===item.id?' is-selected':'')}
              aria-pressed={selected?.id===item.id} onClick={()=>{
                setSelectedId(item.id);setFailureMessage(undefined)}}>
              <div className="cs-staff-advisory__item-top">
                <span>{RESPONSIBILITY_DOMAIN_LABELS[item.domain]}</span>
                <span className={'cs-staff-advisory__status cs-staff-advisory__status--'+item.status.toLowerCase()}>
                  {item.status==='PENDING'?'PENDIENTE':item.status==='INFORMATIONAL'?'INFORMATIVA':
                    item.status==='ACCEPTED'?'ACEPTADA':'DESCARTADA'}</span>
              </div>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <div className="cs-staff-advisory__item-bottom">
                <span>{item.staffName} · {staffQualityBand(item.qualityScore)}</span><time>{item.decidedOn}</time>
              </div>
            </button>)}
          </div>
          {selected!==undefined?<div className="cs-staff-advisory__detail">
            <AdvisoryInspector key={selected.id} item={selected}
              onAccept={onAcceptRecommendation} onDismiss={onDismissRecommendation} onFailure={setFailureMessage}/>
            <button type="button" className="cs-staff-advisory__profile" onClick={()=>navigateToStaff(selected.staffId)}>
              VER PERFIL DE {selected.staffName.toUpperCase()} ↗
            </button>
          </div>:null}
        </div>}
      {failureMessage!==undefined?<p className="staff-workspace__failure" role="alert">{failureMessage}</p>:null}
      <p className="cs-staff-advisory__caveat">Las opiniones están basadas en el conocimiento disponible para cada empleado; no implican acierto garantizado ni muestran datos ocultos del mundo.</p>
    </section>
  )
}

function AdvisoryInspector({
  item,
  onAccept,
  onDismiss,
  onFailure,
}: {
  readonly item: StaffRecommendationPresentationItem
  readonly onAccept?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult
  readonly onDismiss?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult
  readonly onFailure: (message: string | undefined) => void
}) {
  const [localFailure, setLocalFailure] = useState<string | undefined>(undefined)
  const readOnly = onAccept === undefined && onDismiss === undefined

  const runCommand = (command: ((outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult) | undefined) => {
    if (command === undefined) return
    const result = command(item.outcomeId)
    if (!result.ok) {
      const message = RECOMMENDATION_FAILURE_MESSAGES[result.reason] ?? 'Recommendation is no longer valid.'
      setLocalFailure(message)
      onFailure(message)
      return
    }
    setLocalFailure(undefined)
    onFailure(undefined)
  }

  return (
    <aside className="staff-workspace__inspector ng-holo-panel">
      <p className="staff-workspace__eyebrow">RECOMENDACIÓN</p>
      <h2 className="staff-workspace__inspector-title">{item.title}</h2>
      <dl className="staff-workspace__metrics">
        <MetricRow label="Área" value={RESPONSIBILITY_DOMAIN_LABELS[item.domain]} />
        <MetricRow label="Estado" value={item.status} />
        <MetricRow label="Fecha" value={item.decidedOn} />
        <MetricRow label="Autor" value={item.staffName} />
        {item.staffRole !== undefined ? <MetricRow label="Puesto" value={STAFF_ROLE_LABELS[item.staffRole]} /> : null}
        <MetricRow label="Criterio" value={staffQualityBand(item.qualityScore)} />
      </dl>

      <InspectorSection title="Fundamentos">
        <p className="staff-workspace__note">{item.summary}</p>
        <dl className="staff-workspace__metrics">
          {item.detailRows.map((row) => (
            <MetricRow key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      </InspectorSection>

      {!readOnly && localFailure !== undefined ? <p className="staff-workspace__failure">{localFailure}</p> : null}

      {!readOnly && item.status === 'PENDING' && item.actionability === 'ACCEPTABLE' ? (
        <div className="staff-workspace__actions">
          <button className="ng-btn ng-btn--primary" onClick={() => runCommand(onAccept)} type="button">
            Accept
          </button>
          <button className="ng-btn" onClick={() => runCommand(onDismiss)} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      {!readOnly && item.status === 'INFORMATIONAL' ? (
        <div className="staff-workspace__actions">
          <button className="ng-btn" onClick={() => runCommand(onDismiss)} type="button">
            Dismiss
          </button>
        </div>
      ) : null}
    </aside>
  )
}
