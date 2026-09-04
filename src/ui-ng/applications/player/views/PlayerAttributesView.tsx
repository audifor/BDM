import { useMemo } from 'react'

import type { CanonicalRatingKey } from '@/domain/player'

import { RatingAttributeRow, categoryProfileLabel } from '@/ui-ng/applications/player/components/RatingAttributeRow'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export function PlayerAttributesView() {
  const { model, session } = usePlayerWorkspace()
  if (model === null) return null

  const { attributesCategory, setAttributesCategory, selectedRatingId, setSelectedRatingId } = session
  const categoryModel = useMemo(
    () => model.attributes.categories.find((entry) => entry.category === attributesCategory),
    [attributesCategory, model.attributes.categories],
  )

  const activeRatingId = useMemo((): CanonicalRatingKey | null => {
    if (categoryModel === undefined) return null
    if (
      selectedRatingId !== null &&
      categoryModel.all.some((rating) => rating.id === selectedRatingId)
    ) {
      return selectedRatingId
    }
    return categoryModel.all[0]?.id ?? null
  }, [categoryModel, selectedRatingId])

  if (categoryModel === undefined || activeRatingId === null) {
    return (
      <div className="po-attributes po-attributes--empty">
        <p className="po-lane-empty">No attribute categories available for this player.</p>
      </div>
    )
  }

  return (
    <div className="po-attributes" data-ng-region="player-attributes">
      <nav aria-label="Attribute categories" className="po-attributes__rail">
        <span className="po-attributes__rail-title">Category Profiles</span>
        {model.attributes.categories.map((entry) => (
          <button
            aria-current={entry.category === attributesCategory ? 'true' : undefined}
            className={`po-attributes__category${entry.category === attributesCategory ? ' is-active' : ''}`}
            key={entry.category}
            onClick={() => {
              setAttributesCategory(entry.category)
              setSelectedRatingId(entry.all[0]?.id ?? null)
            }}
            type="button"
          >
            <span className="po-attributes__category-label">{entry.label}</span>
            <span className="po-attributes__category-value ng-type-numeric">{entry.profileValue}</span>
            <span className="po-attributes__category-track" aria-hidden>
              <span
                className="po-attributes__category-fill"
                style={{ width: `${entry.profileValue}%` }}
              />
            </span>
          </button>
        ))}
      </nav>

      <section className="po-attributes__detail">
        <header className="po-attributes__detail-head">
          <div>
            <span className="po-attributes__detail-kicker">{categoryProfileLabel(categoryModel.category)}</span>
            <h2 className="po-attributes__detail-title">{categoryModel.label}</h2>
          </div>
          <div className="po-attributes__profile-summary">
            <span className="po-attributes__profile-value ng-type-numeric">{categoryModel.profileValue}</span>
            <span className="po-attributes__profile-note">Category mean · not overall</span>
          </div>
        </header>

        {categoryModel.primary.length > 0 && (
          <div className="po-attributes__group">
            <span className="po-attributes__group-title">Primary ratings</span>
            <div className="po-attributes__rating-list" role="list">
              {categoryModel.primary.map((rating) => (
                <RatingAttributeRow
                  id={rating.id}
                  key={rating.id}
                  label={rating.label}
                  onSelect={setSelectedRatingId}
                  selected={activeRatingId === rating.id}
                  value={rating.value}
                />
              ))}
            </div>
          </div>
        )}

        {categoryModel.secondary.length > 0 && (
          <div className="po-attributes__group">
            <span className="po-attributes__group-title">Secondary ratings</span>
            <div className="po-attributes__rating-list po-attributes__rating-list--secondary" role="list">
              {categoryModel.secondary.map((rating) => (
                <RatingAttributeRow
                  id={rating.id}
                  key={rating.id}
                  label={rating.label}
                  onSelect={setSelectedRatingId}
                  selected={activeRatingId === rating.id}
                  value={rating.value}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
