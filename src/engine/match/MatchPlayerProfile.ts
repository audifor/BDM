import type { Player } from '@/domain/player'
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
}

export interface MatchPlayerProfiles {
  readonly home: readonly MatchPlayerProfile[]
  readonly away: readonly MatchPlayerProfile[]
}

/** Temporary adapter between persistent player ratings and match-only action signals. */
export function createMatchPlayerProfile(player: Player): MatchPlayerProfile {
  const ratings = player.basketball.ratings
  return {
    playerId: player.id,
    primaryPosition: player.basketball.primaryPosition,
    offense: {
      usage: clampSignal(ratings.finishing * 0.40 + ratings.shooting * 0.35 + ratings.playmaking * 0.25),
      rimAttack: clampSignal(ratings.finishing * 0.75 + ratings.athleticism * 0.25),
      shooting: clampSignal(ratings.shooting),
      creation: clampSignal(ratings.playmaking * 0.75 + ratings.athleticism * 0.25),
      ballSecurity: clampSignal(ratings.playmaking * 0.80 + ratings.athleticism * 0.20),
    },
    defense: {
      pointOfAttack: clampSignal(ratings.perimeterDefense * 0.75 + ratings.athleticism * 0.25),
      interior: clampSignal(ratings.interiorDefense * 0.80 + ratings.athleticism * 0.20),
      mobility: clampSignal(ratings.perimeterDefense * 0.35 + ratings.athleticism * 0.65),
    },
  }
}

function clampSignal(value: number): number { return Math.min(100, Math.max(0, value)) }
