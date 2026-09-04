import type { DevelopmentContextBandModel } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

export function DevelopmentContextBand({ band }: { readonly band: DevelopmentContextBandModel }) {
  return (
    <section className="pd-status" data-ng-region="development-context-band">
      <div className="pd-status__primary">
        <div className="pd-status__context">
          <span className="pd-status__pill">Age {band.age}</span>
          <span className="pd-status__label">{band.developmentStageLabel}</span>
          {band.seasonLabel !== null && <span className="pd-status__season">{band.seasonLabel}</span>}
        </div>
        <span className="pd-status__trend ng-type-numeric">{band.ageTrendLabel}</span>
      </div>
      <div className="pd-status__meta-row">
        <span>{band.developmentStageNote}</span>
        <span>{band.ageTrendNote}</span>
      </div>
    </section>
  )
}
