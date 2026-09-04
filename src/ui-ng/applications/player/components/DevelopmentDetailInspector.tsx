import type { DevelopmentInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

export function DevelopmentDetailInspector({
  detail,
}: {
  readonly detail: DevelopmentInspectorDetail | undefined
}) {
  if (detail === undefined) {
    return (
      <div className="pd-inspector pd-inspector--empty" data-ng-region="development-inspector">
        <p className="pd-inspector__hint">Select a stimulus category, rating focus, or scout potential domain.</p>
      </div>
    )
  }

  if (detail.kind === 'stimulus-category') {
    return (
      <div className="pd-inspector" data-ng-region="development-inspector">
        <header className="pd-inspector__head">
          <span className="pd-inspector__title">{detail.categoryLabel}</span>
          <span className="pd-inspector__meta">Season stimulus · category</span>
        </header>
        <div className="pd-inspector__grid">
          <div className="pd-inspector__cell">
            <span className="pd-stat-label pd-stat-label--primary">Stimulus</span>
            <span className="pd-stat-value pd-stat-value--primary ng-type-numeric">
              {detail.stimulusTotal.toFixed(1)}
            </span>
          </div>
          <div className="pd-inspector__cell">
            <span className="pd-stat-label pd-stat-label--primary">Ratings</span>
            <span className="pd-stat-value pd-stat-value--secondary ng-type-numeric">{detail.ratingCount}</span>
          </div>
        </div>
        <p className="pd-inspector__note">{detail.contextNote}</p>
      </div>
    )
  }

  if (detail.kind === 'stimulus-rating') {
    return (
      <div className="pd-inspector" data-ng-region="development-inspector">
        <header className="pd-inspector__head">
          <span className="pd-inspector__title">{detail.ratingLabel}</span>
          <span className="pd-inspector__meta">{detail.categoryLabel}</span>
        </header>
        <div className="pd-inspector__grid">
          <div className="pd-inspector__cell">
            <span className="pd-stat-label pd-stat-label--primary">Stimulus</span>
            <span className="pd-stat-value pd-stat-value--primary ng-type-numeric">{detail.stimulus.toFixed(1)}</span>
          </div>
        </div>
        <p className="pd-inspector__note">{detail.contextNote}</p>
      </div>
    )
  }

  return (
    <div className="pd-inspector" data-ng-region="development-inspector">
      <header className="pd-inspector__head">
        <span className="pd-inspector__title">{detail.domainLabel}</span>
        <span className="pd-inspector__meta">Scout potential</span>
      </header>
      <div className="pd-inspector__grid">
        <div className="pd-inspector__cell">
          <span className="pd-stat-label pd-stat-label--primary">Evaluation</span>
          <span className="pd-stat-value pd-stat-value--secondary">{detail.evaluationLabel}</span>
        </div>
      </div>
      <p className="pd-inspector__note">{detail.contextNote}</p>
    </div>
  )
}
