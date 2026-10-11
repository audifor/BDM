import { useMemo, useState } from 'react'

import type { MedicalBodyRegionId } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { MedicalBodyMap } from '@/ui-ng/applications/player/components/MedicalBodyMap'
import { MedicalDetailInspector } from '@/ui-ng/applications/player/components/MedicalDetailInspector'
import {
  PlayerMedicalDecisionHero,
  PlayerMedicalDecisionPanel,
  PlayerRivalMedicalBoundary,
} from '@/ui-ng/applications/player/components/PlayerMedicalDecisions'
import {
  InjuryPatternPanel,
  LoadManagementPanel,
  MedicalHistoryPanel,
  PhysicalReadinessPanel,
  RecoveryTimelinePanel,
  StaffNotesPanel,
} from '@/ui-ng/applications/player/components/MedicalBoardPanels'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findMedicalInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

type MedicalCanvasTab = 'body' | 'load' | 'history'
const MEDICAL_CANVAS_TABS: readonly MedicalCanvasTab[] = ['body', 'load', 'history']

/**
 * Courtside MEDICAL V3: an anatomical centre with progressive disclosure.
 * The engine and Save remain the only clinical authority. Tab selection changes
 * presentation, not medical treatment or any simulation value.
 */
export function PlayerMedicalView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedEventId, setSelectedEventId } = session.medical
  const [selectedRegionId, setSelectedRegionId] = useState<MedicalBodyRegionId | null>(null)
  const [activeTab, setActiveTab] = useState<MedicalCanvasTab>('body')
  const medical = model?.medical
  const staffNoteGaps = useMemo(
    () => model?.medical.gaps.filter(gap => gap.id === 'staff-notes') ?? [],
    [model?.medical.gaps],
  )
  if (model === null || medical === undefined) return null

  // No private injury, rehabilitation, fatigue or risk data for rivals.
  if (model.knowledgeAccess.kind !== 'own-roster') {
    return <PlayerRivalMedicalBoundary onScouting={() => session.setActiveView('scouting')} />
  }

  const region = selectedRegionId === null ? undefined
    : medical.bodyRegions.find(entry => entry.id === selectedRegionId)
  const riskReason = medical.risk?.primaryReason
  const insight = medical.activeInjury !== null
    ? `${medical.activeInjury.kindLabel} is recorded. Next review: ${medical.activeInjury.reviewDueLabel}.`
    : riskReason !== null && riskReason !== undefined
      ? riskReason
      : 'No active injury recorded. Use the real fatigue and workload data to plan the next session.'

  return <div className="po-med-board po-med-board--v3" data-ng-region="player-medical">
    <PlayerMedicalDecisionHero medical={medical} playerId={model.identity.playerId} />

    <aside className="po-med-v3__left" aria-label="Medical snapshot">
      <section className="po-med-v3__snapshot">
        <div className="po-med-v3__section-title">MEDICAL SNAPSHOT</div>
        <div className="po-med-v3__snapshot-primary">
          <span className={medical.activeInjury === null ? 'is-good' : 'is-warning'} aria-hidden="true">
            {medical.activeInjury === null ? '✓' : '!'}
          </span>
          <div>
            <small>PLAYER STATUS</small>
            <strong>{medical.activeInjury === null ? 'CLEARED FOR PLAY' : 'INJURY ON RECORD'}</strong>
            <span>{medical.activeInjury?.severityLabel ?? 'No active injury recorded'}</span>
          </div>
        </div>
        <div className="po-med-v3__snapshot-facts">
          <div><small>ALERT LEVEL</small><b>{medical.activeInjury !== null ? 'ACTIVE INJURY' : medical.risk?.riskBandLabel ?? 'NOT ASSESSED'}</b></div>
          <div><small>LATEST ASSESSMENT</small><b>{medical.activeInjury?.injuredOnLabel ?? 'NO INJURY RECORD'}</b></div>
        </div>
      </section>
      <PhysicalReadinessPanel meters={medical.readiness.filter(meter => meter.id !== 'injury-risk')} />
      <section className="po-med-v3__recovery">
        {medical.activeInjury === null
          ? <>
            <div className="po-med-v3__section-title">RECOVERY</div>
            <div className="po-med-v3__recovery-clear">
              <span aria-hidden="true">✓</span>
              <div><strong>NO ACTIVE RECOVERY</strong><small>No injury rehabilitation is currently recorded.</small></div>
            </div>
          </>
          : <RecoveryTimelinePanel milestones={medical.recoveryMilestones} />}
      </section>
    </aside>

    <section className="po-med-v3__center" aria-label="Medical exploration">
      <header className="po-med-v3__canvas-head">
        <div><strong>MEDICAL PROFILE</strong><small>Body · workload · injury records</small></div>
        <div className="po-med-v3__tabs" role="tablist" aria-label="Medical profile views">
          {MEDICAL_CANVAS_TABS.map(tab =>
            <button key={tab} role="tab" type="button"
              id={`po-med-tab-${tab}`}
              aria-controls={`po-med-panel-${tab}`}
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}>{tab.toUpperCase()}</button>,
          )}
        </div>
      </header>
      <div className="po-med-v3__canvas" id={`po-med-panel-${activeTab}`}
        role="tabpanel" aria-labelledby={`po-med-tab-${activeTab}`}>
        {activeTab === 'body' && <div className="po-med-v3__body">
          <div className="po-med-v3__body-status">
            <span className={medical.bodyRegions.some(r => r.status === 'attention') ? 'is-warning' : 'is-good'}>●</span>
            {medical.bodyRegions.some(r => r.status === 'attention') ? 'RECORDED INJURY REGIONS' : 'NO RECORDED REGIONAL INJURY'}
          </div>
          <MedicalBodyMap onSelectRegion={setSelectedRegionId}
            selectedRegionId={selectedRegionId} regions={medical.bodyRegions} />
          {region !== undefined && <div className="po-med-v3__region-detail"
            data-ng-region="medical-selected-region" aria-live="polite">
            <div><small>SELECTED REGION</small><strong>{region.label}</strong></div>
            <div><small>RECORDED STATUS</small><strong className={region.status === 'attention' ? 'is-warning' : ''}>{region.statusLabel}</strong></div>
            <p>{region.detail}</p>
            <button type="button" aria-label="Clear selected body region"
              onClick={() => setSelectedRegionId(null)}>×</button>
          </div>}
        </div>}
        {activeTab === 'load' && <div className="po-med-v3__load">
          <LoadManagementPanel note={medical.loadNote} windows={medical.loadWindows} />
        </div>}
        {activeTab === 'history' && <div className="po-med-v3__history">
          <MedicalHistoryPanel emptyMessage={medical.historyEmptyMessage}
            onSelectRow={id => setSelectedEventId(id as never)}
            rows={medical.history}
            selectedEventId={selectedEventId}
            selectedDetail={findMedicalInspectorDetail(medical, selectedEventId)} />
          <details className="po-med-v3__history-extras">
            <summary>INJURY PATTERNS & DATA COVERAGE</summary>
            <InjuryPatternPanel pattern={medical.injuryPattern} />
            <StaffNotesPanel gaps={staffNoteGaps} />
          </details>
        </div>}
      </div>
    </section>

    <aside className="po-med-v3__right" aria-label="Manager decisions and insights">
      <PlayerMedicalDecisionPanel medical={medical} playerId={model.identity.playerId} />
      <section className="po-med-v3__intelligence">
        <div className="po-med-v3__section-title">MEDICAL INTELLIGENCE</div>
        <small>{medical.activeInjury !== null ? 'RECORDED INJURY' : 'ENGINE ASSESSMENT'}</small>
        <p>{insight}</p>
        <span>{medical.activeInjury !== null
          ? 'Rehabilitation and fitness clearance are managed in Medical.'
          : 'Interpretation of existing data, not an unrecorded staff opinion.'}</span>
      </section>
      <section className="po-med-v3__recent">
        <div className="po-med-v3__section-title">MEDICAL HISTORY <span>{medical.history.length} RECORDS</span></div>
        {latest === undefined
          ? <p>NO SIGNIFICANT INJURIES RECORDED</p>
          : <div><strong>{latest.injuryLabel}</strong><small>{latest.injuredOnLabel} · {latest.statusLabel}</small></div>}
        <button type="button" onClick={() => setActiveTab('history')}>VIEW HISTORY ↗</button>
      </section>
    </aside>

  </div>
}

/** Legacy export retained for consumers outside the PLAYER workspace. */
export function MedicalInspectorContent() {
  const { model, session } = usePlayerWorkspace()
  const { selectedEventId } = session.medical
  const detail = useMemo(() => {
    if (model === null || model.knowledgeAccess.kind !== 'own-roster') return undefined
    return findMedicalInspectorDetail(model.medical, selectedEventId)
  }, [model, selectedEventId])
  return <MedicalDetailInspector detail={detail} />
}
