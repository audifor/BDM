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
  subject: {primaryPosition: BasketballPosition; secondaryPositions?: readonly BasketballPosition[]},
  comparator: {primaryPosition: BasketballPosition; secondaryPositions?: readonly BasketballPosition[]},
): readonly BasketballPosition[] {
  const subjectPositions = [...new Set([subject.primaryPosition,...(subject.secondaryPositions ?? [])])]
  const comparatorPositions = new Set([comparator.primaryPosition,...(comparator.secondaryPositions ?? [])])
  return subjectPositions.filter(position=>comparatorPositions.has(position))
}


export type ScoutingPositionCompatibility = 'primary' | 'mixed' | 'secondary' | 'none'
export interface ScoutingPositionMatch {
  readonly position: BasketballPosition
  readonly availablePositions: readonly BasketballPosition[]
  readonly compatibility: ScoutingPositionCompatibility
  readonly subjectPrimary: boolean
  readonly comparatorPrimary: boolean
}
/**
 * A shared secondary position is a possibility, not evidence of a real role.
 * Both primary positions MUST match for a definitive same-position appraisal.
 * The selected lens and the decision use the same returned position.
 */
export function resolveScoutingPositionMatch(
  subject: {primaryPosition: BasketballPosition; secondaryPositions?: readonly BasketballPosition[]},
  comparator: {primaryPosition: BasketballPosition; secondaryPositions?: readonly BasketballPosition[]} | null,
  preferredPosition?: BasketballPosition | null,
): ScoutingPositionMatch {
  const availablePositions = comparator === null ? [] : sharedScoutingPositions(subject, comparator)
  const position = (preferredPosition !== null && preferredPosition !== undefined &&
    availablePositions.includes(preferredPosition) ? preferredPosition : undefined) ??
    availablePositions.find(pos=>pos===subject.primaryPosition && pos===comparator?.primaryPosition) ??
    availablePositions.find(pos=>pos===subject.primaryPosition) ??
    availablePositions.find(pos=>pos===comparator?.primaryPosition) ??
    availablePositions[0] ?? subject.primaryPosition
  const subjectPrimary = subject.primaryPosition===position
  const comparatorPrimary = comparator?.primaryPosition===position
  const compatibility: ScoutingPositionCompatibility = availablePositions.length===0 ? 'none'
    : subjectPrimary && comparatorPrimary ? 'primary'
    : subjectPrimary || comparatorPrimary ? 'mixed' : 'secondary'
  return {position,availablePositions,compatibility,subjectPrimary,comparatorPrimary}
}

export function positionEvidenceKeys(position: BasketballPosition): readonly PlayerTruthRatingKey[] {
  return SCOUTING_POSITION_KEYS[position]
}
