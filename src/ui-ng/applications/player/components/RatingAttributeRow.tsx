import type { PlayerTruthRatingKey } from '@/domain/player'

import { ordinalPercentile, ratingTone } from '@/ui-ng/applications/player/data/ratingCatalog'

export interface RatingAttributeRowProps {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly value: number
  /** Movement recorded for this attribute since the first tracked season, 0 when unknown. */
  readonly change: number
  /** Share of the competition this value beats, null when there is no sample. */
  readonly percentile: number | null
  readonly selected?: boolean
  readonly onSelect: (id: PlayerTruthRatingKey) => void
}

export function RatingAttributeRow({
  id,
  label,
  value,
  change,
  percentile,
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
      <span className="po-attr-rating__value ng-type-numeric">{value}</span>
      <span aria-hidden className="po-attr-rating__scale">
        <span className="po-attr-rating__scale-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="po-attr-rating__marker" data-tone={tone} />
      <span
        className={`po-attr-rating__change ng-type-numeric${change < 0 ? ' is-negative' : change > 0 ? ' is-positive' : ''}`}
      >
        {change === 0 ? '—' : `${change > 0 ? '+' : ''}${change}`}
      </span>
      <span className="po-attr-rating__percentile ng-type-numeric">
        {percentile === null ? '—' : ordinalPercentile(percentile)}
      </span>
    </button>
  )
}

export function RatingToneLegend({ label }: { readonly label: string }) {
  return <span className="po-attr-tone-label">{label}</span>
}
