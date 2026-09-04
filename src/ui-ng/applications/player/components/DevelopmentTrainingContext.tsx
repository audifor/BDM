import type { DevelopmentTrainingContextModel } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

export function DevelopmentTrainingContext({
  model,
}: {
  readonly model: DevelopmentTrainingContextModel
}) {
  return (
    <section className="pd-training" data-ng-region="development-training-context">
      <header className="pd-panel-head">
        <span className="pd-panel-head__title">Training context</span>
      </header>
      <p className="pd-panel-note">{model.contextNote}</p>
      <dl className="pd-training__grid">
        <div>
          <dt>Team intensity</dt>
          <dd>{model.teamIntensity ?? '—'}</dd>
        </div>
        <div>
          <dt>Team focus</dt>
          <dd>{model.teamFocus ?? '—'}</dd>
        </div>
        <div>
          <dt>Individual plan</dt>
          <dd>{model.individualPlanActive ? 'Active' : 'Inactive'}</dd>
        </div>
        <div>
          <dt>Individual focus</dt>
          <dd>{model.individualFocus ?? '—'}</dd>
        </div>
        <div>
          <dt>Individual intensity</dt>
          <dd>{model.individualIntensity ?? '—'}</dd>
        </div>
      </dl>
    </section>
  )
}
