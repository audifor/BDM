/**
 * Presentation Next contract — the ONLY thing the Phaser layer reads from MatchEngine Next.
 *
 *   MatchEngine Next (MatchState) -> toFrame() (the engine's own read-only MatchFrame)
 *     -> MatchNextPresentationBridge -> NextTickFrame (this file)
 *     -> NextPresentationDirector -> Phaser
 *
 * Everything is in canonical METRES (court coordinates), never percent. Nothing here decides possession, passes,
 * shots, rebounds, the clock or the score: fields are copied verbatim from the engine frame.
 */

import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchNextEvent } from '@/engine/match-next'

export interface Pt {
  readonly x: number
  readonly y: number
}

export interface NextCourt {
  readonly lengthMeters: number
  readonly widthMeters: number
  readonly threePointArcRadiusMeters: number
  readonly threePointCornerOffsetMeters: number
  readonly baskets: { readonly left: Pt; readonly right: Pt }
}

export interface NextPlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly side: 'home' | 'away'
  readonly label: string
  readonly jersey: number
  readonly position: Pt
  readonly velocity: Pt
  readonly speedMps: number
  /** Unit vector the engine says the player faces. */
  readonly facing: Pt
  readonly isOffense: boolean
  readonly hasBall: boolean
  /** Engine movement intent: where the engine is sending him and how urgently. */
  readonly intentTarget: Pt | undefined
  readonly intentUrgency: string | undefined
  readonly intentFacing: string | undefined
  readonly intentOwner: string | undefined
  readonly responsibility: string | undefined
  readonly decision: string | undefined
  /** Offensive slot name (BALL, STRONG_CORNER, ...) when the offensive structure assigned one. */
  readonly slot: string | undefined
  /** Attacker this player guards / defender guarding this player. */
  readonly guarding: PlayerId | undefined
  readonly guardedBy: PlayerId | undefined
  readonly ballRelation: string | undefined
  readonly transitionRole: string | undefined
  readonly transitionTarget: Pt | undefined
  readonly reboundRole: string | undefined
  readonly reboundTarget: Pt | undefined
}

export type NextBallKind = 'HELD' | 'PASS_IN_FLIGHT' | 'SHOT_IN_FLIGHT' | 'REBOUNDABLE' | 'LOOSE' | 'DEAD' | 'INBOUND' | 'JUMP_BALL'

export interface NextBall {
  readonly kind: NextBallKind
  readonly position: Pt
  readonly heightMeters: number
  readonly ownerPlayerId: PlayerId | undefined
  readonly flight: { readonly kind: 'pass' | 'shot' | 'rebound'; readonly from: Pt; readonly target: Pt; readonly releaseT: number; readonly arrivalT: number } | undefined
  readonly deadReason: string | undefined
  readonly shotValue: 2 | 3 | undefined
  readonly shotProbability: number | undefined
}

export interface NextTickFrame {
  /** Engine tick (0.1 s each). */
  readonly t: number
  readonly period: number
  readonly gameClockSeconds: number
  readonly shotClockSeconds: number | undefined
  readonly gameRunning: boolean
  readonly score: { readonly home: number; readonly away: number }
  readonly court: NextCourt
  readonly possessionTeamId: TeamId | undefined
  readonly possessionPhase: string | undefined
  readonly possessionStartReason: string | undefined
  readonly attackingBasket: Pt | undefined
  readonly players: readonly NextPlayer[]
  readonly ball: NextBall
  /** Offensive structure slots (canonical 5-out targets) when active. */
  readonly offenseSlots: readonly { readonly slot: string; readonly position: Pt }[]
  readonly transition: { readonly trigger: string; readonly advantage: string; readonly teamId: TeamId } | undefined
  readonly currentAction: string | undefined
  readonly isComplete: boolean
  /** Engine events emitted after the previous frame, in engine order. */
  readonly events: readonly MatchNextEvent[]
}

export interface NextPlayerLabel {
  readonly label: string
  readonly jersey: number
}
export type NextPlayerLabels = ReadonlyMap<PlayerId, NextPlayerLabel>
