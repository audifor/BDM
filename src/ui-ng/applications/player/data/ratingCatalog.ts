import {
  CANONICAL_RATING_KEYS,
  type CanonicalRatingKey,
} from '@/domain/player'

/** NG overview categories aligned with BDM canonical rating families. */
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

const CANONICAL_RATING_LABELS: Record<CanonicalRatingKey, string> = {
  midRangeShooting: 'Mid-Range Shooting',
  threePointShooting: 'Three-Point Shooting',
  freeThrowShooting: 'Free Throw Shooting',
  rimFinishing: 'Rim Finishing',
  contactFinishing: 'Contact Finishing',
  dunking: 'Dunking',
  floater: 'Floater',
  postScoring: 'Post Scoring',
  ballHandling: 'Ball Handling',
  ballSecurity: 'Ball Security',
  firstStep: 'First Step',
  changeOfDirection: 'Change of Direction',
  passing: 'Passing',
  courtVision: 'Court Vision',
  perimeterDefense: 'Perimeter Defense',
  interiorDefense: 'Interior Defense',
  screenNavigation: 'Screen Navigation',
  defensiveAwareness: 'Defensive Awareness',
  steal: 'Steal',
  rimProtection: 'Rim Protection',
  shotContest: 'Shot Contest',
  offensiveRebounding: 'Offensive Rebounding',
  defensiveRebounding: 'Defensive Rebounding',
  boxOut: 'Box Out',
  acceleration: 'Acceleration',
  speed: 'Speed',
  lateralAgility: 'Lateral Agility',
  strength: 'Strength',
  vertical: 'Vertical',
  stamina: 'Stamina',
  decisionMaking: 'Decision Making',
  anticipation: 'Anticipation',
  composure: 'Composure',
  offBallAwareness: 'Off-Ball Awareness',
  discipline: 'Discipline',
}

const CANONICAL_RATING_CATEGORY: Record<CanonicalRatingKey, RatingCategory> = {
  midRangeShooting: 'shooting',
  threePointShooting: 'shooting',
  freeThrowShooting: 'shooting',
  rimFinishing: 'finishing',
  contactFinishing: 'finishing',
  dunking: 'finishing',
  floater: 'finishing',
  postScoring: 'finishing',
  ballHandling: 'ballHandling',
  ballSecurity: 'ballHandling',
  firstStep: 'ballHandling',
  changeOfDirection: 'ballHandling',
  passing: 'playmaking',
  courtVision: 'playmaking',
  perimeterDefense: 'defense',
  interiorDefense: 'defense',
  screenNavigation: 'defense',
  defensiveAwareness: 'defense',
  steal: 'defense',
  rimProtection: 'defense',
  shotContest: 'defense',
  offensiveRebounding: 'defense',
  defensiveRebounding: 'defense',
  boxOut: 'defense',
  acceleration: 'physical',
  speed: 'physical',
  lateralAgility: 'physical',
  strength: 'physical',
  vertical: 'physical',
  stamina: 'physical',
  decisionMaking: 'mental',
  anticipation: 'mental',
  composure: 'mental',
  offBallAwareness: 'offBall',
  discipline: 'mental',
}

/** Representative overview picks: one headline skill per category. */
const OVERVIEW_HEADLINE_RATINGS: readonly CanonicalRatingKey[] = [
  'threePointShooting',
  'rimFinishing',
  'ballHandling',
  'courtVision',
  'offBallAwareness',
  'perimeterDefense',
  'firstStep',
  'decisionMaking',
]

export function ratingLabel(key: CanonicalRatingKey): string {
  return CANONICAL_RATING_LABELS[key]
}

export function ratingCategory(key: CanonicalRatingKey): RatingCategory {
  return CANONICAL_RATING_CATEGORY[key]
}

export function ratingTone(value: number): string {
  if (value >= 91) return 'elite'
  if (value >= 83) return 'very-good'
  if (value >= 71) return 'good'
  if (value >= 56) return 'average'
  if (value >= 41) return 'below'
  return 'poor'
}

export function buildOverviewRatingKeys(playerRatings: Readonly<Record<CanonicalRatingKey, number>>): CanonicalRatingKey[] {
  const selected = new Set<CanonicalRatingKey>(OVERVIEW_HEADLINE_RATINGS)
  const remaining = CANONICAL_RATING_KEYS
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

/** Category radar value = rounded mean of canonical ratings in that category. */
export function aggregateCategoryValue(
  category: RatingCategory,
  playerRatings: Readonly<Record<CanonicalRatingKey, number>>,
): number {
  const keys = CANONICAL_RATING_KEYS.filter((key) => CANONICAL_RATING_CATEGORY[key] === category)
  if (keys.length === 0) return 0
  const total = keys.reduce((sum, key) => sum + playerRatings[key], 0)
  return Math.round(total / keys.length)
}

export function ratingsInCategory(
  category: RatingCategory,
  playerRatings: Readonly<Record<CanonicalRatingKey, number>>,
): readonly { readonly key: CanonicalRatingKey; readonly value: number }[] {
  return CANONICAL_RATING_KEYS
    .filter((key) => CANONICAL_RATING_CATEGORY[key] === category)
    .map((key) => ({ key, value: playerRatings[key] }))
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key))
}
