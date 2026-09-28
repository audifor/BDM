/**
 * Pure, read-only projection: MatchSessionState / MatchEvent -> MatchPresentationState / MatchPresentationEvent.
 *
 * Every function in this file is a pure function of its inputs. None of them:
 *  - read or write any MatchSession/MatchSessionState by reference (they only read the passed-in state),
 *  - call into any RandomSource,
 *  - decide any sporting outcome (shot made/missed, pass completed, rebound owner, possession change,
 *    score, foul, substitution) — those are always copied verbatim from MatchSessionState / MatchEvent.
 *
 * This is the only file in the POC that imports from `@/engine/match`. The renderer (Phaser scene,
 * bridge glue, interpolation) never imports MatchEngine types directly — it only sees the contract
 * types in visualTypes.ts. That is the seam that lets the renderer be replaced without touching
 * MatchEngine, and lets MatchEngine evolve without the renderer needing to know its internals.
 */

import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchEvent, MatchSessionState, OffensiveAction } from '@/engine/match'
import { getSpatialPossessionView } from '@/engine/match'
import type {
  MatchPresentationEvent,
  MatchPresentationEventKind,
  MatchPresentationState,
  PresentationBall,
  PresentationBallState,
  PresentationCourt,
  PresentationPlayer,
  PresentationPoint,
  PresentationSide,
} from './visualTypes'

/** Supplied by the application layer (e.g. from GameWorld.players), never derived from gameplay ratings. */
export interface PresentationPlayerLabel {
  readonly label: string
  readonly jersey: number
}

export type PresentationPlayerLabels = ReadonlyMap<PlayerId, PresentationPlayerLabel>

function toPercent(position: { readonly x: number; readonly y: number }, lengthMeters: number, widthMeters: number): PresentationPoint {
  return {
    xPercent: (position.x / lengthMeters) * 100,
    yPercent: (position.y / widthMeters) * 100,
  }
}

function sideForTeam(teamId: TeamId, homeTeamId: TeamId): PresentationSide {
  return teamId === homeTeamId ? 'home' : 'away'
}

/** Orientation is derived purely from the player's own velocity vector; undefined when stationary. */
function orientationFromVelocity(velocity: { readonly x: number; readonly y: number }): number | undefined {
  const speed = Math.hypot(velocity.x, velocity.y)
  if (speed < 1e-6) return undefined
  return Math.atan2(velocity.y, velocity.x)
}

function ballStateFor(ball: MatchSessionState['spatial']['ball']): PresentationBallState {
  if (ball.kind === 'unassigned') return 'unassigned'
  if (ball.kind === 'loose') return 'loose'
  return 'held'
}

function fallbackLabel(playerId: PlayerId): PresentationPlayerLabel {
  return { label: String(playerId).slice(0, 8), jersey: 0 }
}

/**
 * Builds one MatchPresentationState from the engine's current MatchSessionState. Called once per
 * MatchEngine step by the demo driver; the renderer never calls MatchEngine itself.
 */
export function toMatchPresentationState(
  state: MatchSessionState,
  labels: PresentationPlayerLabels,
): MatchPresentationState {
  const { court } = state.spatial
  const presentationCourt: PresentationCourt = {
    lengthMeters: court.lengthMeters,
    widthMeters: court.widthMeters,
    baskets: {
      left: toPercent(court.baskets.left, court.lengthMeters, court.widthMeters),
      right: toPercent(court.baskets.right, court.lengthMeters, court.widthMeters),
    },
  }

  const ball = state.spatial.ball
  const ownerPlayerId = ball.kind === 'playerControlled' ? ball.playerId : undefined
  const ownerTeamId = ball.kind === 'playerControlled' ? ball.teamId : undefined

  const players: readonly PresentationPlayer[] = state.spatial.players.map((player) => {
    const meta = labels.get(player.playerId) ?? fallbackLabel(player.playerId)
    return {
      playerId: player.playerId,
      teamId: player.teamId,
      side: sideForTeam(player.teamId, state.homeTeamId),
      label: meta.label,
      jersey: meta.jersey,
      position: toPercent(player.position, court.lengthMeters, court.widthMeters),
      speedMetersPerSecond: Math.hypot(player.velocity.x, player.velocity.y),
      orientationRadians: orientationFromVelocity(player.velocity),
      hasBall: ownerPlayerId === player.playerId,
    }
  })

  const presentationBall: PresentationBall = {
    position: toPercent(ball.position, court.lengthMeters, court.widthMeters),
    state: ballStateFor(ball),
    ownerPlayerId,
    ownerTeamId,
    visualHeight: 0,
  }

  const possessionView = getSpatialPossessionView({
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    attackingTeamId: state.attackingTeamId,
    period: state.period,
    spatial: state.spatial,
  })

  return {
    simulationTick: state.nextSequence,
    court: presentationCourt,
    players,
    ball: presentationBall,
    clock: {
      period: state.period,
      periodCount: state.clockRules.periodCount,
      clockSecondsRemaining: state.clockSecondsRemaining,
      periodSeconds: state.clockRules.periodSeconds,
    },
    score: { home: state.homeScore, away: state.awayScore },
    possession: {
      offensiveTeamId: possessionView.offensiveTeamId,
      defensiveTeamId: possessionView.defensiveTeamId,
      ballHandlerId: possessionView.ballHandlerId,
    },
    isComplete: state.isComplete,
    currentActionKind: describeOffensiveAction(state.offensiveAction),
  }
}

function describeOffensiveAction(action: OffensiveAction | undefined): string | undefined {
  return action?.kind
}

const EVENT_KIND_MAP: Partial<Record<MatchEvent['type'], MatchPresentationEventKind>> = {
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  shotMade: 'shotMade',
  shotMissed: 'shotMissed',
  turnover: 'turnover',
  passCompleted: 'passCompleted',
  foul: 'foul',
  freeThrowMade: 'freeThrowMade',
  freeThrowMissed: 'freeThrowMissed',
  rebound: 'rebound',
  substitution: 'substitution',
  gameEnd: 'gameEnd',
}

/**
 * Converts one canonical MatchEvent into a MatchPresentationEvent. This is a 1:1 field copy plus
 * a kind relabeling — it introduces no new information and resolves no new outcome. The renderer
 * uses `kind` to pick an animation (e.g. a made-basket flash), never to decide whether the shot
 * went in; that boolean already lives in the event's `kind` itself (shotMade vs shotMissed).
 */
export function toMatchPresentationEvent(event: MatchEvent): MatchPresentationEvent {
  const kind = EVENT_KIND_MAP[event.type]
  if (kind === undefined) throw new Error(`Unsupported MatchEvent type for presentation: ${event.type}`)

  const base = {
    kind,
    sequence: event.sequence,
    period: event.period,
    clockSecondsRemaining: event.clockSecondsRemaining,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
  }

  switch (event.type) {
    case 'shotMade':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: event.assistPlayerId, points: event.points }
    case 'shotMissed':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: event.blockedByPlayerId, points: undefined }
    case 'turnover':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: event.stealPlayerId, points: undefined }
    case 'passCompleted':
      return { ...base, teamId: event.teamId, playerId: event.passerPlayerId, secondaryPlayerId: event.receiverPlayerId, points: undefined }
    case 'foul':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: undefined, points: undefined }
    case 'freeThrowMade':
    case 'freeThrowMissed':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: undefined, points: undefined }
    case 'rebound':
      return { ...base, teamId: event.teamId, playerId: event.playerId, secondaryPlayerId: undefined, points: undefined }
    case 'substitution':
      return { ...base, teamId: event.teamId, playerId: event.playerInId, secondaryPlayerId: event.playerOutId, points: undefined }
    case 'periodStart':
    case 'periodEnd':
    case 'gameEnd':
      return { ...base, teamId: undefined, playerId: undefined, secondaryPlayerId: undefined, points: undefined }
    default:
      throw new Error(`Unsupported MatchEvent type for presentation: ${(event as MatchEvent).type}`)
  }
}

/** Converts every new engine event from one step into presentation events, preserving order. */
export function toMatchPresentationEvents(events: readonly MatchEvent[]): readonly MatchPresentationEvent[] {
  return events.map(toMatchPresentationEvent)
}
