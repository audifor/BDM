import { useMemo, useState } from 'react'

import type { MedicalBodyRegionId } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { MedicalBodyMap } from '@/ui-ng/applications/player/components/MedicalBodyMap'
import { MedicalDetailInspector } from '@/ui-ng/applications/player/components/MedicalDetailInspector'
import { PlayerMedicalHistoryBoard } from '@/ui-ng/applications/player/components/PlayerMedicalHistoryBoard'
import {
  PlayerMedicalDecisionHero,
  PlayerMedicalDecisionPanel,
  PlayerRivalMedicalBoundary,
} from '@/ui-ng/applications/player/components/PlayerMedicalDecisions'
import {
  LoadManagementPanel,
  PhysicalReadinessPanel,
  RecoveryTimelinePanel,
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
  if (model === null || medical === undefined) return null

  // No private injury, rehabilitation, fatigue or risk data for rivals.
  if (model.knowledgeAccess.kind !== 'own-roster') {
    return <PlayerRivalMedicalBoundary onScouting={() => session.setActiveView('scouting')} />
  }

  const noRecordedLoad = medical.loadWindows.every(window =>
    window.matchMinutes === 0 && window.programmeLoad === 0 &&
    window.matches === 0 && window.sessionCount === 0,
  )
  const region = selectedRegionId === null ? undefined
    : medical.bodyRegions.find(entry => entry.id === selectedRegionId)
  const riskReason = medical.risk?.primaryReason
  // Do not repeat injury dates already visible in the hero and recovery timeline.
  const insight = riskReason ?? (medical.activeInjury === null && medical.fatigue.value >= 50
    ? 'Fatigue is elevated. Review recorded training and match load before the next game.'
    : null)

  return <div className="po-med-board po-med-board--v3" data-ng-region="player-medical"
    onKeyDownCapture={event => {
      if (event.key === 'Escape' && selectedRegionId !== null) {
        setSelectedRegionId(null)
      }
    }}>
    <PlayerMedicalDecisionHero medical={medical} playerId={model.identity.playerId} />

    <aside className="po-med-v3__left" aria-label="Readiness and recorded recovery">
      <PhysicalReadinessPanel meters={medical.readiness.filter(meter =>
        meter.id !== 'injury-risk' && meter.id !== 'recovery')} />
      {medical.activeInjury !== null && <section className="po-med-v3__recovery">
        <RecoveryTimelinePanel milestones={medical.recoveryMilestones} />
      </section>}
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
          <MedicalBodyMap onSelectRegion={id =>
              setSelectedRegionId(previous => previous === id ? null : id)}
            selectedRegionId={selectedRegionId} regions={medical.bodyRegions} />

        </div>}
        {activeTab === 'load' && <div className="po-med-v3__load">
          {noRecordedLoad
            ? <section className="po-med-v3__load-empty" data-ng-region="medical-load">
                <div className="po-med-v3__load-empty-icon" aria-hidden="true">▤</div>
                <strong>NO WORKLOAD LOGGED YET</strong>
                <p>No match minutes or training sessions are recorded in these windows.
                  A chart will appear when real workload is available.</p>
                <div className="po-med-v3__load-windows">
                  {medical.loadWindows.map(window => <div key={window.id}>
                    <b>{window.label}</b><span>{window.matchMinutes} MIN · {window.sessionCount} SESSIONS</span>
                  </div>)}
                </div>
              </section>
            : <LoadManagementPanel note={medical.loadNote} windows={medical.loadWindows} />}
        </div>}
        {activeTab === 'history' && <div className="po-med-v3__history">
          <PlayerMedicalHistoryBoard medical={medical}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId} />
        </div>}
      </div>
    </section>

    <aside className="po-med-v3__right" aria-label="Manager medical decisions">
      <PlayerMedicalDecisionPanel medical={medical} playerId={model.identity.playerId} />
      {activeTab === 'body' && region !== undefined && <section
        className="po-med-v3__region-detail"
        data-ng-region="medical-selected-region"
        aria-label="Selected body region"
        aria-live="polite">
        <header className="po-med-v3__region-detail-head">
          <span>SELECTED REGION</span>
          <button type="button" aria-label="Clear selected body region"
            onClick={() => setSelectedRegionId(null)}>×</button>
        </header>
        <div className="po-med-v3__region-detail-main">
          <strong className="po-med-v3__region-detail-name">{region.label}</strong>
          <div className="po-med-v3__region-detail-status">
            <span className={region.status === 'attention' ? 'is-warning' : 'is-positive'} aria-hidden="true">●</span>
            <span>{region.statusLabel}</span>
          </div>
        </div>
        <p>{region.detail}</p>
      </section>}
      {insight !== null && <section className="po-med-v3__intelligence">
        <div className="po-med-v3__section-title">MEDICAL INTELLIGENCE</div>
        <small>{medical.activeInjury !== null ? 'RECORDED INJURY' : 'ENGINE ASSESSMENT'}</small>
        <p>{insight}</p>
      </section>}
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
