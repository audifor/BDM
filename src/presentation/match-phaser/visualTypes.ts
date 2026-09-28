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

/**
 * Off-ball / on-ball / defensive presentation intent labels. These are DERIVED, read-only
 * projections of engine state that already exists in MatchSessionState (offBallCut, screenIntent,
 * driveIntent, defensiveReaction, transitionIntent, offensiveAction, defensiveMatchups via the
 * engine's own pure calculateDefensiveAssignments). None of these labels are invented: when the
 * engine does not expose an explicit intent for a player, the label falls back to a small set of
 * trajectory-derived categories (e.g. 'moving' vs 'idle') rather than guessing a basketball intent.
 */
export type PresentationActionIntent =
  | 'idle'
  | 'spotUp'
  | 'cutRim'
  | 'cutSpace'
  | 'screenApproach'
  | 'screenSet'
  | 'screenRoll'
  | 'screenPop'
  | 'drive'
  | 'transitionLane'
  | 'dribble'
  | 'passPrep'
  | 'shotPrep'
  | 'moving'

export type PresentationDefensiveIntent =
  | 'onBall'
  | 'shuffle'
  | 'help'
  | 'recover'
  | 'boxOut'
  | 'transition'
  | 'idle'

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
  readonly isOffense: boolean
  /** Read-only projection of the engine's current per-player offensive intent, or a trajectory fallback. */
  readonly actionIntent: PresentationActionIntent
  /** Read-only projection of the engine's current per-player defensive intent, or a trajectory fallback. */
  readonly defensiveIntent: PresentationDefensiveIntent | undefined
  /** The opposing player this player is defending, from the engine's own calculateDefensiveAssignments. Debug only. */
  readonly defendingPlayerId: PlayerId | undefined
  /** The opposing player defending this player, when this player is on offense. Debug only. */
  readonly defendedByPlayerId: PlayerId | undefined
  /** Screen partner (screener<->user) when this player is currently part of a screen intent. Debug only. */
  readonly screenPartnerId: PlayerId | undefined
}

/**
 * Ball presentation states (MP1C). 'dribble'/'catch'/'shotFlight'/'rimInteraction'/'reboundLoose'/
 * 'reboundSecured'/'inbound'/'deadBall' are all presentation-only refinements of the same
 * underlying engine facts (ball.kind, and shotAttempt/rebound/turnover events); none of them can
 * change whether a shot goes in, a pass completes, or who ends up with the ball.
 */
export type PresentationBallState =
  | 'unassigned'
  | 'dribble'
  | 'held'
  | 'passFlight'
  | 'catch'
  | 'shotFlight'
  | 'rimInteraction'
  | 'reboundLoose'
  | 'reboundSecured'
  | 'inbound'
  | 'deadBall'

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
  /** True while a pass is visually in flight between two players. Presentation-only. */
  readonly isPassFlight: boolean
  /** True while a shot is visually in flight toward the rim. Presentation-only. */
  readonly isShotFlight: boolean
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

/** Debug-only spatial targets, read verbatim from engine intent state. Never used for gameplay. */
export interface PresentationDebugTargets {
  readonly screenTarget: PresentationPoint | undefined
  readonly driveTarget: PresentationPoint | undefined
  readonly passTargetPlayerId: PlayerId | undefined
  readonly shotTargetBasket: PresentationPoint | undefined
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
  readonly debugTargets: PresentationDebugTargets
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
