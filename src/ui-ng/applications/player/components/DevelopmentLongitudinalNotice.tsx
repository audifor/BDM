import type { DevelopmentLongitudinalModel } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

export function DevelopmentLongitudinalNotice({
  model,
}: {
  readonly model: DevelopmentLongitudinalModel
}) {
  return (
    <section className="pd-longitudinal" data-ng-region="development-longitudinal">
      <header className="pd-panel-head">
        <span className="pd-panel-head__title">{model.headline}</span>
      </header>
      <p className="pd-longitudinal__message">{model.message}</p>
      <p className="pd-panel-note">
        Rating deltas, improvement timelines and projected growth are omitted because BDM does not persist rating
        history today.
      </p>
    </section>
  )
}
