import { CATEGORY_LABELS } from '@/ui-ng/applications/player/data/ratingCatalog'
import { UNAVAILABLE_LABEL } from '@/ui-ng/applications/player/playerStructuralData'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export function RatingInspectorDetail({ ratingId }: { readonly ratingId: string }) {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const rating = model.ratings.find((entry) => entry.id === ratingId)
  if (rating === undefined) return null

  const related = model.ratings
    .filter((entry) => entry.category === rating.category && entry.id !== rating.id)
    .slice(0, 3)

  return (
    <div className="po-inspector-detail">
      <span className="po-inspector-detail__category">{CATEGORY_LABELS[rating.category]}</span>
      <h3 className="po-inspector-detail__title">{rating.label}</h3>

      <div className="po-inspector-detail__hero ng-type-numeric">{rating.value}</div>

      <dl className="po-inspector-detail__stats">
        <div><dt>Team percentile</dt><dd>{UNAVAILABLE_LABEL}</dd></div>
        <div><dt>League percentile</dt><dd>{UNAVAILABLE_LABEL}</dd></div>
        <div><dt>Trend</dt><dd>{UNAVAILABLE_LABEL}</dd></div>
      </dl>

      <div className="ng-separator-h" />

      <span className="po-inspector-detail__section">Related ratings</span>
      <div className="po-inspector-detail__related">
        {related.length === 0 ? (
          <div className="po-inspector-detail__related-row">
            <span>No related ratings in this category.</span>
          </div>
        ) : (
          related.map((item) => (
            <div className="po-inspector-detail__related-row" key={item.id}>
              <span>{item.label}</span>
              <span className="ng-type-numeric">{item.value}</span>
            </div>
          ))
        )}
      </div>

      <p className="po-inspector-detail__note">
        Canonical player ratings from the current game state. Percentiles and seasonal trends are not yet connected.
      </p>
    </div>
  )
}
