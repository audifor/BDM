/**
 * MatchPresentationState / MatchPresentationEvent — the presentation contract.
 *
 * This is the ONLY boundary the Phaser POC is allowed to read from MatchEngine Next.
 * It is a read-only, derived projection of MatchSessionState / MatchEvent. It contains
 * NO gameplay logic: no probabilities, no decisions, no rules. Every field here is either
 * copied verbatim from the engine's canonical state or computed with pure unit/projection
 * math (metres -> percent-of-court, degrees from a velocity vector, etc).
 *
 * MatchEngine Next -> MatchPresentationState / MatchPresentationEvent -> Renderer (Phaser or
 * anything else). Swapping the renderer never requires touching MatchEngine; swapping
 * MatchEngine's internals never requires touching the renderer as long as this contract
 * still gets built from MatchSessionState.
 *
 * See MatchPresentationBridge.ts for the (pure, side-effect free) functions that build these
 * types from `@/engine/match` state and events.
 */

import type { PlayerId, TeamId } from '@/domain/ids'

/** 0..100 court-relative coordinates, matching the existing SpatialVisualBridge convention. */
export interface PresentationPoint {
  readonly xPercent: number
  readonly yPercent: number
}

export type PresentationSide = 'home' | 'away'

export interface PresentationPlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly side: PresentationSide
  readonly label: string
  readonly jersey: number
  readonly position: PresentationPoint
  /** Metres/second in engine space; renderer may use magnitude for animation pacing only. */
  readonly speedMetersPerSecond: number
  /** Radians, screen convention (0 = facing +x / right). Undefined when the player is stationary. */
  readonly orientationRadians: number | undefined
  readonly hasBall: boolean
}

export type PresentationBallState = 'unassigned' | 'loose' | 'held' | 'inFlight'

export interface PresentationBall {
  readonly position: PresentationPoint
  readonly state: PresentationBallState
  readonly ownerPlayerId: PlayerId | undefined
  readonly ownerTeamId: TeamId | undefined
  /**
   * 0..1 purely-visual arc height for in-flight passes/shots. Derived by interpolation.ts from
   * progress along a flight, never by any gameplay computation — it does not affect whether a
   * shot is made or a pass completes, both of which are engine outcomes.
   */
  readonly visualHeight: number
}

export interface PresentationClock {
  readonly period: number
  readonly periodCount: number
  readonly clockSecondsRemaining: number
  readonly periodSeconds: number
}

export interface PresentationScore {
  readonly home: number
  readonly away: number
}

export interface PresentationCourt {
  readonly lengthMeters: number
  readonly widthMeters: number
  readonly baskets: {
    readonly left: PresentationPoint
    readonly right: PresentationPoint
  }
}

export interface PresentationPossession {
  readonly offensiveTeamId: TeamId
  readonly defensiveTeamId: TeamId
  readonly ballHandlerId: PlayerId | undefined
}

/** One immutable rendering-ready snapshot, derived from exactly one MatchSessionState. */
export interface MatchPresentationState {
  /** Monotonically increasing MatchEngine tick this snapshot was derived from (nextSequence at capture time). */
  readonly simulationTick: number
  readonly court: PresentationCourt
  readonly players: readonly PresentationPlayer[]
  readonly ball: PresentationBall
  readonly clock: PresentationClock
  readonly score: PresentationScore
  readonly possession: PresentationPossession
  readonly isComplete: boolean
  /** Current possession-level offensive action, for label/debug display only (e.g. "PICK_AND_ROLL"). */
  readonly currentActionKind: string | undefined
}

export type MatchPresentationEventKind =
  | 'periodStart'
  | 'periodEnd'
  | 'passCompleted'
  | 'shotAttempt'
  | 'shotMade'
  | 'shotMissed'
  | 'rebound'
  | 'turnover'
  | 'foul'
  | 'freeThrowMade'
  | 'freeThrowMissed'
  | 'substitution'
  | 'transition'
  | 'gameEnd'

/**
 * A presentation-facing event, derived 1:1 from a MatchEvent (or, for 'shotAttempt', synthesized
 * purely from the already-decided MatchEvent that reports the shot's outcome — see
 * MatchPresentationBridge.ts). It never introduces a new outcome: made/missed/turnover/rebound
 * ownership all come verbatim from the source MatchEvent's fields.
 */
export interface MatchPresentationEvent {
  readonly kind: MatchPresentationEventKind
  readonly sequence: number
  readonly period: number
  readonly clockSecondsRemaining: number
  readonly teamId: TeamId | undefined
  readonly playerId: PlayerId | undefined
  readonly secondaryPlayerId: PlayerId | undefined
  readonly points: 2 | 3 | undefined
  readonly homeScore: number
  readonly awayScore: number
}
