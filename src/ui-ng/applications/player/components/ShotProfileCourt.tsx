import { RoleProfile } from '@/ui-ng/applications/player/components/RoleProfile'
import { AttributeRadar, BasketballHalfCourt } from '@/ui-ng/applications/player/components/visual/BasketballVisuals'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export function ShotProfileCourt() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  const { shotProfile } = model

  return (
    <section className="po-shot-profile">
      <header className="po-deck-head">
        <span className="po-lane-title">Shot Profile</span>
        <span className="po-lane-meta">
          {shotProfile.status === 'available' ? 'Frequency by zone' : 'Not tracked'}
        </span>
      </header>
      <div className="po-shot-profile__body">
        <div className="po-shot-profile__court-wrap">
          <BasketballHalfCourt className="po-shot-profile__court" zones={[]} />
        </div>
        {shotProfile.status === 'unavailable' ? (
          <p className="po-lane-empty po-shot-profile__empty">{shotProfile.message ?? 'Not available'}</p>
        ) : null}
      </div>
    </section>
  )
}

export function AttributeProfilePanel({
  selectedCategory,
  onCategorySelect,
}: {
  readonly selectedCategory: RatingCategory | null
  readonly onCategorySelect: (category: RatingCategory) => void
}) {
  const { model } = usePlayerWorkspace()
  if (model === null) return null

  return (
    <section className="po-profile-panel">
      <header className="po-profile-panel__head">
        <span className="po-lane-title">Attribute Profile</span>
      </header>
      <div className="po-profile-panel__body">
        <div className="po-profile-panel__radar-wrap">
          <AttributeRadar
            axes={model.radarAxes}
            onCategorySelect={onCategorySelect}
            selectedCategory={selectedCategory}
          />
        </div>
        <RoleProfile />
      </div>
    </section>
  )
}
