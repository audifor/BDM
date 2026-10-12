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

import { FilterGroup, InspectorSection, MetricRow } from '@/ui-ng/applications/staff/StaffChrome'
import { RECOMMENDATION_FAILURE_MESSAGES } from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
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

  return (
    <div className="staff-workspace__stack">
      <FilterGroup>
        <button
          aria-pressed={filter === 'open'}
          className={`ng-btn ng-btn--toggle${filter === 'open' ? ' is-active' : ''}`}
          onClick={() => {
            setFilter('open')
            setFailureMessage(undefined)
          }}
          type="button"
        >
          Open
        </button>
        <button
          aria-pressed={filter === 'history'}
          className={`ng-btn ng-btn--toggle${filter === 'history' ? ' is-active' : ''}`}
          onClick={() => {
            setFilter('history')
            setFailureMessage(undefined)
          }}
          type="button"
        >
          History
        </button>
      </FilterGroup>
      {filtered.length === 0 ? (
        <p className="staff-workspace__empty">
          {filter === 'open' ? 'No open recommendations.' : 'No resolved recommendations yet.'}
        </p>
      ) : (
        <div className="staff-workspace__split">
          <div className="staff-workspace__panel ng-holo-panel">
            <NgPrecisionTable
              className="staff-workspace__table"
              columns={ngTableColumns(filtered, [
                ngCol('date', 'Date', (row) => row.decidedOn, { value: (row) => row.decidedOn }),
                ngCol('domain', 'Domain', (row) => RESPONSIBILITY_DOMAIN_LABELS[row.domain], {
                  value: (row) => RESPONSIBILITY_DOMAIN_LABELS[row.domain],
                }),
                ngCol('recommendation', 'Recommendation', (row) => row.summary, { value: (row) => row.summary }),
                ngCol('from', 'From', (row) => row.staffName, { value: (row) => row.staffName }),
                ngCol('quality', 'Quality', (row) => staffQualityBand(row.qualityScore), {
                  value: (row) => staffQualityBand(row.qualityScore),
                }),
                ngCol('status', 'Status', (row) => row.status, { value: (row) => row.status }),
              ])}
              gridId="ng-staff-advisory"
              onSelectionChange={(ids) => {
                if (ids[0]) {
                  setSelectedId(ids[0])
                  setFailureMessage(undefined)
                }
              }}
              rows={filtered}
              selectedId={selected?.id}
            />
          </div>
          {selected !== undefined ? (
            <AdvisoryInspector
              item={selected}
              key={selected.id}
              onAccept={onAcceptRecommendation}
              onDismiss={onDismissRecommendation}
              onFailure={setFailureMessage}
            />
          ) : null}
        </div>
      )}
      <section className="cs-staff-decision-room" aria-label="Sala de decisiones del cuerpo técnico">
        <div className="cs-staff-eyebrow">EL CRITERIO DE TU EQUIPO / TRAZABILIDAD</div>
        <div className="cs-staff-section-heading"><h2>SALA DE DECISIONES</h2>
          <span>Recomendaciones emitidas por empleados reales y resolución registrada.</span></div>
        <div className="cs-staff-decision-room__kpis">
          <div><strong>{items.filter(item=>item.status==='PENDING').length}</strong><span>ESPERANDO TU DECISIÓN</span></div>
          <div><strong>{items.filter(item=>item.status==='INFORMATIONAL').length}</strong><span>INFORMATIVAS</span></div>
          <div><strong>{items.filter(item=>item.status==='ACCEPTED').length}</strong><span>ACEPTADAS</span></div>
          <div><strong>{items.filter(item=>item.status==='DISMISSED').length}</strong><span>DESCARTADAS</span></div>
        </div>
        <div className="cs-staff-decision-room__voices">
          {items.length===0?<p>No constan recomendaciones del staff en esta partida todavía. Al producirse, aparecerán aquí con su autor y estado.</p>:
            items.slice(0,4).map(item=><article key={item.id}>
              <div><button type="button" onClick={()=>navigateToStaff(item.staffId)}>{item.staffName} ↗</button>
                <span>{RESPONSIBILITY_DOMAIN_LABELS[item.domain]} · {item.decidedOn}</span></div>
              <strong>{item.title}</strong><p>{item.summary}</p>
              <span className="cs-staff-decision-room__status">{item.status==='PENDING'?'PENDIENTE':
                item.status==='INFORMATIONAL'?'INFORMATIVA':item.status==='ACCEPTED'?'ACEPTADA':'DESCARTADA'}</span>
            </article>)}
        </div>
        <p className="cs-staff-decision-room__note">Se muestran decisiones atribuibles y evidencias registradas. Una recomendación acertada no garantiza un resultado; no se muestra conocimiento oculto ni debates inventados.</p>
      </section>
      {failureMessage !== undefined ? <p className="staff-workspace__failure">{failureMessage}</p> : null}
    </div>
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
      <p className="staff-workspace__eyebrow">Recommendation</p>
      <h2 className="staff-workspace__inspector-title">{item.title}</h2>
      <dl className="staff-workspace__metrics">
        <MetricRow label="Domain" value={RESPONSIBILITY_DOMAIN_LABELS[item.domain]} />
        <MetricRow label="Status" value={item.status} />
        <MetricRow label="Date" value={item.decidedOn} />
        <MetricRow label="From" value={item.staffName} />
        {item.staffRole !== undefined ? <MetricRow label="Role" value={STAFF_ROLE_LABELS[item.staffRole]} /> : null}
        <MetricRow label="Quality" value={staffQualityBand(item.qualityScore)} />
      </dl>

      <InspectorSection title="Details">
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
