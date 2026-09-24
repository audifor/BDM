import type { PlayerId, TeamId } from '@/domain/ids'
import { createCourtGeometry, courtRulesetForEcosystem, isInsideCourt, type CourtGeometry, type CourtPosition } from '@/domain/court'
import type { SportsCategory } from '@/domain/primitives'
import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { MatchLineups } from './MatchEngine'
import type { MatchPlayerProfiles } from './MatchPlayerProfile'

const SLOT_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const RIGHT_ATTACKING_FORMATION: Readonly<Record<(typeof SLOT_POSITIONS)[number], CourtPosition>> = {
  PG: { x: 0.42, y: 0.5 },
  SG: { x: 0.56, y: 0.2 },
  SF: { x: 0.56, y: 0.8 },
  PF: { x: 0.66, y: 0.34 },
  C: { x: 0.66, y: 0.66 },
}

export interface SpatialPlayerState {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly position: CourtPosition
}

/** No player handler is selected at session creation, so the ball starts unassigned at center. */
export type BallSpatialState =
  | { readonly kind: 'unassigned'; readonly position: CourtPosition }
  | { readonly kind: 'loose'; readonly position: CourtPosition }
  | { readonly kind: 'playerControlled'; readonly playerId: PlayerId; readonly teamId: TeamId; readonly position: CourtPosition }

export interface SpatialState {
  readonly court: CourtGeometry
  readonly players: readonly SpatialPlayerState[]
  readonly ball: BallSpatialState
}

export function createInitialSpatialState(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly lineups: MatchLineups
  readonly playerProfiles: MatchPlayerProfiles
  readonly ecosystemKind: SportsEcosystemKind
  readonly category: SportsCategory
}): SpatialState {
  const court = createCourtGeometry(courtRulesetForEcosystem(input.ecosystemKind, input.category))
  const homePositions = lineupPositions(input.lineups.home, input.homeTeamId, input.homeTeamId, input.awayTeamId, input.playerProfiles.home, court)
  const awayPositions = lineupPositions(input.lineups.away, input.awayTeamId, input.homeTeamId, input.awayTeamId, input.playerProfiles.away, court)
  const ballPosition = { x: court.lengthMeters / 2, y: court.widthMeters / 2 }
  return { court, players: [...homePositions, ...awayPositions], ball: { kind: 'unassigned', position: ballPosition } }
}

export function attackingBasketForTeam(input: {
  readonly teamId: TeamId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly period: number
  readonly court: CourtGeometry
}): CourtPosition {
  const homeAttacksRight = input.period <= 2
  if (input.teamId !== input.homeTeamId && input.teamId !== input.awayTeamId) throw new Error(`Team ${input.teamId} is not in this match`)
  const attacksRight = input.teamId === input.homeTeamId ? homeAttacksRight : !homeAttacksRight
  return attacksRight ? input.court.baskets.right : input.court.baskets.left
}

export function defendingBasketForTeam(input: {
  readonly teamId: TeamId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly period: number
  readonly court: CourtGeometry
}): CourtPosition {
  const attacking = attackingBasketForTeam(input)
  return attacking === input.court.baskets.right ? input.court.baskets.left : input.court.baskets.right
}

export function isSpatialStateInsideCourt(spatial: SpatialState): boolean {
  const ball = spatial.ball
  return spatial.players.every((player) => isInsideCourt(player.position, spatial.court))
    && isInsideCourt(ball.position, spatial.court)
    && (ball.kind !== 'playerControlled' || spatial.players.some((player) =>
      player.playerId === ball.playerId
      && player.teamId === ball.teamId
      && player.position.x === ball.position.x
      && player.position.y === ball.position.y))
}

export function controlBallByPlayer(spatial: SpatialState, playerId: PlayerId): SpatialState {
  const player = spatial.players.find((candidate) => candidate.playerId === playerId)
  if (player === undefined) throw new Error(`Spatial player ${playerId} is not active`)
  return { ...spatial, ball: { kind: 'playerControlled', playerId: player.playerId, teamId: player.teamId, position: player.position } }
}

export function applySpatialSubstitution(
  spatial: SpatialState,
  teamId: TeamId,
  playerOutId: PlayerId,
  playerInId: PlayerId,
): SpatialState {
  const outgoingIndex = spatial.players.findIndex((player) => player.playerId === playerOutId && player.teamId === teamId)
  if (outgoingIndex < 0) throw new Error(`Spatial player ${playerOutId} is not active for team ${teamId}`)
  const outgoing = spatial.players[outgoingIndex]!
  const incoming: SpatialPlayerState = { playerId: playerInId, teamId, position: outgoing.position }
  const ball = spatial.ball.kind === 'playerControlled' && spatial.ball.playerId === playerOutId
    ? { ...spatial.ball, playerId: playerInId, teamId, position: incoming.position }
    : spatial.ball
  return {
    ...spatial,
    players: spatial.players.map((player, index) => index === outgoingIndex ? incoming : player),
    ball,
  }
}

function lineupPositions(
  lineup: readonly PlayerId[],
  teamId: TeamId,
  homeTeamId: TeamId,
  awayTeamId: TeamId,
  profiles: MatchPlayerProfiles['home'],
  court: CourtGeometry,
): readonly SpatialPlayerState[] {
  const attacksRight = attackingBasketForTeam({ teamId, homeTeamId, awayTeamId, period: 1, court }) === court.baskets.right
  const assigned = new Set<(typeof SLOT_POSITIONS)[number]>()
  return lineup.map((playerId) => {
    const profile = profiles.find((candidate) => candidate.playerId === playerId)
    if (profile === undefined) throw new Error(`Active player ${playerId} has no profile for spatial bootstrap`)
    const preferred = profile.primaryPosition
    const slot = !assigned.has(preferred) ? preferred : SLOT_POSITIONS.find((position) => !assigned.has(position))!
    assigned.add(slot)
    const formation = RIGHT_ATTACKING_FORMATION[slot]
    const forwardX = formation.x * court.lengthMeters
    const leftX = court.lengthMeters - forwardX
    const y = formation.y * court.widthMeters
    return { playerId, teamId, position: { x: attacksRight ? forwardX : leftX, y } }
  })
}
