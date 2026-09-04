import type { PlayerId } from '@/domain/ids'
import type { CanonicalRatingKey } from '@/domain/player'

import type { PlayerPerformanceModel } from './buildPlayerPerformanceModel'
import type { PlayerContractModel } from './buildPlayerContractModel'
import type { PlayerMedicalModel, MedicalRiskOverviewTone } from './buildPlayerMedicalModel'
import type { PlayerDevelopmentModel } from './buildPlayerDevelopmentModel'
import type { PlayerHistoryModel } from './buildPlayerHistoryModel'
import type { RatingCategory } from './ratingCatalog'

export type PresentationAvailability = 'available' | 'unavailable'

export interface PresentationField<T> {
  readonly status: PresentationAvailability
  readonly value?: T
  readonly label?: string
}

export interface PlayerIdentityModel {
  readonly playerId: PlayerId
  readonly firstName: string
  readonly lastName: string
  readonly initials: string
  readonly jerseyNumber: PresentationField<number>
  readonly teamName: PresentationField<string>
  readonly teamShort: PresentationField<string>
  readonly competitionLabel: PresentationField<string>
  readonly seasonLabel: PresentationField<string>
  readonly primaryPosition: string
  readonly secondaryPositions: readonly string[]
  readonly age: PresentationField<number>
  readonly nationality: PresentationField<string>
  readonly height: PresentationField<string>
  readonly weight: PresentationField<string>
  readonly portrait: PresentationField<'initials'>
  readonly teamCrest: PresentationField<'initials'>
  readonly teamColors: {
    readonly primary: string
    readonly secondary: string
    readonly muted: string
  }
}

export interface PlayerStatusModel {
  readonly availability: PresentationField<string>
  readonly condition: PresentationField<number>
  readonly fatigue: PresentationField<number>
  readonly morale: PresentationField<string>
  readonly sharpness: PresentationField<number>
  readonly risk: PresentationField<string>
  readonly riskTone: MedicalRiskOverviewTone | null
}

export interface PlayerRatingRow {
  readonly id: CanonicalRatingKey
  readonly label: string
  readonly category: RatingCategory
  readonly value: number
}

export interface EvaluationItem {
  readonly id: string
  readonly label: string
  readonly level: number
  readonly kind: 'strength' | 'limitation'
}

export interface RadarAxisModel {
  readonly key: RatingCategory
  readonly label: string
  readonly value: number
}

export interface SeasonPerformanceModel {
  readonly status: PresentationAvailability
  readonly metaLabel?: string
  readonly primary: readonly { readonly label: string; readonly value: string }[]
  readonly secondary: readonly { readonly label: string; readonly value: string }[]
}

export interface RecentFormGameModel {
  readonly id: string
  readonly label: string
  readonly opponent: string
  readonly points: number
  readonly plusMinus: number
  readonly minutes: number
}

export interface RecentFormModel {
  readonly status: PresentationAvailability
  readonly games: readonly RecentFormGameModel[]
  readonly seasonAveragePoints?: number
}

export interface ShotProfileModel {
  readonly status: PresentationAvailability
  readonly message?: string
}

export interface RoleProfileModel {
  readonly primaryPosition: string
  readonly secondaryPositions: readonly string[]
  readonly derivedHighlights: readonly string[]
  readonly isDerived: true
}

export interface AttributeCategoryModel {
  readonly category: RatingCategory
  readonly label: string
  readonly profileValue: number
  readonly primary: readonly PlayerRatingRow[]
  readonly secondary: readonly PlayerRatingRow[]
  readonly all: readonly PlayerRatingRow[]
}

export interface PlayerAttributesModel {
  readonly categories: readonly AttributeCategoryModel[]
  readonly allRatings: readonly PlayerRatingRow[]
}

export interface PlayerWorkspaceModel {
  readonly identity: PlayerIdentityModel
  readonly status: PlayerStatusModel
  readonly ratings: readonly PlayerRatingRow[]
  readonly attributes: PlayerAttributesModel
  readonly performance: PlayerPerformanceModel
  readonly contract: PlayerContractModel
  readonly medical: PlayerMedicalModel
  readonly development: PlayerDevelopmentModel
  readonly history: PlayerHistoryModel
  readonly strengths: readonly EvaluationItem[]
  readonly limitations: readonly EvaluationItem[]
  readonly radarAxes: readonly RadarAxisModel[]
  readonly roleProfile: RoleProfileModel
  readonly seasonPerformance: SeasonPerformanceModel
  readonly recentForm: RecentFormModel
  readonly shotProfile: ShotProfileModel
}

export interface PlayerWorkspaceEmptyState {
  readonly kind: 'no-world' | 'no-player' | 'player-not-found'
  readonly message: string
}
