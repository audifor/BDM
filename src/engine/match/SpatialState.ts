import type { PlayerId, TeamId } from '@/domain/ids'
import { createCourtGeometry, courtRulesetForEcosystem, distanceBetween, isInsideCourt, type CourtGeometry, type CourtPosition } from '@/domain/court'
import { BASKETBALL_POSITIONS, type SportsCategory } from '@/domain/primitives'
import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { MatchLineups } from './MatchEngine'
import type { MatchPlayerProfiles } from './MatchPlayerProfile'

const SLOT_POSITIONS = BASKETBALL_POSITIONS
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

export interface SpatialPossessionView {
  readonly offensiveTeamId: TeamId
  readonly defensiveTeamId: TeamId
  readonly attackingBasket: CourtPosition
  readonly ballHandlerId?: PlayerId
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

/** Derives spatial offense/defense from MatchSession possession authority; no second possession state is stored. */
export function getSpatialPossessionView(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly spatial: SpatialState
}): SpatialPossessionView {
  if (input.attackingTeamId !== input.homeTeamId && input.attackingTeamId !== input.awayTeamId) {
    throw new Error(`Attacking team ${input.attackingTeamId} is not in this match`)
  }
  const defensiveTeamId = input.attackingTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const ballHandlerId = input.spatial.ball.kind === 'playerControlled' ? input.spatial.ball.playerId : undefined
  return {
    offensiveTeamId: input.attackingTeamId,
    defensiveTeamId,
    attackingBasket: attackingBasketForTeam({
      teamId: input.attackingTeamId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      period: input.period,
      court: input.spatial.court,
    }),
    ...(ballHandlerId === undefined ? {} : { ballHandlerId }),
  }
}

export function isSpatialStateCoherentWithPossession(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly spatial: SpatialState
}): boolean {
  const ball = input.spatial.ball
  return (input.attackingTeamId === input.homeTeamId || input.attackingTeamId === input.awayTeamId)
    && isSpatialStateInsideCourt(input.spatial)
    && (ball.kind !== 'playerControlled' || ball.teamId === input.attackingTeamId)
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

export function releaseSpatialBall(spatial: SpatialState): SpatialState {
  return { ...spatial, ball: { kind: 'unassigned', position: spatial.ball.position } }
}

/** Moves one active player toward a legal court target by at most maxDistance meters. */
export function movePlayerToward(
  spatial: SpatialState,
  playerId: PlayerId,
  target: CourtPosition,
  maxDistance: number,
): SpatialState {
  const playerIndex = spatial.players.findIndex((candidate) => candidate.playerId === playerId)
  if (playerIndex < 0) throw new Error(`Spatial player ${playerId} is not active`)
  if (!isInsideCourt(target, spatial.court)) throw new RangeError('Movement target must be inside the court')
  if (!Number.isFinite(maxDistance) || maxDistance < 0) throw new RangeError('Maximum movement distance must be finite and non-negative')

  const player = spatial.players[playerIndex]!
  const distance = distanceBetween(player.position, target)
  if (distance === 0 || maxDistance === 0) return spatial

  const distanceMoved = Math.min(distance, maxDistance)
  const ratio = distanceMoved / distance
  const position = {
    x: player.position.x + (target.x - player.position.x) * ratio,
    y: player.position.y + (target.y - player.position.y) * ratio,
  }
  const players = spatial.players.map((candidate, index) => index === playerIndex ? { ...candidate, position } : candidate)
  const ball = spatial.ball.kind === 'playerControlled' && spatial.ball.playerId === playerId
    ? { ...spatial.ball, position }
    : spatial.ball
  return { ...spatial, players, ball }
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
