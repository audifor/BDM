import type { MedicalActiveInjuryModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { formatDurationLabel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { MedicalHoloBody } from '@/ui-ng/applications/player/components/MedicalHoloBody'

export function MedicalActiveInjuryDossier({
  injury,
}: {
  readonly injury: MedicalActiveInjuryModel
}) {
  return (
    <section className="pm-injury" data-ng-region="medical-active-injury">
      <header className="pm-panel-head">
        <span className="pm-panel-head__title">Active injury</span>
        <span className="pm-panel-head__meta">{injury.severityLabel}</span>
      </header>
      <div className="pm-injury__body">
        <h3 className="pm-injury__title">{injury.kindLabel}</h3>
        <dl className="pm-injury__grid">
          <div>
            <dt>Injured</dt>
            <dd>{injury.injuredOnLabel}</dd>
          </div>
          <div>
            <dt>Expected return</dt>
            <dd>{injury.expectedReturnLabel}</dd>
          </div>
          <div>
            <dt>Days remaining</dt>
            <dd className="ng-type-numeric">{formatDurationLabel(injury.daysRemaining)}</dd>
          </div>
          <div>
            <dt>Expected duration</dt>
            <dd className="ng-type-numeric">{formatDurationLabel(injury.expectedDurationDays)}</dd>
          </div>
        </dl>
        {injury.sourceContext !== null && (
          <p className="pm-injury__source">{injury.sourceContext}</p>
        )}
      </div>
    </section>
  )
}

export function MedicalNoInjuryNotice() {
  return (
    <section className="pm-injury pm-injury--clear" data-ng-region="medical-no-injury">
      <header className="pm-panel-head">
        <span className="pm-panel-head__title">Active injury</span>
      </header>
      <div className="pm-injury__clear-body">
        <p className="pm-injury__empty">No active injury</p>
        <MedicalHoloBody className="pm-injury__holo-body" />
      </div>
    </section>
  )
}
