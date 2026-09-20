import { PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatingKey, type PlayerTruthRatings } from '@/domain/player/PlayerTruthCatalog'

/** Rating families used by the player workspace. Every raw World DB rating belongs to one family. */
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
  'shooting', 'finishing', 'ballHandling', 'playmaking', 'offBall', 'defense', 'physical', 'mental',
]

const RATING_KEYS_BY_CATEGORY: Readonly<Record<RatingCategory, readonly PlayerTruthRatingKey[]>> = {
  shooting: ['FREE_THROW', 'SHORT_MIDRANGE', 'LONG_MIDRANGE', 'MIDRANGE_PULLUP', 'THREE_POINT_STATIC', 'THREE_POINT_PULLUP', 'DEEP_SHOOTING', 'MOVEMENT_SHOOTING', 'CONTESTED_SHOOTING', 'SHOT_TOUCH'],
  finishing: ['RIM_FINISHING', 'CONTACT_FINISHING', 'FINISHING_THROUGH_LENGTH', 'OFF_HAND_FINISHING', 'DUNKING', 'VERTICAL_FINISHING', 'ACROBATIC_FINISHING', 'POST_FINISHING', 'FOUL_DRAWING', 'CLOSE_TOUCH'],
  ballHandling: ['BALL_CONTROL', 'DRIBBLE_SECURITY', 'CHANGE_OF_DIRECTION', 'CHANGE_OF_PACE', 'DRIVE_CREATION', 'PRESSURE_HANDLING', 'OPEN_COURT_HANDLING', 'DRIBBLE_SEPARATION', 'BODY_CONTROL_WITH_BALL'],
  playmaking: ['PASSING_ACCURACY', 'PASSING_VISION', 'PASSING_TIMING', 'LIVE_DRIBBLE_PASSING', 'PICK_AND_ROLL_PLAYMAKING', 'SHORT_ROLL_PLAYMAKING', 'POST_PLAYMAKING', 'TRANSITION_PLAYMAKING', 'ADVANTAGE_CREATION', 'ADVANTAGE_EXPLOITATION'],
  offBall: ['OFF_BALL_MOVEMENT', 'CUTTING', 'SCREENING', 'SCREEN_USAGE', 'SPACING', 'OFFENSIVE_POSITIONING', 'RELOCATION', 'ROLL_GRAVITY'],
  defense: ['POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE', 'POST_DEFENSE', 'RIM_PROTECTION', 'SHOT_CONTEST', 'STEAL_ABILITY', 'DEFLECTION_ABILITY', 'HELP_DEFENSE', 'DEFENSIVE_ROTATION', 'DEFENSIVE_POSITIONING', 'OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING'],
  physical: ['SPEED', 'ACCELERATION', 'AGILITY', 'STRENGTH', 'VERTICAL_LEAP', 'EXPLOSIVENESS', 'BALANCE', 'STAMINA', 'ENDURANCE', 'BODY_CONTROL'],
  mental: ['DECISION_MAKING', 'ANTICIPATION', 'OFFENSIVE_AWARENESS', 'DEFENSIVE_AWARENESS', 'SPATIAL_AWARENESS', 'CONCENTRATION', 'REACTION_SPEED', 'COMPOSURE', 'ADAPTABILITY', 'DISCIPLINE'],
}

const RATING_CATEGORY = Object.fromEntries(
  Object.entries(RATING_KEYS_BY_CATEGORY).flatMap(([category, keys]) => keys.map((key) => [key, category])),
) as Readonly<Record<PlayerTruthRatingKey, RatingCategory>>

const PLAYER_TRUTH_KEY_SET = new Set<string>(PLAYER_TRUTH_RATING_KEYS)
if (
  PLAYER_TRUTH_RATING_KEYS.length !== 80
  || Object.keys(RATING_CATEGORY).length !== PLAYER_TRUTH_RATING_KEYS.length
  || PLAYER_TRUTH_RATING_KEYS.some((key) => !Object.hasOwn(RATING_CATEGORY, key))
  || Object.keys(RATING_CATEGORY).some((key) => !PLAYER_TRUTH_KEY_SET.has(key))
) {
  throw new Error('Player rating family catalog must cover all 80 Player Truth keys exactly once')
}

/** Representative overview picks. The full 80-key list remains on Attributes. */
const OVERVIEW_HEADLINE_RATINGS: readonly PlayerTruthRatingKey[] = [
  'THREE_POINT_STATIC', 'RIM_FINISHING', 'BALL_CONTROL', 'PASSING_VISION',
  'OFF_BALL_MOVEMENT', 'POINT_OF_ATTACK_DEFENSE', 'SPEED', 'DECISION_MAKING',
]

export function ratingLabel(key: PlayerTruthRatingKey): string {
  return key.split('_').map((part) => part[0] + part.slice(1).toLowerCase()).join(' ')
}

export function ratingCategory(key: PlayerTruthRatingKey): RatingCategory {
  return RATING_CATEGORY[key]
}

export function ratingTone(value: number): string {
  if (value >= 91) return 'elite'
  if (value >= 83) return 'very-good'
  if (value >= 71) return 'good'
  if (value >= 56) return 'average'
  if (value >= 41) return 'below'
  return 'poor'
}

export function ordinalPercentile(value: number): string {
  const withinHundred = value % 100
  if (withinHundred >= 11 && withinHundred <= 13) return `${value}th`
  switch (value % 10) {
    case 1: return `${value}st`
    case 2: return `${value}nd`
    case 3: return `${value}rd`
    default: return `${value}th`
  }
}

export function buildOverviewRatingKeys(playerRatings: PlayerTruthRatings): PlayerTruthRatingKey[] {
  const selected = new Set<PlayerTruthRatingKey>(OVERVIEW_HEADLINE_RATINGS)
  const remaining = PLAYER_TRUTH_RATING_KEYS.filter((key) => !selected.has(key))
    .slice().sort((left, right) => playerRatings[right] - playerRatings[left] || left.localeCompare(right))
  for (const key of remaining) {
    if (selected.size >= 12) break
    selected.add(key)
  }
  return [...selected].sort((left, right) => playerRatings[right] - playerRatings[left] || left.localeCompare(right)).slice(0, 12)
}

export function aggregateCategoryValue(category: RatingCategory, playerRatings: PlayerTruthRatings): number {
  const keys = RATING_KEYS_BY_CATEGORY[category]
  const total = keys.reduce((sum, key) => sum + playerRatings[key], 0)
  return Math.round(total / keys.length)
}

export interface PlayerRatingRowData {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly category: RatingCategory
  readonly value: number
}

export function buildFullRatingRows(playerRatings: PlayerTruthRatings): readonly PlayerRatingRowData[] {
  return PLAYER_TRUTH_RATING_KEYS.map((key) => ({ id: key, label: ratingLabel(key), category: ratingCategory(key), value: playerRatings[key] }))
}

export function ratingsForCategory(category: RatingCategory, allRatings: readonly PlayerRatingRowData[]): readonly PlayerRatingRowData[] {
  return allRatings.filter((rating) => rating.category === category).slice()
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
}

export function rankInCategory(ratingId: PlayerTruthRatingKey, categoryRatings: readonly { readonly id: PlayerTruthRatingKey; readonly value: number }[]): number {
  const sorted = [...categoryRatings].sort((left, right) => right.value - left.value || left.id.localeCompare(right.id))
  return sorted.findIndex((rating) => rating.id === ratingId) + 1
}

export function relatedRatingsInCategory(ratingId: PlayerTruthRatingKey, categoryRatings: readonly { readonly id: PlayerTruthRatingKey; readonly label: string; readonly value: number }[], limit = 3) {
  return categoryRatings.filter((rating) => rating.id !== ratingId).slice()
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label)).slice(0, limit)
}
