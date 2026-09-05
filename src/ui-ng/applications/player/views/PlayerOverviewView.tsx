import { PerformanceStrip, FormTimeline } from '@/ui-ng/applications/player/components/PerformanceLanes'
import { RatingMatrix } from '@/ui-ng/applications/player/components/RatingMatrix'
import { AttributeProfilePanel, ShotProfileCourt } from '@/ui-ng/applications/player/components/ShotProfileCourt'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

export function PlayerOverviewView() {
  const { model, session } = usePlayerWorkspace()
  if (model === null) return null

  const {
    selectedCategory,
    setSelectedCategory,
    selectedRatingId,
    setSelectedRatingId,
  } = session

  const activeRatingId =
    selectedRatingId !== null && model.ratings.some((rating) => rating.id === selectedRatingId)
      ? selectedRatingId
      : model.ratings[0]?.id ?? null

  if (activeRatingId === null) return null

  const handleCategorySelect = (category: RatingCategory) => {
    const nextCategory = selectedCategory === category ? null : category
    setSelectedCategory(nextCategory)

    if (nextCategory === null) {
      return
    }

    const firstInCategory = model.ratings.find((rating) => rating.category === nextCategory)
    if (firstInCategory !== undefined) {
      setSelectedRatingId(firstInCategory.id)
    }
  }

  const handleRatingSelect = (id: typeof activeRatingId) => {
    if (id === activeRatingId && selectedCategory !== null) {
      setSelectedCategory(null)
      return
    }

    setSelectedRatingId(id)
    const rating = model.ratings.find((entry) => entry.id === id)
    if (rating !== undefined) {
      setSelectedCategory(rating.category)
    }
  }

  return (
    <div className="po-overview" data-ng-region="player-overview">
      <div className="po-overview__core">
        <AttributeProfilePanel
          onCategorySelect={handleCategorySelect}
          selectedCategory={selectedCategory}
        />
        <RatingMatrix
          categoryFilter={selectedCategory}
          onSelect={handleRatingSelect}
          selectedId={activeRatingId}
        />
      </div>
      <div className="po-performance-deck" data-ng-region="performance-deck">
        <PerformanceStrip />
        <FormTimeline />
        <ShotProfileCourt />
      </div>
    </div>
  )
}
