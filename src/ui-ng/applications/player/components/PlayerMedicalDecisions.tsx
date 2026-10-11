import type { PlayerId } from '@/domain/ids'
import type { PlayerMedicalModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { navigateToMedicalDecision, syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

export function PlayerMedicalDecisionHero({
  medical, playerId,
}: {
  readonly medical: PlayerMedicalModel
  readonly playerId: PlayerId
}) {
  const injured = medical.activeInjury !== null
  const risk = medical.risk
  const highRisk = risk?.riskBand === 'high' || risk?.riskBand === 'elevated'
  const review = medical.activeInjury?.reviewDueLabel ?? null
  return <header className="po-med-v2__hero" data-ng-region="medical-decision-hero">
    <div className="po-med-v2__hero-status">
      <span>MEDICAL STATUS</span>
      <strong className={injured?'is-warning':'is-positive'}>{injured?'INJURY RECORDED':'AVAILABLE'}</strong>
      <small>{injured?medical.activeInjury!.kindLabel+' · '+medical.activeInjury!.severityLabel:
        'No active injury recorded'}</small>
    </div>
    <div className="po-med-v2__hero-metric">
      <span>CAREER FATIGUE</span>
      <strong className={medical.fatigue.value>=70?'is-warning':''}>{medical.fatigue.value}<small>/100</small></strong>
      <small>{medical.fatigue.loadLabel}</small>
    </div>
    <div className="po-med-v2__hero-metric">
      <span>ENGINE INJURY RISK</span>
      <strong className={highRisk?'is-warning':''}>{risk===null?'—':risk.riskScore}<small>{risk===null?'': ' /100'}</small></strong>
      <small>{risk?.riskBandLabel ?? medical.riskUnavailableLabel ?? 'Not assessed'}</small>
    </div>
    <div className="po-med-v2__hero-metric">
      <span>{injured?'NEXT INJURY REVIEW':'RECOVERY RATE'}</span>
      <strong>{review ?? '-'+medical.fatigue.dailyRecoveryRate}<small>{review?'':' /day'}</small></strong>
      <small>{review?'Recorded review milestone':'Fatigue points per day'}</small>
    </div>
    <button className="po-med-v2__hero-action" type="button"
      onClick={()=>navigateToMedicalDecision(playerId,injured?'injured':'risk')}>
      {injured?'MANAGE INJURY':'REVIEW MEDICAL RISK'} ↗
    </button>
  </header>
}

export function PlayerMedicalDecisionPanel({
  medical, playerId,
}: {
  readonly medical: PlayerMedicalModel
  readonly playerId: PlayerId
}) {
  const injured = medical.activeInjury !== null
  const elevated = medical.risk?.riskBand === 'high' || medical.risk?.riskBand === 'elevated'
  return <section className="po-med-panel po-med-v2__decisions po-med-v3__decisions" data-ng-region="medical-decisions">
    <header className="po-med-panel__head">
      <span className="po-med-panel__title">ACTION ROUTES</span>
      <span className="po-med-panel__meta">{injured ? 'RECOVERY' : 'PREVENTION'}</span>
    </header>
    <div className="po-med-v3__route-summary">
      <span aria-hidden="true">{injured ? '✚' : elevated ? '!' : '✓'}</span>
      <div>
        <small>MANAGER PRIORITY</small>
        <strong>{injured ? 'RECOVERY MANAGEMENT' : elevated ? 'REVIEW PLAYER LOAD' : 'MAINTAIN FITNESS'}</strong>
      </div>
    </div>
    <div className="po-med-v3__routes">
      <button type="button" onClick={() => navigateToMedicalDecision(playerId, injured ? 'injured' : 'risk')}>
        <span aria-hidden="true">01</span>
        <span><strong>{injured ? 'REHAB PLAN' : 'MEDICAL RISK'}</strong>
          <small>{injured ? 'Manage the recorded rehabilitation' : 'Review injury risk and exposure'}</small></span>
        <b aria-hidden="true">↗</b>
      </button>
      <button type="button" onClick={() => syncWorkspaceAppQuery('training', 'push')}>
        <span aria-hidden="true">02</span>
        <span><strong>TRAINING PLAN</strong><small>Adjust real workload in Training</small></span>
        <b aria-hidden="true">↗</b>
      </button>
      {injured && <button type="button" onClick={() => navigateToMedicalDecision(playerId, 'overview')}>
        <span aria-hidden="true">03</span>
        <span><strong>FITNESS TEST / CLEARANCE</strong><small>Consult the club medical department</small></span>
        <b aria-hidden="true">↗</b>
      </button>}
    </div>
    <p className="po-med-v3__route-note">Real actions open Medical or Training. No treatment is changed from this preview.</p>
  </section>
}

export function PlayerRivalMedicalBoundary({ onScouting }: { readonly onScouting:()=>void }) {
  return <section className="po-med-v2__rival" data-ng-region="medical-rival-knowledge">
    <div className="po-med-v2__rival-card">
      <span>MEDICAL INTELLIGENCE</span>
      <strong>HEALTH STATUS UNVERIFIED</strong>
      <p>Private diagnoses, fatigue, physical tests and rehabilitation plans belong to the player's club.
        Your club has no authorized medical examination in this dossier.</p>
      <button type="button" onClick={onScouting}>OPEN SCOUTING REPORT ↗</button>
    </div>
    <div className="po-med-v2__rival-process">
      <strong>HOW TO BUILD A MEDICAL PICTURE</strong>
      <div><span>01</span><p><b>Follow the player</b> through authorized scouting and public performance.</p></div>
      <div><span>02</span><p><b>Review information provenance.</b> Absence of injury news does not prove fitness.</p></div>
      <div><span>03</span><p><b>Request medical checks</b> only if a future, properly authorized transfer process permits them.</p></div>
      <small>Clinical tests and confidential medical documents are not accessible through scouting alone.</small>
    </div>
  </section>
}
