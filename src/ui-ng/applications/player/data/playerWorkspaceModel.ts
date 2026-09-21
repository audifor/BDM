import type { PlayerId, TeamId } from '@/domain/ids'
import type { PlayerTruthRatingKey } from '@/domain/player'
import type { Player } from '@/domain/player'
import type { Person } from '@/domain/person'
import type { GameDate } from '@/domain/date'

import type { PlayerPerformanceModel } from './buildPlayerPerformanceModel'
import type { PlayerContractModel } from './buildPlayerContractModel'
import type { PlayerMedicalModel, MedicalRiskOverviewTone } from './buildPlayerMedicalModel'
import type { PlayerWorkspaceViewId } from '@/ui-ng/applications/player/playerStructuralData'
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
  readonly teamId: PresentationField<TeamId>
  readonly teamShort: PresentationField<string>
  readonly competitionLabel: PresentationField<string>
  readonly seasonLabel: PresentationField<string>
  readonly primaryPosition: string
  readonly secondaryPositions: readonly string[]
  readonly age: PresentationField<number>
  readonly nationality: PresentationField<string>
  readonly nationalityCode: PresentationField<string>
  readonly dateOfBirth: PresentationField<string>
  readonly height: PresentationField<string>
  readonly weight: PresentationField<string>
  readonly wingspan: PresentationField<string>
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
  readonly id: PlayerTruthRatingKey
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
  readonly valuation: string | null
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
  /** Every canonical rating of the family, in catalog order. Nothing splits it for presentation. */
  readonly all: readonly PlayerRatingRow[]
  /** Factual reading of the family, built from its own ratings rather than authored copy. */
  readonly note: string
}

/** One reconstructed value of a single attribute, oldest first, closed by the current season. */
export interface RatingEvolutionPointModel {
  readonly id: string
  readonly label: string
  readonly value: number
  /** Movement from the previous point; always 0 for the first (oldest) point. */
  readonly delta: number
  readonly isCurrent: boolean
}

export interface AttributeLeagueBaselineModel {
  readonly status: PresentationAvailability
  readonly average: number | null
  readonly sampleSize: number
  readonly scopeLabel: string | null
  readonly note: string
}

export interface AttributeTeamBaselineModel {
  readonly status: PresentationAvailability
  readonly average: number | null
  readonly sampleSize: number
  readonly scopeLabel: string | null
  readonly note: string
}

/** Where the attribute stands against the competition and against the player's own position. */
export interface AttributeStandingModel {
  readonly status: PresentationAvailability
  /** Share of the competition sample this value beats, 0-100. Null when there is no sample. */
  readonly percentile: number | null
  readonly positionAverage: number | null
  readonly positionLabel: string
  readonly positionSampleSize: number
  readonly note: string
}

/** A rating the profile leans on, or one it is held back by, with its standing. */
export interface AttributeHighlightModel {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly value: number
  readonly percentile: number | null
}

export interface AttributeTrainingOptionModel {
  /** Assignable module id: a built-in catalog definition id, or a user-created module id. */
  readonly id: string
  /** Base catalog definition the module executes as. */
  readonly definitionId: string
  readonly name: string
  readonly categoryLabel: string
  readonly scopeLabel: string
  readonly defaultIntensity: string
  readonly developmentWeight: number
  readonly fatigueMultiplier: number
  readonly durationMinutes: number
  /** True for modules the user created on top of the catalog. */
  readonly isUserModule: boolean
  /** Team-scoped modules develop the attribute but cannot be scheduled as individual training. */
  readonly individualAssignable: boolean
}

/** The player's next pending individual training session, as already scheduled in the world. */
export interface AttributeNextSessionModel {
  readonly sessionId: string
  readonly definitionId: string
  /** Module the session was scheduled from; null for sessions created without one. */
  readonly moduleId: string | null
  readonly label: string
  readonly date: GameDate
  readonly startTime: string
  readonly intensity: string
}

/**
 * Where a quick assignment from this view would land.
 *
 * `sessionId` is deterministic per player and date, so assigning again for the same date replaces
 * the pending session instead of colliding with it.
 */
export interface AttributeTrainingAssignmentModel {
  readonly status: PresentationAvailability
  readonly reason: string | null
  readonly date: GameDate | null
  readonly startTime: string | null
  readonly sessionId: string | null
  readonly nextSession: AttributeNextSessionModel | null
}

export interface RatingEvolutionModel {
  readonly ratingId: PlayerTruthRatingKey
  readonly current: number
  readonly points: readonly RatingEvolutionPointModel[]
  readonly changeSinceFirst: number
  readonly hasRecordedHistory: boolean
  readonly note: string
  /** Season training stimulus already accumulated for this attribute; it is a property of the
   *  attribute, not of any single training option. */
  readonly accumulatedStimulus: number | null
  readonly league: AttributeLeagueBaselineModel
  readonly team: AttributeTeamBaselineModel
  readonly standing: AttributeStandingModel
  readonly trainings: readonly AttributeTrainingOptionModel[]
  /** Per-player, not per-rating: the same value is shared by every attribute of the player. */
  readonly assignment: AttributeTrainingAssignmentModel
}

export interface PlayerAttributesModel {
  readonly categories: readonly AttributeCategoryModel[]
  readonly allRatings: readonly PlayerRatingRow[]
  readonly evolutionByRating: Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>
  /** Ratings the profile is built on: the best standing in the competition sample. */
  readonly signatureSkills: readonly AttributeHighlightModel[]
  /** Ratings that trail the competition sample the most. */
  readonly weakLinks: readonly AttributeHighlightModel[]
  readonly gaps: readonly OverviewGapModel[]
}

/** Top attribute shown as a chip on the identity module. */
export interface OverviewChipModel {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly value: number
}

/**
 * A reading the page design calls for that the engine cannot support yet. It is declared with its
 * reason so the page states the gap instead of showing an invented number.
 */
export interface OverviewGapModel {
  readonly id: string
  readonly label: string
  readonly reason: string
}

export interface OverviewIdentityModuleModel {
  /** Composed from the position and the strongest rating family: derived, never a stored label. */
  readonly archetypeTitle: string
  readonly roleTitle: string
  readonly chips: readonly OverviewChipModel[]
  readonly description: string
  readonly teamName: PresentationField<string>
  readonly squadRole: PresentationField<string>
  readonly rosterRank: PresentationField<number>
  readonly rosterSize: number
  readonly usage: PresentationField<string>
  readonly gaps: readonly OverviewGapModel[]
}

export interface OverviewStatModel {
  /** Stable id shared with the trend series, so a KPI cell selects its own curve. */
  readonly id: string
  readonly label: string
  readonly value: string
}

/**
 * One stat's per-game series for the season trend chart.
 *
 * A game where the stat has no value (a percentage with no attempts) stores null, so the axis stays
 * aligned with the game list and the missing reading is visible instead of being drawn as zero.
 */
export interface OverviewStatTrendModel {
  readonly id: string
  readonly label: string
  readonly points: readonly (number | null)[]
  /** Season aggregate for the reference line, taken from the same source as the KPI value. */
  readonly average: number | null
  /** Decimals the reading is shown with. */
  readonly digits: number
}

export interface OverviewSeasonSnapshotModel {
  readonly status: PresentationAvailability
  readonly seasonLabel: string | null
  readonly competitionLabel: string | null
  readonly headline: readonly OverviewStatModel[]
  readonly secondary: readonly OverviewStatModel[]
  /** One selectable per-game series per stat, oldest game first. Empty until the player has played. */
  readonly trends: readonly OverviewStatTrendModel[]
  /** Axis labels for every series, one per game. */
  readonly trendLabels: readonly string[]
  readonly trendNote: string
  readonly gamesPlayed: number
  readonly gaps: readonly OverviewGapModel[]
}

export interface OverviewFormGameModel {
  readonly id: string
  readonly opponent: string
  readonly points: number
  readonly minutes: number
  readonly tone: 'positive' | 'average' | 'poor'
  /** Match date, or null when the record has no date. */
  readonly dateLabel: string | null
  /** Bar height as a share of the window's best scoring game, 0-100. */
  readonly height: number
  /** Every tracked figure of that game, for the hover card on the bar. */
  readonly figures: readonly OverviewStatModel[]
}

export interface OverviewRecentFormModel {
  readonly status: PresentationAvailability
  readonly games: readonly OverviewFormGameModel[]
  readonly seasonAveragePoints: number | null
  readonly averageLabel: string
  /** Which slice of the season the bars cover, stated rather than implied. */
  readonly windowLabel: string
  /** Slots the design draws, so the empty future games stay visible. */
  readonly slots: number
}

/** One measured observation about the player's recent production. Never a conclusion without data. */
export interface OverviewObservationModel {
  readonly id: string
  readonly tone: 'positive' | 'neutral' | 'warning'
  readonly label: string
  readonly detail: string
}

export interface OverviewMoverModel {
  readonly label: string
  readonly delta: number
}

/** One rating's season-by-season curve, reconstructed from the recorded rating deltas. */
export interface OverviewRatingSeriesModel {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly points: readonly number[]
  readonly delta: number
}

export interface OverviewDevelopmentPulseModel {
  readonly trendLabel: string
  readonly ageLabel: string
  readonly stageLabel: string
  readonly stageNote: string
  /** Scouting range, or the honest gap. Hidden ceilings are never presented as values. */
  readonly potentialStatus: PresentationAvailability
  readonly potentialLabel: string
  readonly potentialNote: string
  readonly trainingLabel: PresentationField<string>
  readonly series: readonly OverviewRatingSeriesModel[]
  /** Season labels the curves are sampled at, oldest first. */
  readonly seasonLabels: readonly string[]
  readonly seriesNote: string
  readonly movers: readonly OverviewMoverModel[]
  readonly moversNote: string
}

export interface OverviewContractPulseModel {
  readonly status: PresentationAvailability
  readonly teamName: string | null
  readonly salaryLabel: string | null
  readonly remainingLabel: string | null
  readonly endDateLabel: string | null
  /** Calendar days until the contract expires, from the raw term rather than a display label. */
  readonly daysToExpiry: number | null
  /** Why there is no active contract, when that is the case. Never a silent blank. */
  readonly message: string | null
}

export interface OverviewMedicalPulseModel {
  readonly availabilityLabel: string
  readonly fatigueLabel: string
  readonly riskLabel: string
  /** Set when something active overrides the normal readiness reading. */
  readonly priorityLabel: string | null
  readonly priorityDetail: string | null
}

/** A decision the row can hand over to, or the honest absence of one. */
export interface OverviewAlertActionModel {
  readonly label: string
  readonly view: PlayerWorkspaceViewId
}

export interface OverviewAlertModel {
  readonly id: string
  readonly severity: 'critical' | 'warning' | 'info'
  /** Which department owns the decision: availability, contract, workload, morale or development. */
  readonly tag: string
  readonly label: string
  readonly detail: string
  /** Date the alert refers to: the trigger date when there is one, otherwise today. */
  readonly dateLabel: string
  readonly action: OverviewAlertActionModel | null
}

export interface OverviewTimelineNodeModel {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly dateLabel: string | null
  /** Where the node sits relative to today, for the highlighted track. */
  readonly state: 'past' | 'current' | 'future'
}

export interface PlayerOverviewModel {
  readonly identityModule: OverviewIdentityModuleModel
  readonly season: OverviewSeasonSnapshotModel
  readonly recentForm: OverviewRecentFormModel
  readonly observations: readonly OverviewObservationModel[]
  readonly observationsNote: string
  readonly developmentPulse: OverviewDevelopmentPulseModel
  readonly contractPulse: OverviewContractPulseModel
  readonly medicalPulse: OverviewMedicalPulseModel
  readonly alerts: readonly OverviewAlertModel[]
  readonly timeline: readonly OverviewTimelineNodeModel[]
}

export interface PlayerWorkspaceModel {
  /** Complete canonical runtime records; view-specific projections must not discard fields. */
  readonly player: Player
  readonly person: Person | undefined
  readonly identity: PlayerIdentityModel
  readonly status: PlayerStatusModel
  readonly ratings: readonly PlayerRatingRow[]
  readonly attributes: PlayerAttributesModel
  readonly overview: PlayerOverviewModel
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
