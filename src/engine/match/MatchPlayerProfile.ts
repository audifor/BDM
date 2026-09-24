import type { Player, PlayerBio, PlayerTendencies, PlayerTruthRatings } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'

export interface MatchPlayerProfile {
  readonly playerId: PlayerId
  readonly primaryPosition: BasketballPosition
  readonly tendencies: PlayerTendencies
  readonly physical: Pick<PlayerBio, 'heightCm' | 'weightKg' | 'wingspanCm' | 'standingReachCm'>
  readonly offense: {
    readonly usage: number
    readonly rimAttack: number
    readonly shooting: number
    readonly creation: number
    readonly ballSecurity: number
  }
  readonly passing?: {
    readonly accuracy: number
    readonly vision: number
    readonly timing: number
  }
  readonly defense: {
    readonly pointOfAttack: number
    readonly interior: number
    readonly mobility: number
    readonly steal?: number
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
 * Builds a transient match profile from Player Truth, canonical tendencies, and physical bio.
 * Rating signals use only semantically relevant truth keys; no legacy projection or overall
 * participates in their construction.
 */
export function createMatchPlayerProfile(player: Player): MatchPlayerProfile {
  const truth = player.basketball.ratings
  return {
    playerId: player.id,
    primaryPosition: player.basketball.primaryPosition,
    tendencies: player.basketball.tendencies,
    physical: {
      heightCm: player.bio.heightCm,
      weightKg: player.bio.weightKg,
      wingspanCm: player.bio.wingspanCm,
      standingReachCm: player.bio.standingReachCm,
    },
    offense: {
      usage: clampSignal(average(truth, ['SHOT_TOUCH', 'ADVANTAGE_CREATION', 'DRIVE_CREATION', 'OFFENSIVE_AWARENESS'])),
      rimAttack: clampSignal(average(truth, ['RIM_FINISHING', 'CONTACT_FINISHING', 'VERTICAL_FINISHING', 'FINISHING_THROUGH_LENGTH'])),
      shooting: clampSignal(average(truth, ['SHORT_MIDRANGE', 'LONG_MIDRANGE', 'THREE_POINT_STATIC', 'THREE_POINT_PULLUP', 'CONTESTED_SHOOTING', 'SHOT_TOUCH'])),
      creation: clampSignal(average(truth, ['DRIVE_CREATION', 'ADVANTAGE_CREATION', 'CHANGE_OF_DIRECTION', 'PRESSURE_HANDLING'])),
      ballSecurity: clampSignal(average(truth, ['BALL_CONTROL', 'DRIBBLE_SECURITY', 'DECISION_MAKING', 'PRESSURE_HANDLING'])),
    },
    passing: {
      accuracy: clampSignal(average(truth, ['PASSING_ACCURACY', 'LIVE_DRIBBLE_PASSING'])),
      vision: clampSignal(average(truth, ['PASSING_VISION', 'DECISION_MAKING'])),
      timing: clampSignal(truth.PASSING_TIMING),
    },
    defense: {
      pointOfAttack: clampSignal(average(truth, ['POINT_OF_ATTACK_DEFENSE', 'LATERAL_DEFENSE', 'SCREEN_NAVIGATION_DEFENSE'])),
      interior: clampSignal(average(truth, ['RIM_PROTECTION', 'POST_DEFENSE', 'SHOT_CONTEST'])),
      mobility: clampSignal(average(truth, ['AGILITY', 'SPEED', 'ACCELERATION', 'LATERAL_DEFENSE'])),
      steal: clampSignal(truth.STEAL_ABILITY),
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
