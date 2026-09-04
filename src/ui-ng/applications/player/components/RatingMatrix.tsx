import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { CATEGORY_LABELS, ratingTone } from '@/ui-ng/applications/player/data/ratingCatalog'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export interface RatingMatrixProps {
  readonly selectedId: string
  readonly categoryFilter: RatingCategory | null
  readonly onSelect: (id: string) => void
}

export function RatingMatrix({ selectedId, categoryFilter, onSelect }: RatingMatrixProps) {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const ratings =
    categoryFilter === null
      ? model.ratings
      : model.ratings.filter((rating) => rating.category === categoryFilter)

  return (
    <div className="po-ratings">
      <div className="po-ratings__matrix">
        <div className="po-ratings__header">
          <span>
            {categoryFilter === null ? 'All Skills' : CATEGORY_LABELS[categoryFilter]}
          </span>
          <span>Rating</span>
          <span>Level</span>
        </div>
        {ratings.length === 0 ? (
          <div className="po-ratings__empty">No skills in this category.</div>
        ) : (
          ratings.map((rating) => (
            <button
              className={`po-rating-row po-rating-row--${ratingTone(rating.value)}${selectedId === rating.id ? ' is-selected' : ''}`}
              key={rating.id}
              onClick={() => onSelect(rating.id)}
              type="button"
            >
              <span className="po-rating-row__label">{rating.label}</span>
              <span className="po-rating-row__value ng-type-numeric">{rating.value}</span>
              <span className="po-rating-row__meter">
                <span className="po-rating-row__meter-fill" style={{ width: `${rating.value}%` }} />
              </span>
            </button>
          ))
        )}
      </div>

      {categoryFilter === null && (
        <div className="po-eval-lists">
          <EvaluationList items={model.strengths} title="Strengths" />
          <EvaluationList items={model.limitations} title="Limitations" />
        </div>
      )}
    </div>
  )
}

function EvaluationList({
  title,
  items,
}: {
  readonly title: string
  readonly items: readonly { readonly id: string; readonly label: string; readonly level: number; readonly kind: 'strength' | 'limitation' }[]
}) {
  return (
    <div className={`po-eval po-eval--${items[0]?.kind ?? 'strength'}`}>
      <span className="po-eval__title">{title}</span>
      {items.map((item) => (
        <div className="po-eval__item" key={item.id}>
          <span className="po-eval__marker" />
          <span className="po-eval__label">{item.label}</span>
          <span className="po-eval__level ng-type-numeric">{item.level}</span>
        </div>
      ))}
    </div>
  )
}
