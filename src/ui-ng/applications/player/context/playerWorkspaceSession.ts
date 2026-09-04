import type { CanonicalRatingKey } from '@/domain/player'

import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import type { PerformanceSession } from '@/ui-ng/applications/player/context/performanceSession'
import type { ContractSession } from '@/ui-ng/applications/player/context/contractSession'
import type { PlayerWorkspaceViewId } from '@/ui-ng/applications/player/playerStructuralData'

export interface PlayerWorkspaceSession {
  readonly activeView: PlayerWorkspaceViewId
  readonly setActiveView: (view: PlayerWorkspaceViewId) => void
  readonly selectedRatingId: CanonicalRatingKey | null
  readonly setSelectedRatingId: (ratingId: CanonicalRatingKey | null) => void
  readonly selectedCategory: RatingCategory | null
  readonly setSelectedCategory: (category: RatingCategory | null) => void
  readonly attributesCategory: RatingCategory
  readonly setAttributesCategory: (category: RatingCategory) => void
  readonly inspectorCollapsed: boolean
  readonly setInspectorCollapsed: (collapsed: boolean) => void
  readonly performance: PerformanceSession
  readonly contract: ContractSession
}
