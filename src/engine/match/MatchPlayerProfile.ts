import type { Player, PlayerTruthRatings } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'

export interface MatchPlayerProfile {
  readonly playerId: PlayerId
  readonly primaryPosition: BasketballPosition
  readonly offense: {
    readonly usage: number
    readonly rimAttack: number
    readonly shooting: number
    readonly creation: number
    readonly ballSecurity: number
  }
  readonly defense: {
    readonly pointOfAttack: number
    readonly interior: number
    readonly mobility: number
  }
  readonly rebounding: {
    readonly impact: number
  }
}

export interface MatchPlayerProfiles {
  readonly home: readonly MatchPlayerProfile[]
  readonly away: readonly MatchPlayerProfile[]
}

/**
 * Builds match-only action signals directly from the 80-key PlayerTruthRatings. Each signal
 * uses only the rating keys semantically relevant to that gameplay context; no legacy 35/7-key
 * projection or aggregate "overall" participates in this construction.
 */
export function createMatchPlayerProfile(player: Player): MatchPlayerProfile {
  const truth = player.basketball.ratings
  return {
    playerId: player.id,
    primaryPosition: player.basketball.primaryPosition,
    offense: {
      usage: clampSignal(average(truth, ['SHOT_TOUCH', 'ADVANTAGE_CREATION', 'DRIVE_CREATION', 'OFFENSIVE_AWARENESS'])),
      rimAttack: clampSignal(average(truth, ['RIM_FINISHING', 'CONTACT_FINISHING', 'VERTICAL_FINISHING', 'FINISHING_THROUGH_LENGTH'])),
      shooting: clampSignal(average(truth, ['SHORT_MIDRANGE', 'LONG_MIDRANGE', 'THREE_POINT_STATIC', 'THREE_POINT_PULLUP', 'CONTESTED_SHOOTING', 'SHOT_TOUCH'])),
      creation: clampSignal(average(truth, ['DRIVE_CREATION', 'ADVANTAGE_CREATION', 'CHANGE_OF_DIRECTION', 'PRESSURE_HANDLING'])),
      ballSecurity: clampSignal(average(truth, ['BALL_CONTROL', 'DRIBBLE_SECURITY', 'DECISION_MAKING', 'PRESSURE_HANDLING'])),
    },
    defense: {
      pointOfAttack: clampSignal(average(truth, ['POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE'])),
      interior: clampSignal(average(truth, ['RIM_PROTECTION', 'POST_DEFENSE', 'SHOT_CONTEST'])),
      mobility: clampSignal(average(truth, ['AGILITY', 'SPEED', 'ACCELERATION', 'LATERAL_DEFENSE'])),
    },
    rebounding: {
      impact: clampSignal(average(truth, ['OFFENSIVE_REBOUNDING', 'DEFENSIVE_REBOUNDING', 'STRENGTH', 'VERTICAL_LEAP'])),
    },
  }
}

function average(ratings: PlayerTruthRatings, keys: readonly (keyof PlayerTruthRatings)[]): number {
  return keys.reduce((total, key) => total + ratings[key], 0) / keys.length
}

function clampSignal(value: number): number { return Math.min(100, Math.max(0, value)) }
