import type { BasketballPosition } from '@/domain/primitives/BasketballPosition'
import type { PlayerTruthRatingKey } from '@/domain/player'

/**
 * UI scouting lens V1. Explicitly selected relevant 80-rating keys for each
 * playing POSITION, not tactical role, starting-five fit or engine truth.
 * The list is purposefully unweighted and fully visible to the manager.
 * A positional profile is a diagnostic, NEVER an all-purpose fit score.
 */
export const SCOUTING_POSITION_KEYS: Readonly<Record<BasketballPosition, readonly PlayerTruthRatingKey[]>> = {
  PG: [
    'BALL_CONTROL', 'DRIBBLE_SECURITY', 'PRESSURE_HANDLING', 'CHANGE_OF_PACE',
    'PASSING_ACCURACY', 'PASSING_VISION', 'PASSING_TIMING', 'PICK_AND_ROLL_PLAYMAKING',
    'DECISION_MAKING', 'POINT_OF_ATTACK_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE',
    'THREE_POINT_STATIC', 'ADVANTAGE_CREATION', 'TRANSITION_PLAYMAKING',
  ],
  SG: [
    'THREE_POINT_STATIC', 'THREE_POINT_PULLUP', 'MOVEMENT_SHOOTING', 'SHOT_TOUCH',
    'OFF_BALL_MOVEMENT', 'SPACING', 'BALL_CONTROL', 'DRIVE_CREATION',
    'POINT_OF_ATTACK_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE', 'LATERAL_DEFENSE',
    'PASSING_ACCURACY', 'DECISION_MAKING', 'STAMINA',
  ],
  SF: [
    'THREE_POINT_STATIC', 'MOVEMENT_SHOOTING', 'RIM_FINISHING', 'CONTACT_FINISHING',
    'OFF_BALL_MOVEMENT', 'CUTTING', 'SPACING', 'POINT_OF_ATTACK_DEFENSE',
    'LATERAL_DEFENSE', 'HELP_DEFENSE', 'DEFENSIVE_REBOUNDING', 'STRENGTH',
    'SPEED', 'DECISION_MAKING',
  ],
  PF: [
    'RIM_FINISHING', 'CONTACT_FINISHING', 'POST_FINISHING', 'THREE_POINT_STATIC',
    'SCREENING', 'ROLL_GRAVITY', 'POST_DEFENSE', 'HELP_DEFENSE',
    'RIM_PROTECTION', 'OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING',
    'STRENGTH', 'DEFENSIVE_POSITIONING', 'DECISION_MAKING',
  ],
  C: [
    'RIM_FINISHING', 'CONTACT_FINISHING', 'POST_FINISHING', 'CLOSE_TOUCH',
    'SCREENING', 'ROLL_GRAVITY', 'SHORT_ROLL_PLAYMAKING',
    'POST_DEFENSE', 'RIM_PROTECTION', 'SHOT_CONTEST',
    'OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING', 'STRENGTH',
    'DEFENSIVE_POSITIONING',
  ],
}

export function sharedScoutingPositions(
  subject: {primaryPosition: BasketballPosition; secondaryPosition: BasketballPosition | null},
  comparator: {primaryPosition: BasketballPosition; secondaryPosition: BasketballPosition | null},
): readonly BasketballPosition[] {
  const subjectPositions = [subject.primaryPosition,subject.secondaryPosition].filter(
    (value):value is BasketballPosition=>value!==null)
  const comparatorPositions = new Set([comparator.primaryPosition,comparator.secondaryPosition])
  return subjectPositions.filter(position=>comparatorPositions.has(position))
}

export function positionEvidenceKeys(position: BasketballPosition): readonly PlayerTruthRatingKey[] {
  return SCOUTING_POSITION_KEYS[position]
}
