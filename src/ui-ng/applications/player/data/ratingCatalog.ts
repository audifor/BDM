import {
  PLAYER_TRUTH_RATING_KEYS,
  PLAYER_RATING_FAMILY_KEYS,
  playerRatingScoutingFamily,
  type PlayerRatingScoutingFamily,
  type PlayerTruthRatingKey,
  type PlayerTruthRatings,
} from '@/domain/player/PlayerTruthCatalog'

/** Rating families used by the player workspace. Every raw World DB rating belongs to one family. */
export type RatingCategory = PlayerRatingScoutingFamily

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

const RATING_KEYS_BY_CATEGORY = PLAYER_RATING_FAMILY_KEYS

const PLAYER_TRUTH_KEY_SET = new Set<string>(PLAYER_TRUTH_RATING_KEYS)
const RATING_CATEGORY = Object.fromEntries(PLAYER_TRUTH_RATING_KEYS.map((key) => [key, playerRatingScoutingFamily(key)])) as Readonly<Record<PlayerTruthRatingKey, RatingCategory>>
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
