/**
 * Basketball Truth (Next) — canonical vs rendered truth frame. Read-only, debug-only.
 * CANONICAL = latest MatchEngine Next tick. RENDERED = what the renderer painted this animation frame.
 */

import type { PlayerId } from '@/domain/ids'
import type { NextRenderFrame } from './NextPresentationDirector'
import type { Pt } from './types'

export interface NextTruthPlayer {
  readonly playerId: PlayerId
  readonly side: 'home' | 'away'
  readonly isOffense: boolean
  readonly canonical: Pt
  readonly rendered: Pt | undefined
  readonly diffMeters: number | undefined
  readonly velocity: Pt
  readonly speedMps: number
  readonly movementTarget: Pt | undefined
  readonly urgency: string | undefined
  readonly facing: Pt
  readonly action: string
  readonly intentOwner: string | undefined
  readonly responsibility: string | undefined
  readonly decision: string | undefined
  readonly slot: string | undefined
  readonly guarding: PlayerId | undefined
  readonly guardedBy: PlayerId | undefined
  readonly ballRelation: string | undefined
  readonly transitionRole: string | undefined
  readonly reboundRole: string | undefined
}

export interface NextTruthFrame {
  readonly simulationTick: number
  readonly presentationFrame: number
  readonly period: number
  readonly gameClockSeconds: number
  readonly shotClockSeconds: number | undefined
  readonly score: { readonly home: number; readonly away: number }
  readonly possessionTeamId: string | undefined
  readonly possessionPhase: string | undefined
  readonly transition: string | undefined
  readonly canonicalEvents: readonly string[]
  readonly presentationEvents: readonly string[]
  readonly players: readonly NextTruthPlayer[]
  readonly ball: {
    readonly canonical: Pt
    readonly rendered: Pt | undefined
    readonly heightMeters: number
    readonly kind: string
    readonly owner: PlayerId | undefined
    readonly target: Pt | undefined
    readonly flight: string | undefined
  }
}

export function buildNextTruthFrame(
  frame: NextRenderFrame,
  rendered: { readonly players: ReadonlyMap<PlayerId, Pt>; readonly ball: Pt } | undefined,
  presentationFrame: number,
  presentationEvents: readonly string[],
): NextTruthFrame {
  const c = frame.canonical
  return {
    simulationTick: c.t,
    presentationFrame,
    period: c.period,
    gameClockSeconds: c.gameClockSeconds,
    shotClockSeconds: c.shotClockSeconds,
    score: c.score,
    possessionTeamId: c.possessionTeamId === undefined ? undefined : String(c.possessionTeamId),
    possessionPhase: c.possessionPhase,
    transition: c.transition === undefined ? undefined : `${c.transition.trigger}/${c.transition.advantage}`,
    canonicalEvents: c.events.map((e) => e.type),
    presentationEvents,
    players: c.players.map((p) => {
      const r = rendered?.players.get(p.playerId)
      return {
        playerId: p.playerId,
        side: p.side,
        isOffense: p.isOffense,
        canonical: p.position,
        rendered: r,
        diffMeters: r === undefined ? undefined : Math.hypot(r.x - p.position.x, r.y - p.position.y),
        velocity: p.velocity,
        speedMps: p.speedMps,
        movementTarget: p.intentTarget,
        urgency: p.intentUrgency,
        facing: p.facing,
        action: [p.hasBall ? 'BALL' : undefined, p.responsibility, p.decision].filter((x) => x !== undefined).join('/') || (p.isOffense ? 'offBall' : 'defend'),
        intentOwner: p.intentOwner,
        responsibility: p.responsibility,
        decision: p.decision,
        slot: p.slot,
        guarding: p.guarding,
        guardedBy: p.guardedBy,
        ballRelation: p.ballRelation,
        transitionRole: p.transitionRole,
        reboundRole: p.reboundRole,
      }
    }),
    ball: {
      canonical: c.ball.position,
      rendered: rendered?.ball,
      heightMeters: c.ball.heightMeters,
      kind: c.ball.kind,
      owner: c.ball.ownerPlayerId,
      target: c.ball.flight?.target,
      flight: c.ball.flight === undefined ? undefined : `${c.ball.flight.kind} ${c.ball.flight.releaseT}->${c.ball.flight.arrivalT}`,
    },
  }
}
