import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import type { CourtGeometry, CourtPosition } from '@/domain/court'

export interface MatchNextClockRules {
  readonly periodCount: number
  readonly periodSeconds: number
  readonly overtimeSeconds: number
  readonly shotClockSeconds: number
  /** Competition-owned rule input. Null/omitted means unresolved; never infer a reset. */
  readonly offensiveReboundShotClockSeconds?: number | null
}

export interface MatchNextPlayerProfile {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly primaryPosition: 'PG' | 'SG' | 'SF' | 'PF' | 'C'
  readonly physical: { readonly heightCm: number; readonly weightKg: number; readonly wingspanCm: number; readonly standingReachCm: number }
  readonly kinematics: { readonly maxSpeedMps: number; readonly accelerationMps2: number; readonly brakingMps2: number }
  readonly offense: { readonly usage: number; readonly rimAttack: number; readonly shooting: number; readonly creation: number; readonly ballSecurity: number }
  readonly passing?: { readonly accuracy: number; readonly vision: number; readonly timing: number }
  readonly defense: { readonly pointOfAttack: number; readonly interior: number; readonly mobility: number; readonly steal?: number }
  readonly rebounding: { readonly impact: number }
}

export interface MatchNextTacticalPlan {
  readonly pace: number
  readonly shotProfile: { readonly rim: number; readonly midRange: number; readonly threePoint: number }
  readonly defense: { readonly interior: number; readonly perimeter: number; readonly pickAndRollCoverage?: string }
  readonly featuredPlayerId?: PlayerId
}

export interface DefensiveMatchupOverride { readonly playerId: PlayerId; readonly opponentPlayerId: PlayerId }

export interface MatchSetup {
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly court: CourtGeometry
  readonly clockRules: MatchNextClockRules
  readonly homeSquad: readonly PlayerId[]
  readonly awaySquad: readonly PlayerId[]
  readonly initialLineups: { readonly home: readonly PlayerId[]; readonly away: readonly PlayerId[] }
  readonly players: readonly MatchNextPlayerProfile[]
  /** Optional static positions for test/debug scenarios; this is not a movement system. */
  readonly initialPlayerPositions?: readonly { readonly playerId: PlayerId; readonly position: CourtPosition }[]
  readonly tacticalPlans: { readonly home: MatchNextTacticalPlan; readonly away: MatchNextTacticalPlan }
  readonly defensiveMatchupOverrides: { readonly home: readonly DefensiveMatchupOverride[]; readonly away: readonly DefensiveMatchupOverride[] }
  readonly matchSeed: number
  readonly autonomousActions?: boolean
}

export function validateMatchSetup(setup: MatchSetup): void {
  if (setup.homeTeamId === setup.awayTeamId) throw new Error('Home and away teams must be different')
  if (!Number.isInteger(setup.clockRules.periodCount) || setup.clockRules.periodCount <= 0) throw new Error('Clock periodCount must be a positive integer')
  for (const field of ['periodSeconds', 'overtimeSeconds', 'shotClockSeconds'] as const) {
    if (!Number.isSafeInteger(setup.clockRules[field]) || setup.clockRules[field] <= 0) throw new Error(`Clock ${field} must be a positive integer number of seconds`)
  }
  const offensiveReboundReset = setup.clockRules.offensiveReboundShotClockSeconds
  if (offensiveReboundReset !== undefined && offensiveReboundReset !== null && (!Number.isFinite(offensiveReboundReset) || offensiveReboundReset <= 0 || !Number.isSafeInteger(offensiveReboundReset * 10))) {
    throw new Error('Clock offensiveReboundShotClockSeconds must be null or a positive number of seconds representable in tenths')
  }
  if (!Number.isInteger(setup.matchSeed) || setup.matchSeed < 0 || setup.matchSeed > 0xffff_ffff) throw new Error('matchSeed must be an unsigned 32-bit integer')
  const profiles = new Map<string, MatchNextPlayerProfile>()
  for (const profile of setup.players) {
    if (profiles.has(profile.playerId)) throw new Error(`Duplicate player profile: ${profile.playerId}`)
    for (const field of ['maxSpeedMps', 'accelerationMps2', 'brakingMps2'] as const) {
      if (!Number.isFinite(profile.kinematics[field]) || profile.kinematics[field] <= 0) throw new Error(`Player ${profile.playerId} has invalid kinematics ${field}`)
    }
    profiles.set(profile.playerId, profile)
  }
  const home = new Set(setup.homeSquad)
  const away = new Set(setup.awaySquad)
  if (home.size !== setup.homeSquad.length) throw new Error('Home squad contains duplicate player IDs')
  if (away.size !== setup.awaySquad.length) throw new Error('Away squad contains duplicate player IDs')
  for (const id of home) if (away.has(id)) throw new Error(`Player appears on both teams: ${id}`)
  for (const [side, squad, teamId] of [['home', setup.homeSquad, setup.homeTeamId], ['away', setup.awaySquad, setup.awayTeamId]] as const) {
    for (const id of squad) {
      const profile = profiles.get(id)
      if (profile === undefined) throw new Error(`${side} squad player ${id} has no profile`)
      if (profile.teamId !== teamId) throw new Error(`${side} squad player ${id} is assigned to the wrong team`)
    }
  }
  for (const [side, lineup, squad, teamId] of [
    ['home', setup.initialLineups.home, home, setup.homeTeamId],
    ['away', setup.initialLineups.away, away, setup.awayTeamId],
  ] as const) {
    if (lineup.length !== 5) throw new Error(`${side} lineup must contain exactly five players`)
    if (new Set(lineup).size !== lineup.length) throw new Error(`${side} lineup contains duplicate player IDs`)
    for (const id of lineup) {
      if (!squad.has(id)) throw new Error(`${side} lineup player ${id} is absent from its squad`)
      const profile = profiles.get(id)
      if (profile === undefined) throw new Error(`${side} lineup player ${id} has no profile`)
      if (profile.teamId !== teamId) throw new Error(`${side} lineup player ${id} is assigned to the wrong team`)
    }
  }
  for (const [side, overrides, defenders, attackers] of [
    ['home', setup.defensiveMatchupOverrides.home, new Set(setup.homeSquad), new Set(setup.awaySquad)],
    ['away', setup.defensiveMatchupOverrides.away, new Set(setup.awaySquad), new Set(setup.homeSquad)],
  ] as const) {
    const seenDefenders = new Set<PlayerId>()
    const seenAttackers = new Set<PlayerId>()
    for (const override of overrides) {
      if (!defenders.has(override.playerId)) throw new Error(`${side} defensive matchup defender ${override.playerId} is not on the defending team`)
      if (!attackers.has(override.opponentPlayerId)) throw new Error(`${side} defensive matchup attacker ${override.opponentPlayerId} is not on the opposing team`)
      if (seenDefenders.has(override.playerId)) throw new Error(`${side} defensive matchups assign defender ${override.playerId} more than once`)
      if (seenAttackers.has(override.opponentPlayerId)) throw new Error(`${side} defensive matchups assign attacker ${override.opponentPlayerId} more than once`)
      seenDefenders.add(override.playerId)
      seenAttackers.add(override.opponentPlayerId)
    }
  }
  for (const profile of setup.players) if (!home.has(profile.playerId) && !away.has(profile.playerId)) throw new Error(`Player profile ${profile.playerId} is absent from both squads`)
  const activeIds = new Set([...setup.initialLineups.home, ...setup.initialLineups.away])
  const initialPositions = setup.initialPlayerPositions ?? []
  if (new Set(initialPositions.map(({ playerId }) => playerId)).size !== initialPositions.length) throw new Error('Initial player positions contain duplicate player IDs')
  for (const entry of initialPositions) {
    if (!activeIds.has(entry.playerId)) throw new Error(`Initial position player ${entry.playerId} is not active`)
    if (!Number.isFinite(entry.position.x) || !Number.isFinite(entry.position.y) || entry.position.x < 0 || entry.position.x > setup.court.lengthMeters || entry.position.y < 0 || entry.position.y > setup.court.widthMeters) throw new Error(`Initial position for ${entry.playerId} is outside the court`)
  }
}

export function neutralFoundationPosition(side: 'home' | 'away', slot: number, court: CourtGeometry): CourtPosition {
  const xRatio = side === 'home' ? 0.3 : 0.7
  const rows = [0.2, 0.35, 0.5, 0.65, 0.8]
  return { x: court.lengthMeters * xRatio, y: court.widthMeters * rows[slot % 5]! }
}
