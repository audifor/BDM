import type { Player } from '@/domain/player'
import type { PlayerTruthRatingKey } from '@/domain/player'

/**
 * Tactical role legacy labels -> ratings supplied by canonical Player Truth.
 * A missing truth rating is omitted. We NEVER synthesize a role score from OVR.
 * Display bridge only: does not mutate Player Truth.
 */
const TACTICAL_ROLE_RATING_MAP = {
  court_vision: 'PASSING_VISION',
  pass_short: 'PASSING_ACCURACY',
  pass_long: 'PASSING_ACCURACY',
  pass_bounce: 'PASSING_TIMING',
  pass_post: 'POST_PLAYMAKING',
  creativity: 'ADVANTAGE_CREATION',
  ball_control: 'BALL_CONTROL',
  spacing_iq: 'SPATIAL_AWARENESS',
  court_leadership: 'DECISION_MAKING',
  pnr_read: 'PICK_AND_ROLL_PLAYMAKING',
  shot_selection: 'DECISION_MAKING',
  mid_range: 'SHORT_MIDRANGE',
  three_off_dribble: 'THREE_POINT_PULLUP',
  three_static: 'THREE_POINT_STATIC',
  free_throw: 'FREE_THROW',
  finishing_close: 'RIM_FINISHING',
  aggressiveness: 'DRIVE_CREATION',
  def_perimeter: 'POINT_OF_ATTACK_DEFENSE',
  steal_onball: 'STEAL_ABILITY',
  screen_nav: 'SCREEN_NAVIGATION_DEFENSE',
  help_defense: 'HELP_DEFENSE',
  closeout: 'SHOT_CONTEST',
  agility_lat: 'LATERAL_DEFENSE',
  off_screen_shot: 'MOVEMENT_SHOOTING',
  deep_range: 'DEEP_SHOOTING',
  acceleration: 'ACCELERATION',
  speed_top: 'SPEED',
  contact_finishing: 'CONTACT_FINISHING',
  off_ball_move: 'OFF_BALL_MOVEMENT',
  reb_def: 'DEFENSIVE_REBOUNDING',
  def_post: 'POST_DEFENSE',
  shot_contest: 'SHOT_CONTEST',
  block: 'RIM_PROTECTION',
  box_out: 'DEFENSIVE_REBOUNDING',
  post_scoring: 'POST_FINISHING',
  hook_shot: 'CLOSE_TOUCH',
  strength_static: 'STRENGTH',
  strength_explo: 'EXPLOSIVENESS',
  reb_off: 'OFFENSIVE_REBOUNDING',
  vert_run: 'VERTICAL_LEAP',
  vert_static: 'VERTICAL_LEAP',
  second_jump: 'VERTICAL_LEAP',
  intimidation: 'RIM_PROTECTION',
  ball_security_iq: 'DRIBBLE_SECURITY',
  hands: 'CLOSE_TOUCH',
  help_read: 'DEFENSIVE_AWARENESS',
  consistency: 'CONCENTRATION',
  chemistry: 'ADAPTABILITY',
  def_pnr_inside: 'HELP_DEFENSE',
  def_transition: 'DEFENSIVE_ROTATION',
} as const satisfies Readonly<Record<string, PlayerTruthRatingKey>>

export function tacticalAttributesFromPlayerTruth(player: Player): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [label, key] of Object.entries(TACTICAL_ROLE_RATING_MAP)) {
    const value = player.basketball.ratings[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
      result[label] = value
    }
  }
  return result
}
