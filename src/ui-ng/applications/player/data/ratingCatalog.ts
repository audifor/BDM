import {
  PLAYER_TRUTH_RATING_KEYS,
  type PlayerTruthRatingKey,
  type PlayerTruthRatings,
} from '@/domain/player'

/** NG overview categories aligned with the 80-rating Player Truth families. */
export type RatingCategory =
  | 'shooting'
  | 'finishing'
  | 'ballHandling'
  | 'playmaking'
  | 'offBall'
  | 'defense'
  | 'physical'
  | 'mental'

export const CATEGORY_LABELS: Record<RatingCategory, string> = {
  shooting: 'Shooting',
  finishing: 'Finishing',
  ballHandling: 'Ball Handling',
  playmaking: 'Playmaking',
  offBall: 'Off-Ball',
  defense: 'Defense / Rebounding',
  physical: 'Physical',
  mental: 'Mental',
}

export const RADAR_CATEGORY_ORDER: readonly RatingCategory[] = [
  'shooting',
  'finishing',
  'ballHandling',
  'playmaking',
  'offBall',
  'defense',
  'physical',
  'mental',
]

const RATING_KEYS_BY_CATEGORY: Readonly<Record<RatingCategory, readonly PlayerTruthRatingKey[]>> = {
  shooting: [
    'FREE_THROW',
    'SHORT_MIDRANGE',
    'LONG_MIDRANGE',
    'MIDRANGE_PULLUP',
    'THREE_POINT_STATIC',
    'THREE_POINT_PULLUP',
    'DEEP_SHOOTING',
    'MOVEMENT_SHOOTING',
    'CONTESTED_SHOOTING',
    'SHOT_TOUCH',
  ],
  finishing: [
    'RIM_FINISHING',
    'CONTACT_FINISHING',
    'FINISHING_THROUGH_LENGTH',
    'OFF_HAND_FINISHING',
    'DUNKING',
    'VERTICAL_FINISHING',
    'ACROBATIC_FINISHING',
    'POST_FINISHING',
    'FOUL_DRAWING',
    'CLOSE_TOUCH',
  ],
  ballHandling: [
    'BALL_CONTROL',
    'DRIBBLE_SECURITY',
    'CHANGE_OF_DIRECTION',
    'CHANGE_OF_PACE',
    'DRIVE_CREATION',
    'PRESSURE_HANDLING',
    'OPEN_COURT_HANDLING',
    'DRIBBLE_SEPARATION',
    'BODY_CONTROL_WITH_BALL',
  ],
  playmaking: [
    'PASSING_ACCURACY',
    'PASSING_VISION',
    'PASSING_TIMING',
    'LIVE_DRIBBLE_PASSING',
    'PICK_AND_ROLL_PLAYMAKING',
    'SHORT_ROLL_PLAYMAKING',
    'POST_PLAYMAKING',
    'TRANSITION_PLAYMAKING',
    'ADVANTAGE_CREATION',
    'ADVANTAGE_EXPLOITATION',
  ],
  offBall: [
    'OFF_BALL_MOVEMENT',
    'CUTTING',
    'SCREENING',
    'SCREEN_USAGE',
    'SPACING',
    'OFFENSIVE_POSITIONING',
    'RELOCATION',
    'ROLL_GRAVITY',
  ],
  defense: [
    'POINT_OF_ATTACK_DEFENSE',
    'LATERAL_DEFENSE',
    'SCREEN_NAVIGATION_DEFENSE',
    'POST_DEFENSE',
    'RIM_PROTECTION',
    'SHOT_CONTEST',
    'STEAL_ABILITY',
    'DEFLECTION_ABILITY',
    'HELP_DEFENSE',
    'DEFENSIVE_ROTATION',
    'DEFENSIVE_POSITIONING',
    'OFFENSIVE_REBOUNDING',
    'DEFENSIVE_REBOUNDING',
  ],
  physical: [
    'SPEED',
    'ACCELERATION',
    'AGILITY',
    'STRENGTH',
    'VERTICAL_LEAP',
    'EXPLOSIVENESS',
    'BALANCE',
    'STAMINA',
    'ENDURANCE',
    'BODY_CONTROL',
  ],
  mental: [
    'DECISION_MAKING',
    'ANTICIPATION',
    'OFFENSIVE_AWARENESS',
    'DEFENSIVE_AWARENESS',
    'SPATIAL_AWARENESS',
    'CONCENTRATION',
    'REACTION_SPEED',
    'COMPOSURE',
    'ADAPTABILITY',
    'DISCIPLINE',
  ],
}

const RATING_CATEGORY_BY_KEY = Object.fromEntries(
  RADAR_CATEGORY_ORDER.flatMap((category) =>
    RATING_KEYS_BY_CATEGORY[category].map((key) => [key, category] as const),
  ),
) as Record<PlayerTruthRatingKey, RatingCategory>

const RATING_LABEL_OVERRIDES: Partial<Record<PlayerTruthRatingKey, string>> = {
  FREE_THROW: 'Free Throw',
  SHORT_MIDRANGE: 'Short Mid-Range',
  LONG_MIDRANGE: 'Long Mid-Range',
  MIDRANGE_PULLUP: 'Mid-Range Pull-Up',
  THREE_POINT_STATIC: 'Three-Point Static',
  THREE_POINT_PULLUP: 'Three-Point Pull-Up',
  OFF_HAND_FINISHING: 'Off-Hand Finishing',
  PICK_AND_ROLL_PLAYMAKING: 'Pick & Roll Playmaking',
  SHORT_ROLL_PLAYMAKING: 'Short-Roll Playmaking',
  OFF_BALL_MOVEMENT: 'Off-Ball Movement',
  POINT_OF_ATTACK_DEFENSE: 'Point-of-Attack Defense',
  LIVE_DRIBBLE_PASSING: 'Live-Dribble Passing',
  OPEN_COURT_HANDLING: 'Open-Court Handling',
  BODY_CONTROL_WITH_BALL: 'Body Control With Ball',
}

const OVERVIEW_HEADLINE_RATINGS: readonly PlayerTruthRatingKey[] = [
  'THREE_POINT_STATIC',
  'RIM_FINISHING',
  'BALL_CONTROL',
  'PASSING_VISION',
  'OFF_BALL_MOVEMENT',
  'POINT_OF_ATTACK_DEFENSE',
  'EXPLOSIVENESS',
  'DECISION_MAKING',
]

export function ratingLabel(key: PlayerTruthRatingKey): string {
  const override = RATING_LABEL_OVERRIDES[key]
  if (override !== undefined) return override
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

export function ratingCategory(key: PlayerTruthRatingKey): RatingCategory {
  return RATING_CATEGORY_BY_KEY[key]
}

export function ratingTone(value: number): string {
  if (value >= 91) return 'elite'
  if (value >= 83) return 'very-good'
  if (value >= 71) return 'good'
  if (value >= 56) return 'average'
  if (value >= 41) return 'below'
  return 'poor'
}

export function buildOverviewRatingKeys(
  playerRatings: PlayerTruthRatings,
): PlayerTruthRatingKey[] {
  const selected = new Set<PlayerTruthRatingKey>(OVERVIEW_HEADLINE_RATINGS)
  const remaining = PLAYER_TRUTH_RATING_KEYS
    .filter((key) => !selected.has(key))
    .slice()
    .sort((left, right) => playerRatings[right] - playerRatings[left] || left.localeCompare(right))

  for (const key of remaining) {
    if (selected.size >= 12) break
    selected.add(key)
  }

  return [...selected]
    .slice()
    .sort((left, right) => playerRatings[right] - playerRatings[left] || left.localeCompare(right))
    .slice(0, 12)
}

/** Category radar value = rounded mean of the Player Truth ratings in that family. */
export function aggregateCategoryValue(
  category: RatingCategory,
  playerRatings: PlayerTruthRatings,
): number {
  const keys = RATING_KEYS_BY_CATEGORY[category]
  if (keys.length === 0) return 0
  const total = keys.reduce((sum, key) => sum + playerRatings[key], 0)
  return Math.round(total / keys.length)
}

export function buildFullRatingRows(
  playerRatings: PlayerTruthRatings,
): readonly {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly category: RatingCategory
  readonly value: number
}[] {
  return PLAYER_TRUTH_RATING_KEYS.map((key) => ({
    id: key,
    label: ratingLabel(key),
    category: ratingCategory(key),
    value: playerRatings[key],
  }))
}

export function ratingsForCategory(
  category: RatingCategory,
  allRatings: readonly {
    readonly id: PlayerTruthRatingKey
    readonly label: string
    readonly category: RatingCategory
    readonly value: number
  }[],
): readonly {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly category: RatingCategory
  readonly value: number
}[] {
  return allRatings
    .filter((rating) => rating.category === category)
    .slice()
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
}

const PRIMARY_MAX = 4
const PRIMARY_MIN = 3

export function splitPrimarySecondaryRatings<T extends { readonly value: number }>(
  ratings: readonly T[],
): { readonly primary: readonly T[]; readonly secondary: readonly T[] } {
  if (ratings.length <= PRIMARY_MAX) {
    return { primary: ratings, secondary: [] }
  }
  const primaryCount = Math.min(PRIMARY_MAX, Math.max(PRIMARY_MIN, Math.ceil(ratings.length * 0.4)))
  return {
    primary: ratings.slice(0, primaryCount),
    secondary: ratings.slice(primaryCount),
  }
}

export function rankInCategory(
  ratingId: PlayerTruthRatingKey,
  categoryRatings: readonly { readonly id: PlayerTruthRatingKey; readonly value: number }[],
): number {
  const sorted = [...categoryRatings].sort((left, right) => right.value - left.value || left.id.localeCompare(right.id))
  return sorted.findIndex((rating) => rating.id === ratingId) + 1
}

export function relatedRatingsInCategory(
  ratingId: PlayerTruthRatingKey,
  categoryRatings: readonly {
    readonly id: PlayerTruthRatingKey
    readonly label: string
    readonly value: number
  }[],
  limit = 3,
): readonly { readonly id: PlayerTruthRatingKey; readonly label: string; readonly value: number }[] {
  return categoryRatings
    .filter((rating) => rating.id !== ratingId)
    .slice()
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit)
}
