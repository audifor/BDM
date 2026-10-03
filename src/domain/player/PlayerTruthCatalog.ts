export const PLAYER_TRUTH_RATING_KEYS = [
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
  'BALL_CONTROL',
  'DRIBBLE_SECURITY',
  'CHANGE_OF_DIRECTION',
  'CHANGE_OF_PACE',
  'DRIVE_CREATION',
  'PRESSURE_HANDLING',
  'OPEN_COURT_HANDLING',
  'DRIBBLE_SEPARATION',
  'BODY_CONTROL_WITH_BALL',
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
  'OFF_BALL_MOVEMENT',
  'CUTTING',
  'SCREENING',
  'SCREEN_USAGE',
  'SPACING',
  'OFFENSIVE_POSITIONING',
  'RELOCATION',
  'ROLL_GRAVITY',
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
] as const

export type PlayerTruthRatingKey = typeof PLAYER_TRUTH_RATING_KEYS[number]
export type PlayerTruthRatings = Readonly<Record<PlayerTruthRatingKey, number>>

/** Canonical profile/scouting families. This is the single key-to-family mapping for all 80 ratings. */
export const PLAYER_RATING_FAMILY_KEYS = {
  shooting: ['FREE_THROW', 'SHORT_MIDRANGE', 'LONG_MIDRANGE', 'MIDRANGE_PULLUP', 'THREE_POINT_STATIC', 'THREE_POINT_PULLUP', 'DEEP_SHOOTING', 'MOVEMENT_SHOOTING', 'CONTESTED_SHOOTING', 'SHOT_TOUCH'],
  finishing: ['RIM_FINISHING', 'CONTACT_FINISHING', 'FINISHING_THROUGH_LENGTH', 'OFF_HAND_FINISHING', 'DUNKING', 'VERTICAL_FINISHING', 'ACROBATIC_FINISHING', 'POST_FINISHING', 'FOUL_DRAWING', 'CLOSE_TOUCH'],
  ballHandling: ['BALL_CONTROL', 'DRIBBLE_SECURITY', 'CHANGE_OF_DIRECTION', 'CHANGE_OF_PACE', 'DRIVE_CREATION', 'PRESSURE_HANDLING', 'OPEN_COURT_HANDLING', 'DRIBBLE_SEPARATION', 'BODY_CONTROL_WITH_BALL'],
  playmaking: ['PASSING_ACCURACY', 'PASSING_VISION', 'PASSING_TIMING', 'LIVE_DRIBBLE_PASSING', 'PICK_AND_ROLL_PLAYMAKING', 'SHORT_ROLL_PLAYMAKING', 'POST_PLAYMAKING', 'TRANSITION_PLAYMAKING', 'ADVANTAGE_CREATION', 'ADVANTAGE_EXPLOITATION'],
  offBall: ['OFF_BALL_MOVEMENT', 'CUTTING', 'SCREENING', 'SCREEN_USAGE', 'SPACING', 'OFFENSIVE_POSITIONING', 'RELOCATION', 'ROLL_GRAVITY'],
  defense: ['POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE', 'POST_DEFENSE', 'RIM_PROTECTION', 'SHOT_CONTEST', 'STEAL_ABILITY', 'DEFLECTION_ABILITY', 'HELP_DEFENSE', 'DEFENSIVE_ROTATION', 'DEFENSIVE_POSITIONING', 'OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING'],
  physical: ['SPEED', 'ACCELERATION', 'AGILITY', 'STRENGTH', 'VERTICAL_LEAP', 'EXPLOSIVENESS', 'BALANCE', 'STAMINA', 'ENDURANCE', 'BODY_CONTROL'],
  mental: ['DECISION_MAKING', 'ANTICIPATION', 'OFFENSIVE_AWARENESS', 'DEFENSIVE_AWARENESS', 'SPATIAL_AWARENESS', 'CONCENTRATION', 'REACTION_SPEED', 'COMPOSURE', 'ADAPTABILITY', 'DISCIPLINE'],
} as const satisfies Readonly<Record<string, readonly PlayerTruthRatingKey[]>>

export type PlayerRatingScoutingFamily = keyof typeof PLAYER_RATING_FAMILY_KEYS
export const PLAYER_RATING_SCOUTING_FAMILIES = Object.freeze(Object.keys(PLAYER_RATING_FAMILY_KEYS) as PlayerRatingScoutingFamily[])

export type PlayerAggregateScoutingDimension =
  | 'finishing'
  | 'shooting'
  | 'creation'
  | 'perimeterDefense'
  | 'interiorDefense'
  | 'rebounding'
  | 'physical'

/** Existing seven-dimension summaries, expressed as canonical rating members. */
export const PLAYER_AGGREGATE_SCOUTING_KEYS: Readonly<Record<PlayerAggregateScoutingDimension, readonly PlayerTruthRatingKey[]>> = {
  finishing: PLAYER_RATING_FAMILY_KEYS.finishing,
  shooting: PLAYER_RATING_FAMILY_KEYS.shooting,
  creation: [...PLAYER_RATING_FAMILY_KEYS.ballHandling, ...PLAYER_RATING_FAMILY_KEYS.playmaking],
  perimeterDefense: ['POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE', 'STEAL_ABILITY', 'DEFLECTION_ABILITY', 'HELP_DEFENSE', 'DEFENSIVE_ROTATION', 'DEFENSIVE_POSITIONING'],
  interiorDefense: ['POST_DEFENSE', 'RIM_PROTECTION', 'SHOT_CONTEST', 'DEFENSIVE_AWARENESS'],
  rebounding: ['OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING'],
  physical: PLAYER_RATING_FAMILY_KEYS.physical,
}

const ratingFamilyByKey = Object.fromEntries(
  Object.entries(PLAYER_RATING_FAMILY_KEYS).flatMap(([family, keys]) => keys.map((key) => [key, family])),
) as Readonly<Record<PlayerTruthRatingKey, PlayerRatingScoutingFamily>>

if (
  Object.values(PLAYER_RATING_FAMILY_KEYS).flat().length !== PLAYER_TRUTH_RATING_KEYS.length
  || new Set(Object.values(PLAYER_RATING_FAMILY_KEYS).flat()).size !== PLAYER_TRUTH_RATING_KEYS.length
  || PLAYER_TRUTH_RATING_KEYS.some((key) => !Object.hasOwn(ratingFamilyByKey, key))
) {
  throw new Error('Player scouting families must cover each canonical rating exactly once')
}

export function playerRatingScoutingFamily(key: PlayerTruthRatingKey): PlayerRatingScoutingFamily {
  return ratingFamilyByKey[key]
}

export function ratingKnowledgeDimensionFor(key: PlayerTruthRatingKey): `rating:${PlayerTruthRatingKey}` {
  return `rating:${key}`
}

export function ratingKeyFromKnowledgeDimension(dimension: string): PlayerTruthRatingKey | undefined {
  if (!dimension.startsWith('rating:')) return undefined
  const key = dimension.slice('rating:'.length)
  return (PLAYER_TRUTH_RATING_KEYS as readonly string[]).includes(key) ? key as PlayerTruthRatingKey : undefined
}

export function ratingKeysForScoutingFamily(family: PlayerRatingScoutingFamily): readonly PlayerTruthRatingKey[] {
  return PLAYER_RATING_FAMILY_KEYS[family]
}

export function ratingKeysForAggregateDimension(dimension: PlayerAggregateScoutingDimension): readonly PlayerTruthRatingKey[] {
  return PLAYER_AGGREGATE_SCOUTING_KEYS[dimension]
}

export const PLAYER_TRUTH_TENDENCY_KEYS = [
  'SHOT_FREQUENCY',
  'RIM_ATTEMPT_FREQUENCY',
  'MIDRANGE_FREQUENCY',
  'THREE_POINT_FREQUENCY',
  'DEEP_THREE_FREQUENCY',
  'PULLUP_FREQUENCY',
  'CATCH_AND_SHOOT_FREQUENCY',
  'CONTESTED_SHOT_WILLINGNESS',
  'TRANSITION_ATTACK_FREQUENCY',
  'DRIVE_FREQUENCY',
  'DUNK_ATTEMPT_FREQUENCY',
  'ACROBATIC_FINISH_FREQUENCY',
  'FOUL_SEEKING_FREQUENCY',
  'POST_UP_FREQUENCY',
  'ISOLATION_FREQUENCY',
  'PICK_AND_ROLL_HANDLER_FREQUENCY',
  'PICK_AND_ROLL_ROLL_FREQUENCY',
  'PICK_AND_POP_FREQUENCY',
  'CUT_FREQUENCY',
  'OFF_BALL_SCREEN_USAGE',
  'ON_BALL_SCREENING_FREQUENCY',
  'RELOCATION_FREQUENCY',
  'PASS_FIRST_BIAS',
  'ADVANTAGE_PASS_FREQUENCY',
  'SKIP_PASS_FREQUENCY',
  'LOB_PASS_FREQUENCY',
  'RISKY_PASS_FREQUENCY',
  'LIVE_DRIBBLE_PASS_FREQUENCY',
  'OFFENSIVE_REBOUND_CRASH',
  'TRANSITION_RUNOUT',
  'ON_BALL_PRESSURE',
  'GAMBLE_FOR_STEALS',
  'PASSING_LANE_GAMBLE',
  'HELP_AGGRESSIVENESS',
  'ROTATION_AGGRESSIVENESS',
  'RIM_CONTEST_FREQUENCY',
  'FOUL_AGGRESSIVENESS',
  'SWITCH_WILLINGNESS',
  'PHYSICALITY_TENDENCY',
  'PACE_PUSH_TENDENCY',
] as const

export type PlayerTruthTendencyKey = typeof PLAYER_TRUTH_TENDENCY_KEYS[number]
export type PlayerTruthTendencies = Readonly<Record<PlayerTruthTendencyKey, number>>
