import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import type { InjuryId, PlayerId, StaffPersonId } from '@/domain/ids'
import type { RehabilitationMode, ReturnToPlayDecision } from '@/domain/injury'
import type { DelegationOutcomeId } from '@/domain/responsibility'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { getStaffRecommendationsForTeam } from '@/ui/staffRecommendationPresentation'
import { STAFF_ROLE_LABELS, staffQualityBand } from '@/ui/staffPresentation'
import type { StaffRecommendationPresentationItem } from '@/ui/staffRecommendationPresentation'
import { buildMedicalWorkspaceModel } from '@/ui-ng/applications/medical/buildMedicalWorkspaceModel'
import {
  MEDICAL_WORKSPACE_TABS,
  medicalTabLabel,
  type MedicalHistoryRow,
  type MedicalInjuredRow,
  type MedicalRiskRow,
  type MedicalReturnToPlayRow,
  type MedicalStaffRow,
  type MedicalWorkspaceModel,
  type MedicalWorkspaceTabId,
} from '@/ui-ng/applications/medical/medicalWorkspaceModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import { navigateToPlayerMedical, navigateToStaff } from '@/ui-ng/workspace/workspaceApps'

import './medical-workspace.css'

function MedicalWorkspaceHeader({ model }: { readonly model: MedicalWorkspaceModel }) {
  return (
    <header className="medical-workspace-header" data-ng-region="medical-workspace-header">
      <div className="medical-workspace-header__main">
        <span className="medical-workspace-header__app">Medical</span>
        <span className="medical-workspace-header__sep" aria-hidden />
        <span className="medical-workspace-header__team">{model.teamName}</span>
        <span className="medical-workspace-header__meta">
          <span className="ng-type-numeric">{model.availableCount}</span> available
          {' · '}
          <span className="ng-type-numeric">{model.injuredCount}</span> injured
          {' · '}
          <span className="ng-type-numeric">{model.averageFatigue}</span> fatigue
          {' · '}
          <span className="ng-type-numeric">{model.medicalStaffCount}</span> staff
        </span>
      </div>
    </header>
  )
}

function MetricRow({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="medical-workspace__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function ReturnToPlayBoard({
  rows,
  onDecision,
  onFitnessTest,
  onOpenPlayer,
}: {
  readonly rows: readonly MedicalReturnToPlayRow[]
  readonly onDecision: (injuryId: InjuryId, decision: ReturnToPlayDecision, recommendationOutcomeId?: DelegationOutcomeId) => void
  readonly onFitnessTest: (injuryId: InjuryId) => void
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="medical-workspace__panel ng-holo-panel medical-workspace__rtp" aria-label="Return-to-Play review">
      <p className="medical-workspace__eyebrow">RETURN-TO-PLAY REVIEW</p>
      {rows.map((row) => (
        <article className="medical-workspace__rtp-row" key={row.injuryId}>
          <div>
            <button className="medical-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">{row.playerName}</button>
            <p>{row.injuryLabel} · injured {row.injuredOnLabel} · projected return {row.expectedReturnLabel} · review due {row.reviewDueLabel} · Career Fatigue {row.fatigue}</p>
            {row.recommendationSummary === undefined ? <p>No current Staff recommendation.</p> : (
              <p>Advice from {row.staffName} ({row.staffQuality}/100): {row.recommendationSummary}</p>
            )}
            {row.reviewHistory.map((review, index) => <p key={`${review.dateLabel}-${index}`}>Prior review {review.dateLabel}: {review.decision} · {review.actorLabel}</p>)}
            {row.fitnessTestRequired ? <p>Fitness test required · latest result: {row.fitnessTestResult ?? 'not tested'}</p> : <p>Fitness test not required for this injury.</p>}
          </div>
          <div className="medical-workspace__rtp-actions">
            {row.fitnessTestRequired && !row.canClear ? <button onClick={() => onFitnessTest(row.injuryId)} type="button">RUN FITNESS TEST</button> : null}
            <button disabled={!row.canClear} onClick={() => onDecision(row.injuryId, 'CLEAR_FOR_PLAY', row.recommendationOutcomeId)} type="button">CLEAR FOR PLAY</button>
            <button onClick={() => onDecision(row.injuryId, 'CONTINUE_RECOVERY', row.recommendationOutcomeId)} type="button">CONTINUE RECOVERY</button>
          </div>
        </article>
      ))}
    </section>
  )
}

function MedicalRecommendationsBoard({
  recommendations,
  onAccept,
  onDismiss,
}: {
  readonly recommendations: readonly StaffRecommendationPresentationItem[]
  readonly onAccept: (outcomeId: DelegationOutcomeId) => void
  readonly onDismiss: (outcomeId: DelegationOutcomeId) => void
}) {
  if (recommendations.length === 0) return null
  return (
    <section className="medical-workspace__panel ng-holo-panel" aria-label="Staff recommendations">
      <p className="medical-workspace__eyebrow">STAFF RECOMMENDATIONS</p>
      {recommendations.map((recommendation) => (
        <article className="medical-workspace__rtp-row" key={recommendation.outcomeId}>
          <div>
            <strong>{recommendation.title}</strong>
            <p>{recommendation.summary} · {recommendation.staffName} · {recommendation.staffRole === undefined ? 'Role not recorded' : STAFF_ROLE_LABELS[recommendation.staffRole]} · {staffQualityBand(recommendation.qualityScore)}</p>
          </div>
          {recommendation.actionability === 'ACCEPTABLE' ? (
            <div className="medical-workspace__rtp-actions">
              <button onClick={() => onAccept(recommendation.outcomeId)} type="button">ACCEPT</button>
              <button onClick={() => onDismiss(recommendation.outcomeId)} type="button">DISMISS</button>
            </div>
          ) : <span>{recommendation.status}</span>}
        </article>
      ))}
    </section>
  )
}

function OverviewBoard({
  model,
  onOpenPlayer,
}: {
  readonly model: MedicalWorkspaceModel
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  return (
    <div className="medical-workspace__overview">
      <section className="medical-workspace__card ng-holo-panel">
        <p className="medical-workspace__eyebrow">Availability</p>
        <h3 className="medical-workspace__card-title">Roster status</h3>
        <dl className="medical-workspace__metrics">
          <MetricRow label="Available" value={model.availableCount} />
          <MetricRow label="Injured" value={model.injuredCount} />
          <MetricRow label="Roster" value={model.rosterCount} />
          <MetricRow label="Date" value={model.currentDateLabel} />
        </dl>
      </section>
      <section className="medical-workspace__card ng-holo-panel">
        <p className="medical-workspace__eyebrow">Load</p>
        <h3 className="medical-workspace__card-title">Fatigue</h3>
        <dl className="medical-workspace__metrics">
          <MetricRow label="Average" value={model.averageFatigue} />
        </dl>
      </section>
      <section className="medical-workspace__card ng-holo-panel">
        <p className="medical-workspace__eyebrow">Risk</p>
        <h3 className="medical-workspace__card-title">Medical risk</h3>
        <dl className="medical-workspace__metrics">
          <MetricRow label="High" value={model.highRiskCount} />
          <MetricRow label="Elevated" value={model.elevatedRiskCount} />
          <MetricRow label="Low" value={model.lowRiskCount} />
        </dl>
      </section>
      <section className="medical-workspace__card ng-holo-panel">
        <p className="medical-workspace__eyebrow">Department</p>
        <h3 className="medical-workspace__card-title">Medical staff</h3>
        <dl className="medical-workspace__metrics">
          <MetricRow label="Staff" value={model.medicalStaffCount} />
          <MetricRow label="Open advisories" value={model.openAdvisoryCount} />
        </dl>
      </section>
      {model.injured.length === 0 ? (
        <p className="medical-workspace__empty">No active injuries.</p>
      ) : (
        <section className="medical-workspace__panel ng-holo-panel medical-workspace__panel--span">
          <p className="medical-workspace__eyebrow">Active injuries</p>
          <NgPrecisionTable
            className="medical-workspace__table"
            columns={ngTableColumns(model.injured.map((row) => ({ ...row, id: row.injuryId })), [
              ngCol('name', 'Player', (row) => (
                <button className="medical-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">
                  {row.playerName}
                </button>
              ), { value: (row) => row.playerName }),
              ngCol('injury', 'Injury', (row) => row.injuryLabel, { value: (row) => row.injuryLabel }),
              ngCol('status', 'Status', (row) => row.lifecycleStatus, { value: (row) => row.lifecycleStatus }),
              ngCol('severity', 'Severity', (row) => (
                <span className={`medical-workspace__badge medical-workspace__badge--${row.severity}`}>
                  {row.severityLabel}
                </span>
              ), { value: (row) => row.severityLabel }),
              ngCol('return', 'Return', (row) => row.expectedReturnLabel, { value: (row) => row.expectedReturnLabel }),
            ])}
            gridId="ng-medical-overview"
            rows={model.injured.map((row) => ({ ...row, id: row.injuryId }))}
          />
        </section>
      )}
    </div>
  )
}

function InjuredBoard({
  rows,
  selectedInjuryId,
  onSelectInjury,
  onOpenPlayer,
  onSetRehabilitationPlan,
}: {
  readonly rows: readonly MedicalInjuredRow[]
  readonly selectedInjuryId: InjuryId | undefined
  readonly onSelectInjury: (injuryId: InjuryId) => void
  readonly onOpenPlayer: (playerId: PlayerId) => void
  readonly onSetRehabilitationPlan: (injuryId: InjuryId, mode: RehabilitationMode) => void
}) {
  if (rows.length === 0) {
    return <p className="medical-workspace__empty">No active injuries.</p>
  }

  const selected = rows.find((row) => row.injuryId === selectedInjuryId) ?? rows[0]

  return (
    <div className="medical-workspace__split">
      <div className="medical-workspace__panel ng-holo-panel">
        <NgPrecisionTable
          className="medical-workspace__table"
          columns={ngTableColumns(rows.map((row) => ({ ...row, id: row.injuryId })), [
            ngCol('name', 'Player', (row) => (
              <button
                className="medical-workspace__link"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenPlayer(row.playerId)
                }}
                type="button"
              >
                {row.playerName}
              </button>
            ), { value: (row) => row.playerName }),
            ngCol('pos', 'Pos', (row) => <PlayPositionMark position={row.position} />, { value: (row) => row.position }),
            ngCol('injury', 'Injury', (row) => row.injuryLabel, { value: (row) => row.injuryLabel }),
            ngCol('severity', 'Severity', (row) => (
              <span className={`medical-workspace__badge medical-workspace__badge--${row.severity}`}>
                {row.severityLabel}
              </span>
            ), { value: (row) => row.severityLabel }),
            ngCol('injured', 'Injured', (row) => row.injuredOnLabel, { value: (row) => row.injuredOnLabel }),
            ngCol('return', 'Return', (row) => row.expectedReturnLabel, { value: (row) => row.expectedReturnLabel }),
            ngCol('remaining', 'Remaining', (row) => row.daysRemaining, { numeric: true, value: (row) => row.daysRemaining }),
          ])}
          gridId="ng-medical-injured"
          onSelectionChange={(ids) => {
            const next = ids[0]
            if (next !== undefined) onSelectInjury(next as InjuryId)
          }}
          rows={rows.map((row) => ({ ...row, id: row.injuryId }))}
          selectedId={selected?.injuryId}
        />
      </div>
      {selected === undefined ? null : (
        <aside className="medical-workspace__inspector ng-holo-panel" data-ng-region="medical-injured-inspector">
          <p className="medical-workspace__eyebrow">Injury dossier</p>
          <h3 className="medical-workspace__inspector-title">{selected.playerName}</h3>
          <dl className="medical-workspace__metrics">
            <MetricRow label="Position" value={<PlayPositionMark position={selected.position} />} />
            <MetricRow label="Injury" value={selected.injuryLabel} />
            <MetricRow label="Severity" value={selected.severityLabel} />
            <MetricRow label="Source" value={selected.sourceLabel} />
            <MetricRow label="Injured on" value={selected.injuredOnLabel} />
            <MetricRow label="Expected return" value={selected.expectedReturnLabel} />
            <MetricRow label="Projected review" value={selected.reviewDueLabel} />
            <MetricRow label="Medical status" value={selected.lifecycleStatus} />
            <MetricRow label="Fitness test" value={selected.fitnessTestLabel} />
            <MetricRow label="Career Fatigue" value={selected.fatigue} />
            <MetricRow label="Days remaining" value={selected.daysRemaining} />
            <MetricRow label="Duration" value={selected.durationLabel} />
            <MetricRow label="Rehabilitation" value={selected.rehabilitationMode.replaceAll('_', ' ')} />
            <MetricRow label="Suggested plan" value={selected.suggestedRehabilitationMode.replaceAll('_', ' ')} />
          </dl>
          <p>{selected.rehabilitationConsequence}</p>
          <label className="medical-workspace__rehab-control">
            Rehab plan
            <select disabled={!selected.canChangeRehabilitation} onChange={(event) => onSetRehabilitationPlan(selected.injuryId, event.target.value as RehabilitationMode)} value={selected.rehabilitationMode}>
              <option value="REST">REST</option>
              <option value="STANDARD_REHAB">STANDARD REHAB</option>
              <option value="ACCELERATED_REHAB">ACCELERATED REHAB</option>
            </select>
          </label>
          {selected.rehabilitationHistory.map((entry) => <p key={entry}>{entry}</p>)}
        </aside>
      )}
    </div>
  )
}

function HistoryBoard({
  rows,
  onOpenPlayer,
}: {
  readonly rows: readonly MedicalHistoryRow[]
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  if (rows.length === 0) {
    return <p className="medical-workspace__empty">No recorded injuries.</p>
  }

  return (
    <div className="medical-workspace__panel ng-holo-panel">
      <NgPrecisionTable
        className="medical-workspace__table"
        columns={ngTableColumns(rows.map((row) => ({ ...row, id: row.injuryId })), [
          ngCol('name', 'Player', (row) => (
            <button className="medical-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">
              {row.playerName}
            </button>
          ), { value: (row) => row.playerName }),
          ngCol('injury', 'Injury', (row) => row.injuryLabel, { value: (row) => row.injuryLabel }),
          ngCol('severity', 'Severity', (row) => row.severityLabel, { value: (row) => row.severityLabel }),
          ngCol('status', 'Status', (row) => (
            <span className={`medical-workspace__state medical-workspace__state--${row.statusLabel.toLowerCase()}`}>
              {row.statusLabel}
            </span>
          ), { value: (row) => row.statusLabel }),
          ngCol('cleared', 'Cleared on', (row) => row.clearedOnLabel ?? '—', { value: (row) => row.clearedOnLabel ?? '—' }),
          ngCol('injured', 'Injured', (row) => row.injuredOnLabel, { value: (row) => row.injuredOnLabel }),
          ngCol('return', 'Return', (row) => row.expectedReturnLabel, { value: (row) => row.expectedReturnLabel }),
          ngCol('duration', 'Duration', (row) => row.durationLabel, { value: (row) => row.durationLabel }),
          ngCol('source', 'Source', (row) => row.sourceLabel, { value: (row) => row.sourceLabel }),
          ngCol('related', 'Body family / recurrence', (row) => `${row.familyLabel} · ${row.recurrenceLabel}`, { value: (row) => `${row.familyLabel}; ${row.recurrenceLabel}` }),
          ngCol('medical', 'Rehab / setback / tests / clearance', (row) => <span>{row.rehabSummary} · setback: {row.setbackSummary} · tests: {row.fitnessTestSummary} · cleared: {row.clearanceLabel}</span>, { value: (row) => `${row.rehabSummary}; ${row.setbackSummary}; ${row.fitnessTestSummary}; ${row.clearanceLabel}` }),
        ])}
        gridId="ng-medical-history"
        rows={rows.map((row) => ({ ...row, id: row.injuryId }))}
      />
    </div>
  )
}

function RiskBoard({
  rows,
  selectedPlayerId,
  onSelectPlayer,
  onOpenPlayer,
}: {
  readonly rows: readonly MedicalRiskRow[]
  readonly selectedPlayerId: PlayerId | undefined
  readonly onSelectPlayer: (playerId: PlayerId) => void
  readonly onOpenPlayer: (playerId: PlayerId) => void
}) {
  if (rows.length === 0) {
    return <p className="medical-workspace__empty">No medical risk assessments for this roster.</p>
  }

  const selected = rows.find((row) => row.playerId === selectedPlayerId) ?? rows[0]

  return (
    <div className="medical-workspace__split">
      <div className="medical-workspace__panel ng-holo-panel">
        <NgPrecisionTable
          className="medical-workspace__table"
          columns={ngTableColumns(rows.map((row) => ({ ...row, id: row.playerId })), [
            ngCol('name', 'Player', (row) => (
              <button
                className="medical-workspace__link"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenPlayer(row.playerId)
                }}
                type="button"
              >
                {row.playerName}
              </button>
            ), { value: (row) => row.playerName }),
            ngCol('pos', 'Pos', (row) => <PlayPositionMark position={row.position} />, { value: (row) => row.position }),
            ngCol('availability', 'Availability', (row) => (row.available ? 'Available' : 'Injured'), {
              value: (row) => (row.available ? 'Available' : 'Injured'),
            }),
            ngCol('fatigue', 'Fatigue', (row) => row.fatigue, { numeric: true, value: (row) => row.fatigue }),
            ngCol('load', 'Load', (row) => row.fatigueLabel, { value: (row) => row.fatigueLabel }),
            ngCol('risk', 'Risk', (row) => (
              <span className={`medical-workspace__badge medical-workspace__badge--${row.riskBand}`}>
                {row.riskBandLabel}
              </span>
            ), { value: (row) => row.riskBandLabel }),
            ngCol('score', 'Score', (row) => row.riskScore, { numeric: true, value: (row) => row.riskScore }),
          ])}
          gridId="ng-medical-load"
          onSelectionChange={(ids) => {
            const next = ids[0]
            if (next !== undefined) onSelectPlayer(next as PlayerId)
          }}
          rows={rows.map((row) => ({ ...row, id: row.playerId }))}
          selectedId={selected?.playerId}
        />
      </div>
      {selected === undefined ? null : (
        <aside className="medical-workspace__inspector ng-holo-panel" data-ng-region="medical-risk-inspector">
          <p className="medical-workspace__eyebrow">Risk assessment</p>
          <h3 className="medical-workspace__inspector-title">{selected.playerName}</h3>
          <dl className="medical-workspace__metrics">
            <MetricRow label="Band" value={selected.riskBandLabel} />
            <MetricRow label="Score" value={selected.riskScore} />
            <MetricRow label="Fatigue" value={selected.fatigue} />
            <MetricRow label="Load" value={selected.fatigueLabel} />
            <MetricRow label="Availability" value={selected.available ? 'Available' : 'Injured'} />
            {selected.quality === null ? null : <MetricRow label="Advisory quality" value={selected.quality} />}
          </dl>
          {selected.reasons.length === 0 ? (
            <p className="medical-workspace__note">No elevated risk factors.</p>
          ) : (
            <ul className="medical-workspace__reasons">
              {selected.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  )
}

function StaffBoard({
  rows,
  onOpenStaff,
}: {
  readonly rows: readonly MedicalStaffRow[]
  readonly onOpenStaff: (staffPersonId: StaffPersonId) => void
}) {
  if (rows.length === 0) {
    return <p className="medical-workspace__empty">No medical staff assigned to this team.</p>
  }

  return (
    <div className="medical-workspace__panel ng-holo-panel">
      <NgPrecisionTable
        className="medical-workspace__table"
        columns={ngTableColumns(rows.map((row) => ({ ...row, id: row.staffPersonId })), [
          ngCol('name', 'Staff', (row) => (
            <button className="medical-workspace__link" onClick={() => onOpenStaff(row.staffPersonId)} type="button">
              {row.name}
            </button>
          ), { value: (row) => row.name }),
          ngCol('role', 'Role', (row) => row.roleLabel, { value: (row) => row.roleLabel }),
          ngCol('proficiency', 'Proficiency', (row) => row.proficiency, { numeric: true, value: (row) => row.proficiency }),
          ngCol('workload', 'Workload', (row) => row.workloadLabel, { value: (row) => row.workloadLabel }),
          ngCol('utilization', 'Utilization', (row) => row.utilizationLabel, { value: (row) => row.utilizationLabel }),
        ])}
        gridId="ng-medical-staff"
        rows={rows.map((row) => ({ ...row, id: row.staffPersonId }))}
      />
    </div>
  )
}

export function MedicalWorkspace() {
  const world = useGameStore((state) => state.world)
  const acceptStaffRecommendation = useGameStore((state) => state.acceptStaffRecommendation)
  const dismissStaffRecommendation = useGameStore((state) => state.dismissStaffRecommendation)
  const reviewReturnToPlay = useGameStore((state) => state.reviewReturnToPlay)
  const setRehabilitationPlan = useGameStore((state) => state.setRehabilitationPlan)
  const conductFitnessTest = useGameStore((state) => state.conductFitnessTest)
  const [activeTab, setActiveTab] = useState<MedicalWorkspaceTabId>('overview')
  const [selectedInjuryId, setSelectedInjuryId] = useState<InjuryId | undefined>(undefined)
  const [selectedRiskPlayerId, setSelectedRiskPlayerId] = useState<PlayerId | undefined>(undefined)

  const model = useMemo(() => (world === null ? null : buildMedicalWorkspaceModel(world)), [world])
  const team = useMemo(() => (world === null ? undefined : getUserTeam(world)), [world])
  const teamStyle = useMemo(() => {
    if (team === undefined) return undefined
    const colors = deriveTeamColors(team.id)
    return {
      '--po-team-primary': colors.primary,
      '--po-team-secondary': colors.secondary,
      '--po-team-muted': colors.muted,
    } as CSSProperties
  }, [team])

  const tabs = useMemo(
    () =>
      model === null
        ? []
        : MEDICAL_WORKSPACE_TABS.map((id) => ({
            id,
            label: medicalTabLabel(id, model),
            active: id === activeTab,
          })),
    [activeTab, model],
  )
  const medicalRecommendations = useMemo(
    () => world === null || model === null ? [] : getStaffRecommendationsForTeam(world, model.teamId).filter((item) => item.domain === 'medical' && (item.status === 'PENDING' || item.status === 'INFORMATIONAL')),
    [model, world],
  )

  if (world === null || model === null) {
    return (
      <div className="medical-workspace medical-workspace--empty" data-ng-region="medical-workspace">
        <section className="medical-workspace__empty-state">
          <h1 className="medical-workspace__empty-title">Medical</h1>
          <p className="medical-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="medical-workspace" data-ng-region="medical-workspace" style={teamStyle}>
      <ApplicationWorkspace
        header={<MedicalWorkspaceHeader model={model} />}
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            onTabSelect={(tabId) => setActiveTab(tabId as MedicalWorkspaceTabId)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="medical-workspace__scroll">
          {activeTab === 'overview' ? (
            <>
              <ReturnToPlayBoard
                rows={model.returnToPlayReviews}
                onDecision={(injuryId, decision, outcomeId) => reviewReturnToPlay(injuryId, decision, outcomeId)}
                onFitnessTest={(injuryId) => conductFitnessTest(injuryId)}
                onOpenPlayer={navigateToPlayerMedical}
              />
              <MedicalRecommendationsBoard
                recommendations={medicalRecommendations}
                onAccept={(outcomeId) => acceptStaffRecommendation(outcomeId)}
                onDismiss={(outcomeId) => dismissStaffRecommendation(outcomeId)}
              />
              <OverviewBoard model={model} onOpenPlayer={navigateToPlayerMedical} />
            </>
          ) : null}
          {activeTab === 'injured' ? (
            <InjuredBoard
              onOpenPlayer={navigateToPlayerMedical}
              onSelectInjury={setSelectedInjuryId}
              onSetRehabilitationPlan={(injuryId, mode) => setRehabilitationPlan(injuryId, mode)}
              rows={model.injured}
              selectedInjuryId={selectedInjuryId}
            />
          ) : null}
          {activeTab === 'history' ? <HistoryBoard onOpenPlayer={navigateToPlayerMedical} rows={model.history} /> : null}
          {activeTab === 'risk' ? (
            <RiskBoard
              onOpenPlayer={navigateToPlayerMedical}
              onSelectPlayer={setSelectedRiskPlayerId}
              rows={model.risk}
              selectedPlayerId={selectedRiskPlayerId}
            />
          ) : null}
          {activeTab === 'staff' ? <StaffBoard onOpenStaff={navigateToStaff} rows={model.staff} /> : null}
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
