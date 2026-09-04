import type { MedicalInspectorInjuryDetail } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

export function MedicalDetailInspector({
  detail,
}: {
  readonly detail: MedicalInspectorInjuryDetail | undefined
}) {
  if (detail === undefined) {
    return (
      <div className="pm-inspector pm-inspector--empty" data-ng-region="medical-inspector">
        <p className="pm-inspector__hint">Select a medical event to inspect injury context.</p>
      </div>
    )
  }

  return (
    <div className="pm-inspector" data-ng-region="medical-inspector">
      <header className="pm-inspector__head">
        <span className="pm-inspector__title">{detail.injuryLabel}</span>
        <span className="pm-inspector__meta">{detail.severityLabel} · {detail.statusLabel}</span>
      </header>
      <div className="pm-inspector__grid">
        <div className="pm-inspector__cell">
          <span className="pm-stat-label pm-stat-label--primary">Injured</span>
          <span className="pm-stat-value pm-stat-value--secondary">{detail.injuredOnLabel}</span>
        </div>
        <div className="pm-inspector__cell">
          <span className="pm-stat-label pm-stat-label--primary">Expected return</span>
          <span className="pm-stat-value pm-stat-value--secondary">{detail.expectedReturnLabel}</span>
        </div>
        <div className="pm-inspector__cell">
          <span className="pm-stat-label pm-stat-label--primary">Duration</span>
          <span className="pm-stat-value pm-stat-value--secondary ng-type-numeric">{detail.durationLabel}</span>
        </div>
      </div>
      {detail.daysRemainingLabel !== null && (
        <div className="pm-inspector__footer">
          <span className="pm-stat-label pm-stat-label--secondary">Days remaining</span>
          <span className="pm-stat-value pm-stat-value--primary ng-type-numeric">{detail.daysRemainingLabel}</span>
        </div>
      )}
      <p className="pm-inspector__impact">{detail.availabilityImpact}</p>
    </div>
  )
}
