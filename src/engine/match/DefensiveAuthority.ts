import type { PlayerId, TeamId } from '@/domain/ids'

import { calculateDefensiveAssignments, type DefensiveMatchupOverride, type PlayerMatchup } from './Matchups'
import type { MatchLineups } from './MatchEngine'
import type { MatchPlayerProfiles } from './MatchPlayerProfile'
import type { SpatialState } from './SpatialState'

export interface DefensiveAssignment {
  readonly attackingTeamId: TeamId
  readonly defendingTeamId: TeamId
  readonly offensivePlayerId: PlayerId
  readonly defenderId: PlayerId
  readonly kind: 'PRIMARY_MATCHUP' | 'TEMPORARY_OVERRIDE'
  readonly intent: 'GUARD'
}

export interface DefensiveAuthority {
  readonly attackingTeamId: TeamId
  readonly defendingTeamId: TeamId
  readonly baseAssignments: readonly DefensiveAssignment[]
  readonly temporaryAssignments: readonly DefensiveAssignment[]
}

export function createDefensiveAuthority(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly activeLineups: MatchLineups
  readonly playerProfiles: MatchPlayerProfiles
  readonly spatial: SpatialState
  readonly matchupOverrides?: readonly DefensiveMatchupOverride[]
}): DefensiveAuthority {
  const defendingTeamId = input.attackingTeamId === input.homeTeamId
    ? input.awayTeamId
    : input.attackingTeamId === input.awayTeamId
      ? input.homeTeamId
      : undefined
  if (defendingTeamId === undefined || input.homeTeamId === input.awayTeamId) {
    throw new Error('Defensive authority requires the attacking team to be one of two distinct match teams')
  }

  const offensiveLineup = lineupFor(input.activeLineups, input.homeTeamId, input.attackingTeamId)
  const defensiveLineup = lineupFor(input.activeLineups, input.homeTeamId, defendingTeamId)
  validateLineup(offensiveLineup, input.attackingTeamId, input.spatial)
  validateLineup(defensiveLineup, defendingTeamId, input.spatial)
  if (offensiveLineup.length !== defensiveLineup.length) throw new Error('Active teams must have equal lineup sizes for primary defensive assignments')

  const profiles = input.attackingTeamId === input.homeTeamId
    ? [...input.playerProfiles.home, ...input.playerProfiles.away]
    : [...input.playerProfiles.away, ...input.playerProfiles.home]
  const matchups = calculateDefensiveAssignments(offensiveLineup, defensiveLineup, profiles, input.matchupOverrides)
  const authority: DefensiveAuthority = {
    attackingTeamId: input.attackingTeamId,
    defendingTeamId,
    baseAssignments: matchups.map((matchup) => assignment(input.attackingTeamId, defendingTeamId, matchup, 'PRIMARY_MATCHUP')),
    temporaryAssignments: [],
  }
  validateAssignments(authority, offensiveLineup, defensiveLineup)
  return authority
}

/** Adds only valid temporary responsibility changes, such as an active P&R switch. */
export function applyTemporaryDefenderOverrides(
  authority: DefensiveAuthority,
  effectiveMatchups: readonly PlayerMatchup[],
): DefensiveAuthority {
  const baseByOffensivePlayerId = new Map(authority.baseAssignments.map((entry) => [entry.offensivePlayerId, entry]))
  if (effectiveMatchups.length !== authority.baseAssignments.length
    || new Set(effectiveMatchups.map((entry) => entry.offensivePlayerId)).size !== effectiveMatchups.length) {
    throw new Error('Temporary defensive overrides must cover each active offensive player exactly once')
  }
  const temporaryAssignments: DefensiveAssignment[] = []
  for (const matchup of effectiveMatchups) {
    const base = baseByOffensivePlayerId.get(matchup.offensivePlayerId)
    if (base === undefined) throw new Error(`Temporary defensive target ${matchup.offensivePlayerId} is not active`)
    if (base.defenderId !== matchup.defensivePlayerId) {
      temporaryAssignments.push(assignment(authority.attackingTeamId, authority.defendingTeamId, matchup, 'TEMPORARY_OVERRIDE'))
    }
  }
  const result = { ...authority, temporaryAssignments }
  validateAssignments(result, authority.baseAssignments.map((entry) => entry.offensivePlayerId), authority.baseAssignments.map((entry) => entry.defenderId))
  const effectiveDefenders = effectiveMatchups.map((entry) => entry.defensivePlayerId)
  if (new Set(effectiveDefenders).size !== effectiveDefenders.length) throw new Error('Effective defensive assignments must remain one-to-one')
  return result
}

export function getPrimaryDefender(authority: DefensiveAuthority, offensivePlayerId: PlayerId): PlayerId | undefined {
  return authority.baseAssignments.find((entry) => entry.offensivePlayerId === offensivePlayerId)?.defenderId
}

export function getEffectiveDefender(authority: DefensiveAuthority, offensivePlayerId: PlayerId): PlayerId | undefined {
  return authority.temporaryAssignments.find((entry) => entry.offensivePlayerId === offensivePlayerId)?.defenderId
    ?? getPrimaryDefender(authority, offensivePlayerId)
}

/** Compatibility projection for existing movement, coverage, and MG7 consumers. */
export function getEffectiveMatchups(authority: DefensiveAuthority): readonly PlayerMatchup[] {
  return authority.baseAssignments.map((entry) => ({
    offensivePlayerId: entry.offensivePlayerId,
    defensivePlayerId: getEffectiveDefender(authority, entry.offensivePlayerId)!,
  }))
}

function assignment(attackingTeamId: TeamId, defendingTeamId: TeamId, matchup: PlayerMatchup, kind: DefensiveAssignment['kind']): DefensiveAssignment {
  return { attackingTeamId, defendingTeamId, offensivePlayerId: matchup.offensivePlayerId, defenderId: matchup.defensivePlayerId, kind, intent: 'GUARD' }
}

function lineupFor(lineups: MatchLineups, homeTeamId: TeamId, teamId: TeamId): readonly PlayerId[] {
  return teamId === homeTeamId ? lineups.home : lineups.away
}

function validateLineup(lineup: readonly PlayerId[], teamId: TeamId, spatial: SpatialState): void {
  if (lineup.length === 0 || new Set(lineup).size !== lineup.length) throw new Error(`Active lineup for Team ${teamId} must contain unique players`)
  for (const playerId of lineup) {
    const player = spatial.players.find((candidate) => candidate.playerId === playerId)
    if (player === undefined) throw new Error(`Active player ${playerId} is missing from SpatialState`)
    if (player.teamId !== teamId) throw new Error(`Active player ${playerId} does not belong to expected team ${teamId}`)
  }
}

function validateAssignments(authority: DefensiveAuthority, offensiveLineup: readonly PlayerId[], defensiveLineup: readonly PlayerId[]): void {
  const assignments = [...authority.baseAssignments, ...authority.temporaryAssignments]
  if (authority.baseAssignments.length !== offensiveLineup.length) throw new Error('Every active offensive player must have one primary defender')
  if (new Set(authority.baseAssignments.map((entry) => entry.offensivePlayerId)).size !== authority.baseAssignments.length
    || new Set(authority.baseAssignments.map((entry) => entry.defenderId)).size !== authority.baseAssignments.length) {
    throw new Error('Primary defensive assignments must be one-to-one')
  }
  for (const entry of assignments) {
    if (entry.attackingTeamId !== authority.attackingTeamId || entry.defendingTeamId !== authority.defendingTeamId
      || !offensiveLineup.includes(entry.offensivePlayerId) || !defensiveLineup.includes(entry.defenderId)) {
      throw new Error('Defensive assignment references an inactive player or invalid team')
    }
  }
  if (new Set(authority.temporaryAssignments.map((entry) => entry.offensivePlayerId)).size !== authority.temporaryAssignments.length
    || new Set(authority.temporaryAssignments.map((entry) => entry.defenderId)).size !== authority.temporaryAssignments.length) {
    throw new Error('Temporary defensive overrides must be one-to-one')
  }
}
