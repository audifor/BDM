import type { MedicalAvailabilityBandModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

export function MedicalAvailabilityBand({ band }: { readonly band: MedicalAvailabilityBandModel }) {
  return (
    <section className="pm-status" data-ng-region="medical-availability-band">
      <div className="pm-status__primary">
        <div className="pm-status__context">
          <span className={`pm-status__pill pm-status__pill--${band.statusTone}`}>{band.statusLabel}</span>
          {band.limitationLabel !== null && (
            <span className="pm-status__limitation">{band.limitationLabel}</span>
          )}
        </div>
        {band.summary !== null && <span className="pm-status__summary">{band.summary}</span>}
      </div>
      <div className="pm-status__meta-row">
        <span>As of · {band.currentDateLabel}</span>
        <span>Match availability derived from active injury only</span>
      </div>
    </section>
  )
}
