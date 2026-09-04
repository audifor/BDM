import type { CanonicalRatingKey } from '@/domain/player'

import { CATEGORY_LABELS, ratingTone } from '@/ui-ng/applications/player/data/ratingCatalog'

export interface RatingAttributeRowProps {
  readonly id: CanonicalRatingKey
  readonly label: string
  readonly value: number
  readonly selected?: boolean
  readonly onSelect: (id: CanonicalRatingKey) => void
}

export function RatingAttributeRow({
  id,
  label,
  value,
  selected = false,
  onSelect,
}: RatingAttributeRowProps) {
  const tone = ratingTone(value)

  return (
    <button
      className={`po-attr-rating po-attr-rating--${tone}${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(id)}
      type="button"
    >
      <span className="po-attr-rating__label">{label}</span>
      <span aria-hidden className="po-attr-rating__scale">
        <span className="po-attr-rating__scale-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="po-attr-rating__marker" data-tone={tone} />
      <span className="po-attr-rating__value ng-type-numeric">{value}</span>
    </button>
  )
}

export function RatingToneLegend({ label }: { readonly label: string }) {
  return <span className="po-attr-tone-label">{label}</span>
}

export function categoryProfileLabel(category: keyof typeof CATEGORY_LABELS): string {
  return `${CATEGORY_LABELS[category]} profile`
}
