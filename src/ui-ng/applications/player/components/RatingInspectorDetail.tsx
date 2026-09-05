import type { CanonicalRatingKey } from '@/domain/player'

import {
  CATEGORY_LABELS,
  rankInCategory,
  relatedRatingsInCategory,
  ratingsForCategory,
} from '@/ui-ng/applications/player/data/ratingCatalog'
import { HoloTechnicalField } from '@/ui-ng/applications/player/components/visual/HoloTechnicalField'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import type { PlayerWorkspaceViewId } from '@/ui-ng/applications/player/playerStructuralData'

function formatOrdinal(rank: number): string {
  const mod100 = rank % 100
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`
  switch (rank % 10) {
    case 1:
      return `${rank}st`
    case 2:
      return `${rank}nd`
    case 3:
      return `${rank}rd`
    default:
      return `${rank}th`
  }
}

export function RatingInspectorDetail({
  ratingId,
  viewId,
}: {
  readonly ratingId: CanonicalRatingKey
  readonly viewId: PlayerWorkspaceViewId
}) {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const catalog = viewId === 'attributes' ? model.attributes.allRatings : model.ratings
  const rating = catalog.find((entry) => entry.id === ratingId)
  if (rating === undefined) return null

  const categoryRatings = ratingsForCategory(rating.category, model.attributes.allRatings)
  const rank = rankInCategory(rating.id, categoryRatings)
  const related = relatedRatingsInCategory(rating.id, categoryRatings, 3)

  return (
    <div className="po-inspector-detail">
      <HoloTechnicalField variant="inspector" />
      <span className="po-inspector-detail__category">{CATEGORY_LABELS[rating.category]}</span>
      <h3 className="po-inspector-detail__title">{rating.label}</h3>

      <div className="po-inspector-detail__hero ng-type-numeric">{rating.value}</div>

      <dl className="po-inspector-detail__stats">
        <div>
          <dt>Category rank</dt>
          <dd>
            {formatOrdinal(rank)} of {categoryRatings.length} in {CATEGORY_LABELS[rating.category]}
          </dd>
        </div>
      </dl>

      {related.length > 0 && (
        <>
          <div className="ng-separator-h" />
          <span className="po-inspector-detail__section">Related ratings</span>
          <div className="po-inspector-detail__related">
            {related.map((item) => (
              <div className="po-inspector-detail__related-row" key={item.id}>
                <span>{item.label}</span>
                <span className="ng-type-numeric">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
