import type { PlayerId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'

import type { MatchPlayerProfile } from './MatchPlayerProfile'

export interface PlayerMatchup {
  readonly offensivePlayerId: PlayerId
  readonly defensivePlayerId: PlayerId
}
export interface DefensiveMatchupOverride { readonly ourPlayerId:PlayerId; readonly opponentPlayerId:PlayerId }

const POSITION_INDEX: Readonly<Record<BasketballPosition, number>> = {
  PG: 0,
  SG: 1,
  SF: 2,
  PF: 3,
  C: 4,
}

/** Derives the current five's stable one-to-one defensive assignment without RNG. */
export function calculateDefensiveAssignments(
  offensiveLineup: readonly PlayerId[],
  defensiveLineup: readonly PlayerId[],
  profiles: readonly MatchPlayerProfile[],
  overrides:readonly DefensiveMatchupOverride[] = [],
): readonly PlayerMatchup[] {
  const profileByPlayerId = new Map(profiles.map((profile) => [profile.playerId, profile]))
  const sortedOffense = [...offensiveLineup].sort((left, right) => compareOffensivePlayers(left, right, profileByPlayerId))
  const availableDefenders = new Set(defensiveLineup)

  return sortedOffense.map((offensivePlayerId) => {
    const offensiveProfile = requiredProfile(profileByPlayerId, offensivePlayerId)
    const override=overrides.find(item=>item.opponentPlayerId===offensivePlayerId&&availableDefenders.has(item.ourPlayerId))
    const defensivePlayerId = override?.ourPlayerId??[...availableDefenders].sort((left, right) => compareDefenders(left, right, offensiveProfile, profileByPlayerId))[0]
    if (defensivePlayerId === undefined) throw new Error('Defensive lineup must provide one defender per offensive player')
    availableDefenders.delete(defensivePlayerId)
    return { offensivePlayerId, defensivePlayerId }
  })
}

function compareOffensivePlayers(left: PlayerId, right: PlayerId, profiles: ReadonlyMap<PlayerId, MatchPlayerProfile>): number {
  const byPosition = POSITION_INDEX[requiredProfile(profiles, left).primaryPosition] - POSITION_INDEX[requiredProfile(profiles, right).primaryPosition]
  return byPosition !== 0 ? byPosition : comparePlayerIds(left, right)
}

function compareDefenders(left: PlayerId, right: PlayerId, offensiveProfile: MatchPlayerProfile, profiles: ReadonlyMap<PlayerId, MatchPlayerProfile>): number {
  const leftProfile = requiredProfile(profiles, left)
  const rightProfile = requiredProfile(profiles, right)
  const leftDistance = Math.abs(POSITION_INDEX[offensiveProfile.primaryPosition] - POSITION_INDEX[leftProfile.primaryPosition])
  const rightDistance = Math.abs(POSITION_INDEX[offensiveProfile.primaryPosition] - POSITION_INDEX[rightProfile.primaryPosition])
  if (leftDistance !== rightDistance) return leftDistance - rightDistance
  if (leftProfile.defense.mobility !== rightProfile.defense.mobility) return rightProfile.defense.mobility - leftProfile.defense.mobility
  return comparePlayerIds(left, right)
}

function comparePlayerIds(left: PlayerId, right: PlayerId): number { return left < right ? -1 : left > right ? 1 : 0 }

function requiredProfile(profiles: ReadonlyMap<PlayerId, MatchPlayerProfile>, playerId: PlayerId): MatchPlayerProfile {
  const profile = profiles.get(playerId)
  if (profile === undefined) throw new Error(`Player ${playerId} has no MatchPlayerProfile`)
  return profile
}
