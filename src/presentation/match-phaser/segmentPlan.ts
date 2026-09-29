/**
 * segmentPlan.ts — BT1 segment choreography (pure, deterministic, headless-testable).
 *
 * A PresentationSegment is one MatchEngine step: "move all ten players for `simSeconds`, then the
 * ordered events resolve at the END positions". This module turns that into a wall-clock timeline
 * that keeps the engine's own ORDER and END STATE:
 *
 *   [ lead-in pickup ]                (only when the engine hands the ball to a player who was not holding it)
 *   [ movement phase: players travel start -> engine end position ]
 *   [ event legs: pass / shot / rim / rebound flights, one after the other ]
 *   [ settle ]
 *
 * What is NOT invented here: end positions, who owns the ball at the end, the score, the event
 * order, made/missed. What IS presentation-only: how long the walk takes on screen, the speed
 * profile of each player between the two engine positions, and the ball's flight legs between the
 * positions the engine already decided. Every ball leg is anchored to visible bodies (a player's
 * rendered position or the rim), so the ball can never be drawn disconnected from the action.
 */

import type { PlayerId } from '@/domain/ids'
import type {
  MatchPresentationEvent,
  MatchPresentationState,
  PresentationBallState,
  PresentationPlayer,
  PresentationPoint,
  PresentationSegment,
} from './visualTypes'

export interface Pt {
  x: number
  y: number
}

export type BallRef = { readonly kind: 'pt'; readonly p: Pt } | { readonly kind: 'player'; readonly id: PlayerId } | { readonly kind: 'rim' } | { readonly kind: 'floorUnderRim' }

export type BallLegKind =
  | 'pickup'
  | 'carry'
  | 'pass'
  | 'handoff'
  | 'steal'
  | 'badPass'
  | 'shot'
  | 'freeThrow'
  | 'netDrop'
  | 'reboundFlight'
  | 'hold'

export interface BallLeg {
  readonly kind: BallLegKind
  readonly startMs: number
  readonly endMs: number
  readonly from: BallRef
  readonly to: BallRef
  /** Peak visual height as a fraction of the shot arc (0 = rolling/carried, 1 = full jump-shot arc). */
  readonly arc: number
  /** The player holding the ball during the leg (carry/hold only). */
  readonly owner: PlayerId | undefined
  readonly state: PresentationBallState
  readonly label: string
}

export type BeatKind =
  | 'substitution'
  | 'periodEnd'
  | 'periodStart'
  | 'passRelease'
  | 'catch'
  | 'shotRelease'
  | 'rim'
  | 'shotMade'
  | 'shotMissed'
  | 'rebound'
  | 'turnover'
  | 'foul'
  | 'freeThrow'
  | 'inbound'
  | 'handoff'

export interface PlanBeat {
  readonly atMs: number
  readonly kind: BeatKind
  readonly label: string
  /** The engine event this beat realises (undefined for purely visual beats such as a catch). */
  readonly event: MatchPresentationEvent | undefined
}

export interface PlayerMotion {
  readonly playerId: PlayerId
  readonly from: Pt
  readonly to: Pt
  readonly distance: number
  readonly delayMs: number
  readonly goMs: number
}

export interface SegmentPlan {
  readonly segment: PresentationSegment
  readonly courtLength: number
  readonly courtWidth: number
  readonly rim: Pt
  readonly floorUnderRim: Pt
  readonly leadMs: number
  readonly moveMs: number
  readonly durationMs: number
  readonly motions: ReadonlyMap<PlayerId, PlayerMotion>
  readonly legs: readonly BallLeg[]
  readonly beats: readonly PlanBeat[]
  /** Score changes in wall-clock order; the HUD shows `from.score` until the first entry is reached. */
  readonly scoreTimeline: readonly { readonly atMs: number; readonly home: number; readonly away: number }[]
  /** Where the ball is drawn at the very end of the segment (used as the start of the next lead-in). */
  readonly restingBall: Pt
}

/** Presentation timing knobs. Pure rendering constants; none of them reach MatchEngine. */
export const SEGMENT_TIMING = {
  /** Mean travel speed floor/ceiling (m/s): never slower than a jog, never faster than a sprint. */
  minMeanSpeedMps: 3,
  maxMeanSpeedMps: 5.6,
  accelMs: 350,
  decelMs: 450,
  reactionOffenseMaxMs: 120,
  reactionDefenseMinMs: 140,
  reactionDefenseMaxMs: 260,
  passSpeedMps: 15,
  passMinMs: 280,
  passMaxMs: 800,
  shotSpeedMps: 9,
  shotMinMs: 550,
  shotMaxMs: 1000,
  reboundSpeedMps: 7,
  reboundMinMs: 500,
  reboundMaxMs: 1000,
  netDropMs: 320,
  freeThrowMs: 650,
  foulPauseMs: 500,
  pickupSpeedMps: 13,
  pickupMinMs: 350,
  pickupMaxMs: 900,
  stealMs: 300,
  stealMaxMs: 1200,
  stealSpeedMps: 11,
  badPassMs: 500,
  handoffMs: 240,
  settleMs: 180,
  catchMs: 140,
} as const

const SHOT_ARC_METERS = 1.6
const PASS_ARC_METERS = 0.35
const REBOUND_ARC_METERS = 1.1
export const MAX_BALL_HEIGHT_METERS = SHOT_ARC_METERS

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Small deterministic hash (0..1) so reaction delays vary per player but replay identically. */
function hash01(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

export function toMeters(point: PresentationPoint, lengthMeters: number, widthMeters: number): Pt {
  return { x: (point.xPercent / 100) * lengthMeters, y: (point.yPercent / 100) * widthMeters }
}

export function toPercentPoint(p: Pt, lengthMeters: number, widthMeters: number): PresentationPoint {
  return { xPercent: (p.x / lengthMeters) * 100, yPercent: (p.y / widthMeters) * 100 }
}

/** Trapezoidal position fraction (0..1) along a straight move of `goMs`, with short accel and decel. */
export function motionFraction(elapsedMs: number, goMs: number): number {
  if (goMs <= 0) return 1
  const t = clamp(elapsedMs, 0, goMs)
  if (t >= goMs) return 1
  const ta = Math.min(SEGMENT_TIMING.accelMs, goMs / 3)
  const td = Math.min(SEGMENT_TIMING.decelMs, goMs / 3)
  const vPeak = 1 / (goMs - ta / 2 - td / 2)
  if (t <= ta) return (0.5 * vPeak * t * t) / ta
  if (t <= goMs - td) return 0.5 * vPeak * ta + vPeak * (t - ta)
  const remaining = goMs - t
  return 1 - (0.5 * vPeak * remaining * remaining) / td
}

/** Instantaneous speed as a multiple of the mean speed (0 at rest, ~1.1-1.3 at cruise). */
export function motionSpeedFactor(elapsedMs: number, goMs: number): number {
  if (goMs <= 0 || elapsedMs <= 0 || elapsedMs >= goMs) return 0
  const ta = Math.min(SEGMENT_TIMING.accelMs, goMs / 3)
  const td = Math.min(SEGMENT_TIMING.decelMs, goMs / 3)
  const vPeak = 1 / (goMs - ta / 2 - td / 2)
  const meanSpeed = 1 / goMs
  if (elapsedMs <= ta) return ((vPeak * elapsedMs) / ta) / meanSpeed
  if (elapsedMs <= goMs - td) return vPeak / meanSpeed
  return ((vPeak * (goMs - elapsedMs)) / td) / meanSpeed
}

interface PlayerStart {
  readonly pos: Pt
  readonly isOffense: boolean
}

function startPositions(segment: PresentationSegment, length: number, width: number): Map<PlayerId, PlayerStart> {
  const starts = new Map<PlayerId, PlayerStart>()
  const fromById = new Map(segment.from.players.map((p) => [p.playerId, p]))
  const substitutedOut = new Map(segment.substitutions.map((s) => [s.playerInId, s.playerOutId]))
  for (const player of segment.to.players) {
    let source: PresentationPlayer | undefined = fromById.get(player.playerId)
    if (source === undefined) {
      const outgoing = substitutedOut.get(player.playerId)
      source = outgoing === undefined ? undefined : fromById.get(outgoing)
    }
    const pos = toMeters((source ?? player).position, length, width)
    starts.set(player.playerId, { pos, isOffense: (source ?? player).isOffense })
  }
  return starts
}

function buildMotions(segment: PresentationSegment, length: number, width: number): Map<PlayerId, PlayerMotion> {
  const starts = startPositions(segment, length, width)
  const motions = new Map<PlayerId, PlayerMotion>()
  // Defenders that are also offense-of-the-new-possession are still "defense" during this segment's movement.
  const defenders = new Set(segment.from.players.filter((p) => !p.isOffense).map((p) => p.playerId))
  for (const player of segment.to.players) {
    const start = starts.get(player.playerId)!
    const to = toMeters(player.position, length, width)
    const distance = dist(start.pos, to)
    let goMs = 0
    let delayMs = 0
    if (distance > 0.05) {
      const simSpeed = segment.simSeconds > 0 ? distance / segment.simSeconds : SEGMENT_TIMING.maxMeanSpeedMps
      const speed = clamp(simSpeed, SEGMENT_TIMING.minMeanSpeedMps, SEGMENT_TIMING.maxMeanSpeedMps)
      goMs = (distance / speed) * 1000
      const h = hash01(String(player.playerId))
      delayMs = defenders.has(player.playerId)
        ? SEGMENT_TIMING.reactionDefenseMinMs + h * (SEGMENT_TIMING.reactionDefenseMaxMs - SEGMENT_TIMING.reactionDefenseMinMs)
        : h * SEGMENT_TIMING.reactionOffenseMaxMs
    }
    motions.set(player.playerId, { playerId: player.playerId, from: start.pos, to, distance, delayMs, goMs })
  }
  return motions
}

/** Player position at `tMs` under a plan (metres). Exported for tests and the truth overlay. */
export function playerPositionAt(motion: PlayerMotion, tMs: number): Pt {
  if (motion.goMs <= 0) return motion.to
  const f = motionFraction(tMs - motion.delayMs, motion.goMs)
  return lerpPt(motion.from, motion.to, f)
}

interface LegBuilder {
  legs: BallLeg[]
  beats: PlanBeat[]
  score: { atMs: number; home: number; away: number }[]
  cursor: number
}

function push(builder: LegBuilder, leg: Omit<BallLeg, 'startMs' | 'endMs'> & { durationMs: number }): BallLeg {
  const { durationMs, ...rest } = leg
  const full: BallLeg = { ...rest, startMs: builder.cursor, endMs: builder.cursor + durationMs }
  builder.legs.push(full)
  builder.cursor += durationMs
  return full
}

export function buildSegmentPlan(segment: PresentationSegment, context: { readonly previousRestingBall?: Pt } = {}): SegmentPlan {
  const { lengthMeters: length, widthMeters: width } = segment.to.court
  const rim = toMeters(segment.attackedBasket, length, width)
  const towardBaseline = rim.x > length / 2 ? 1 : -1
  const floorUnderRim: Pt = { x: rim.x + towardBaseline * 0.55, y: rim.y }
  const motions = buildMotions(segment, length, width)

  const fromBall = context.previousRestingBall ?? toMeters(segment.from.ball.position, length, width)
  // A substitute inherits the ball (and the spot) of the player he replaces: no flight is drawn for that.
  const substituteFor = new Map(segment.substitutions.map((s) => [s.playerOutId, s.playerInId]))
  const inheritOwner = (id: PlayerId | undefined): PlayerId | undefined => (id === undefined ? undefined : (substituteFor.get(id) ?? id))
  const fromOwner = inheritOwner(segment.from.ball.ownerPlayerId)
  const toOwner = segment.to.ball.ownerPlayerId
  const startOwner = fromOwner ?? segment.actorPlayerId ?? toOwner
  const ownerStart = startOwner === undefined ? undefined : motions.get(startOwner)?.from

  const builder: LegBuilder = { legs: [], beats: [], score: [], cursor: 0 }

  // Lead-in: the engine gave the ball to a player who was not holding it (made basket, turnover,
  // free throws, loose ball). Show it travelling from where it was left to that player.
  let leadMs = 0
  if (fromOwner === undefined && startOwner !== undefined && ownerStart !== undefined) {
    const d = dist(fromBall, ownerStart)
    if (d > 0.6) {
      leadMs = clamp((d / SEGMENT_TIMING.pickupSpeedMps) * 1000, SEGMENT_TIMING.pickupMinMs, SEGMENT_TIMING.pickupMaxMs)
      const inbound = segment.previousEnding === 'madeShot' || segment.previousEnding === 'freeThrow' || segment.previousEnding === 'periodStart'
      push(builder, {
        kind: 'pickup',
        from: { kind: 'pt', p: fromBall },
        to: { kind: 'player', id: startOwner },
        arc: 0.25,
        owner: undefined,
        state: inbound ? 'inbound' : 'reboundLoose',
        label: inbound ? 'INBOUND' : 'LOOSE BALL',
        durationMs: leadMs,
      })
      builder.beats.push({ atMs: 0, kind: 'inbound', label: inbound ? 'INBOUND' : 'LOOSE BALL RECOVERED', event: undefined })
    }
  }

  // Movement phase length: the slowest player's (reaction + travel) time.
  let moveMs = 0
  for (const motion of motions.values()) moveMs = Math.max(moveMs, motion.goMs > 0 ? motion.delayMs + motion.goMs : 0)
  moveMs = Math.max(moveMs, leadMs)

  // Carry leg while the players move. The ball follows the holder's rendered position.
  const carryOwner = startOwner
  if (moveMs > builder.cursor) {
    push(builder, {
      kind: 'carry',
      from: carryOwner === undefined ? { kind: 'pt', p: fromBall } : { kind: 'player', id: carryOwner },
      to: carryOwner === undefined ? { kind: 'pt', p: fromBall } : { kind: 'player', id: carryOwner },
      arc: 0,
      owner: carryOwner,
      state: carryOwner === undefined ? 'unassigned' : 'held',
      label: carryOwner === undefined ? 'BALL AT REST' : 'CARRY',
      durationMs: moveMs - builder.cursor,
    })
  }
  builder.cursor = Math.max(builder.cursor, moveMs)

  let currentOwner: PlayerId | undefined = carryOwner
  let scoreHome = segment.from.score.home
  let scoreAway = segment.from.score.away
  const setScore = (event: MatchPresentationEvent, atMs: number): void => {
    scoreHome = event.homeScore
    scoreAway = event.awayScore
    builder.score.push({ atMs, home: scoreHome, away: scoreAway })
  }
  const endPosOf = (id: PlayerId | undefined): Pt | undefined => (id === undefined ? undefined : motions.get(id)?.to)
  let lastLegEndRef: BallRef = carryOwner === undefined ? { kind: 'pt', p: fromBall } : { kind: 'player', id: carryOwner }
  let lastShotBlockPoint: Pt | undefined

  const ensureHolding = (): void => {
    if (currentOwner !== undefined) {
      // A brief hold before each new action so the ball is visibly held, then acted on.
      lastLegEndRef = { kind: 'player', id: currentOwner }
    }
  }
  ensureHolding()

  const flightDuration = (a: Pt, b: Pt, speed: number, min: number, max: number): number => clamp((dist(a, b) / speed) * 1000, min, max)

  for (const event of segment.events) {
    switch (event.kind) {
      case 'substitution':
        builder.beats.push({ atMs: 0, kind: 'substitution', label: 'SUBSTITUTION', event })
        break
      case 'periodEnd':
        builder.beats.push({ atMs: builder.cursor, kind: 'periodEnd', label: 'END OF PERIOD', event })
        break
      case 'periodStart':
        builder.beats.push({ atMs: builder.cursor, kind: 'periodStart', label: 'START OF PERIOD', event })
        break
      case 'gameEnd':
        builder.beats.push({ atMs: builder.cursor, kind: 'periodEnd', label: 'GAME OVER', event })
        break
      case 'foul': {
        builder.beats.push({ atMs: builder.cursor, kind: 'foul', label: 'SHOOTING FOUL', event })
        push(builder, {
          kind: 'hold',
          from: lastLegEndRef,
          to: lastLegEndRef,
          arc: 0,
          owner: currentOwner,
          state: currentOwner === undefined ? 'deadBall' : 'held',
          label: 'FOUL — DEAD BALL',
          durationMs: SEGMENT_TIMING.foulPauseMs,
        })
        break
      }
      case 'freeThrowMade':
      case 'freeThrowMissed': {
        const shooter = event.playerId ?? currentOwner
        const shooterEnd = endPosOf(shooter) ?? rim
        if (lastLegEndRef.kind === 'floorUnderRim' || lastLegEndRef.kind === 'rim') {
          // Second free throw: the ball comes back to the shooter (never appears in his hands by magic).
          push(builder, {
            kind: 'pass',
            from: lastLegEndRef,
            to: shooter === undefined ? { kind: 'pt', p: shooterEnd } : { kind: 'player', id: shooter },
            arc: 0.2,
            owner: undefined,
            state: 'passFlight',
            label: 'BALL BACK TO SHOOTER',
            durationMs: clamp((dist(shooterEnd, rim) / SEGMENT_TIMING.pickupSpeedMps) * 1000, SEGMENT_TIMING.pickupMinMs, SEGMENT_TIMING.pickupMaxMs),
          })
        }
        const ft = push(builder, {
          kind: 'freeThrow',
          from: shooter === undefined ? { kind: 'pt', p: shooterEnd } : { kind: 'player', id: shooter },
          to: { kind: 'rim' },
          arc: 0.8,
          owner: undefined,
          state: 'shotFlight',
          label: event.kind === 'freeThrowMade' ? 'FREE THROW (made)' : 'FREE THROW (missed)',
          durationMs: SEGMENT_TIMING.freeThrowMs,
        })
        builder.beats.push({ atMs: ft.endMs, kind: 'freeThrow', label: event.kind === 'freeThrowMade' ? 'FT MADE' : 'FT MISSED', event })
        setScore(event, ft.endMs)
        push(builder, {
          kind: 'netDrop',
          from: { kind: 'rim' },
          to: { kind: 'floorUnderRim' },
          arc: 0,
          owner: undefined,
          state: 'deadBall',
          label: event.kind === 'freeThrowMade' ? 'THROUGH THE NET' : 'OFF THE RIM',
          durationMs: SEGMENT_TIMING.netDropMs,
        })
        currentOwner = undefined
        lastLegEndRef = { kind: 'floorUnderRim' }
        break
      }
      case 'passCompleted': {
        const passer = event.playerId
        const receiver = event.secondaryPlayerId
        if (passer === undefined || receiver === undefined) break
        const a = endPosOf(passer) ?? rim
        const b = endPosOf(receiver) ?? rim
        const leg = push(builder, {
          kind: 'pass',
          from: { kind: 'player', id: passer },
          to: { kind: 'player', id: receiver },
          arc: PASS_ARC_METERS / SHOT_ARC_METERS,
          owner: undefined,
          state: 'passFlight',
          label: 'PASS',
          durationMs: flightDuration(a, b, SEGMENT_TIMING.passSpeedMps, SEGMENT_TIMING.passMinMs, SEGMENT_TIMING.passMaxMs),
        })
        builder.beats.push({ atMs: leg.startMs, kind: 'passRelease', label: 'PASS RELEASE', event })
        builder.beats.push({ atMs: leg.endMs, kind: 'catch', label: 'CATCH', event: undefined })
        currentOwner = receiver
        lastLegEndRef = { kind: 'player', id: receiver }
        break
      }
      case 'turnover': {
        const handler = event.playerId
        const stealer = event.secondaryPlayerId
        const target = event.passTargetPlayerId
        const handlerEnd = endPosOf(handler) ?? rim
        if (stealer !== undefined) {
          const leg = push(builder, {
            kind: 'steal',
            from: handler === undefined ? lastLegEndRef : { kind: 'player', id: handler },
            to: { kind: 'player', id: stealer },
            arc: target === undefined ? 0.05 : PASS_ARC_METERS / SHOT_ARC_METERS,
            owner: undefined,
            state: 'passFlight',
            label: target === undefined ? 'STRIP' : 'INTERCEPTION',
            durationMs: clamp((dist(handlerEnd, endPosOf(stealer) ?? handlerEnd) / SEGMENT_TIMING.stealSpeedMps) * 1000, SEGMENT_TIMING.stealMs, SEGMENT_TIMING.stealMaxMs),
          })
          builder.beats.push({ atMs: leg.endMs, kind: 'turnover', label: target === undefined ? 'STEAL' : 'INTERCEPTION', event })
          currentOwner = stealer
          lastLegEndRef = { kind: 'player', id: stealer }
        } else {
          const targetEnd = target === undefined ? undefined : endPosOf(target)
          const restPoint = targetEnd === undefined ? handlerEnd : lerpPt(handlerEnd, targetEnd, 0.7)
          const leg = push(builder, {
            kind: 'badPass',
            from: handler === undefined ? lastLegEndRef : { kind: 'player', id: handler },
            to: { kind: 'pt', p: restPoint },
            arc: targetEnd === undefined ? 0 : PASS_ARC_METERS / SHOT_ARC_METERS,
            owner: undefined,
            state: 'deadBall',
            label: targetEnd === undefined ? 'BALL LOST' : 'BAD PASS',
            durationMs: SEGMENT_TIMING.badPassMs,
          })
          builder.beats.push({ atMs: leg.endMs, kind: 'turnover', label: 'TURNOVER', event })
          currentOwner = undefined
          lastLegEndRef = { kind: 'pt', p: restPoint }
        }
        break
      }
      case 'shotMade':
      case 'shotMissed': {
        const shooter = event.playerId ?? currentOwner
        const shooterEnd = endPosOf(shooter) ?? rim
        const blocked = event.kind === 'shotMissed' && event.blocked === true
        const target: Pt = blocked ? lerpPt(shooterEnd, rim, 0.3) : rim
        const dur = flightDuration(shooterEnd, target, SEGMENT_TIMING.shotSpeedMps, SEGMENT_TIMING.shotMinMs, SEGMENT_TIMING.shotMaxMs)
        const leg = push(builder, {
          kind: 'shot',
          from: shooter === undefined ? lastLegEndRef : { kind: 'player', id: shooter },
          to: blocked ? { kind: 'pt', p: target } : { kind: 'rim' },
          arc: blocked ? 0.35 : 1,
          owner: undefined,
          state: 'shotFlight',
          label: event.kind === 'shotMade' ? `SHOT (${event.shotZone ?? '?'})` : `SHOT (${event.shotZone ?? '?'}) — will miss`,
          durationMs: dur,
        })
        builder.beats.push({ atMs: leg.startMs, kind: 'shotRelease', label: 'SHOT RELEASE', event: undefined })
        builder.beats.push({ atMs: leg.endMs, kind: blocked ? 'rim' : 'rim', label: blocked ? 'BLOCKED' : 'AT THE RIM', event: undefined })
        if (event.kind === 'shotMade') {
          builder.beats.push({ atMs: leg.endMs, kind: 'shotMade', label: `SHOT MADE +${event.points ?? 2}`, event })
          setScore(event, leg.endMs)
          push(builder, {
            kind: 'netDrop',
            from: { kind: 'rim' },
            to: { kind: 'floorUnderRim' },
            arc: 0,
            owner: undefined,
            state: 'deadBall',
            label: 'THROUGH THE NET',
            durationMs: SEGMENT_TIMING.netDropMs,
          })
          lastLegEndRef = { kind: 'floorUnderRim' }
        } else {
          builder.beats.push({ atMs: leg.endMs, kind: 'shotMissed', label: blocked ? 'SHOT BLOCKED' : 'SHOT MISSED', event })
          lastLegEndRef = blocked ? { kind: 'pt', p: target } : { kind: 'rim' }
          lastShotBlockPoint = blocked ? target : undefined
        }
        currentOwner = undefined
        break
      }
      case 'rebound': {
        const rebounder = event.playerId
        if (rebounder === undefined) break
        const start = lastShotBlockPoint ?? rim
        const b = endPosOf(rebounder) ?? rim
        const leg = push(builder, {
          kind: 'reboundFlight',
          from: lastLegEndRef,
          to: { kind: 'player', id: rebounder },
          arc: REBOUND_ARC_METERS / SHOT_ARC_METERS,
          owner: undefined,
          state: 'reboundLoose',
          label: event.reboundType === 'offensive' ? 'OFFENSIVE REBOUND' : 'DEFENSIVE REBOUND',
          durationMs: flightDuration(start, b, SEGMENT_TIMING.reboundSpeedMps, SEGMENT_TIMING.reboundMinMs, SEGMENT_TIMING.reboundMaxMs),
        })
        builder.beats.push({ atMs: leg.endMs, kind: 'rebound', label: event.reboundType === 'offensive' ? 'OFFENSIVE REBOUND' : 'DEFENSIVE REBOUND', event })
        currentOwner = rebounder
        lastLegEndRef = { kind: 'player', id: rebounder }
        lastShotBlockPoint = undefined
        break
      }
      default:
    }
  }

  // Ownership without an event (handoff): the engine moved the ball to a teammate during the step.
  if (toOwner !== undefined && currentOwner !== toOwner) {
    if (currentOwner !== undefined && segment.events.every((e) => e.kind === 'substitution' || e.kind === 'periodStart' || e.kind === 'periodEnd')) {
      const leg = push(builder, {
        kind: 'handoff',
        from: { kind: 'player', id: currentOwner },
        to: { kind: 'player', id: toOwner },
        arc: 0.05,
        owner: undefined,
        state: 'passFlight',
        label: 'HANDOFF',
        durationMs: SEGMENT_TIMING.handoffMs,
      })
      builder.beats.push({ atMs: leg.endMs, kind: 'handoff', label: 'HANDOFF', event: undefined })
      currentOwner = toOwner
    } else if (currentOwner === undefined && lastLegEndRef.kind !== 'player') {
      // Loose ball ends in a player's hands with no event to explain it: show a quick recovery.
      push(builder, {
        kind: 'pickup',
        from: lastLegEndRef,
        to: { kind: 'player', id: toOwner },
        arc: 0.2,
        owner: undefined,
        state: 'reboundLoose',
        label: 'BALL RECOVERED',
        durationMs: SEGMENT_TIMING.pickupMinMs,
      })
      currentOwner = toOwner
    }
  }

  // Final: hold the last state briefly (catch settle) so consecutive actions read as separate beats.
  const finalOwner = currentOwner
  push(builder, {
    kind: 'hold',
    from: finalOwner === undefined ? lastLegEndRef : { kind: 'player', id: finalOwner },
    to: finalOwner === undefined ? lastLegEndRef : { kind: 'player', id: finalOwner },
    arc: 0,
    owner: finalOwner,
    state: finalOwner === undefined ? 'deadBall' : 'held',
    label: 'SETTLE',
    durationMs: SEGMENT_TIMING.settleMs,
  })

  const plan: SegmentPlan = {
    segment,
    courtLength: length,
    courtWidth: width,
    rim,
    floorUnderRim,
    leadMs,
    moveMs,
    durationMs: builder.cursor,
    motions,
    legs: builder.legs,
    beats: builder.beats.sort((a, b) => a.atMs - b.atMs),
    scoreTimeline: builder.score,
    restingBall: { x: 0, y: 0 },
  }
  const resting = resolveBallAt(plan, plan.durationMs).position
  return { ...plan, restingBall: resting }
}

export interface ResolvedBall {
  readonly position: Pt
  readonly heightMeters: number
  readonly leg: BallLeg
  readonly owner: PlayerId | undefined
  readonly state: PresentationBallState
}

function resolveRef(plan: SegmentPlan, ref: BallRef, tMs: number): Pt {
  switch (ref.kind) {
    case 'pt':
      return ref.p
    case 'rim':
      return plan.rim
    case 'floorUnderRim':
      return plan.floorUnderRim
    case 'player': {
      const motion = plan.motions.get(ref.id)
      if (motion === undefined) return plan.rim
      const p = playerPositionAt(motion, tMs)
      return p
    }
  }
}

/** Distance the ball is drawn ahead of its holder, in the holder's direction of travel (metres). */
const CARRY_OFFSET_METERS = 0.55

export function resolveBallAt(plan: SegmentPlan, tMs: number): ResolvedBall {
  const t = clamp(tMs, 0, plan.durationMs)
  let leg = plan.legs.find((l) => t >= l.startMs && t < l.endMs)
  if (leg === undefined) leg = plan.legs[plan.legs.length - 1]!
  const span = Math.max(1, leg.endMs - leg.startMs)
  const u = clamp((t - leg.startMs) / span, 0, 1)
  const a = resolveRef(plan, leg.from, t)
  const b = resolveRef(plan, leg.to, t)
  let position: Pt
  let height = 0
  let state: PresentationBallState = leg.state
  const owner = leg.owner
  if (leg.kind === 'carry' || leg.kind === 'hold') {
    position = a
    if (leg.owner !== undefined) {
      const motion = plan.motions.get(leg.owner)
      const dx = motion === undefined ? 0 : motion.to.x - motion.from.x
      const dy = motion === undefined ? 0 : motion.to.y - motion.from.y
      const len = Math.hypot(dx, dy)
      const local = motion === undefined ? 0 : t - motion.delayMs
      const moving = motion !== undefined && motion.goMs > 0 && local > 0 && local < motion.goMs
      if (moving && motion !== undefined && len > 1e-6) {
        // The ball leads the body only while it is really moving, and eases in/out with the body's speed.
        const lead = Math.min(1, motionSpeedFactor(local, motion.goMs) / 1.1) * Math.min(1, (t - leg.startMs) / 220)
        position = { x: a.x + (dx / len) * CARRY_OFFSET_METERS * lead, y: a.y + (dy / len) * CARRY_OFFSET_METERS * lead }
        // Dribble: ~2.2 bounces per second, low arc.
        const phase = (t / 1000) * 2.2 * Math.PI
        height = Math.abs(Math.sin(phase)) * 0.45
        state = 'dribble'
      } else {
        state = 'held'
      }
    }
    if (leg.kind === 'hold' && leg.owner === undefined) state = leg.state
  } else {
    const eased = leg.kind === 'shot' || leg.kind === 'freeThrow' ? u : leg.kind === 'netDrop' ? u * u : u
    position = lerpPt(a, b, eased)
    const arcMeters = leg.kind === 'shot' || leg.kind === 'freeThrow' ? SHOT_ARC_METERS : leg.kind === 'reboundFlight' ? REBOUND_ARC_METERS : PASS_ARC_METERS
    if (leg.kind === 'netDrop') {
      // Falls from rim height to the floor.
      height = 3.05 * (1 - u * u) * 0.45
    } else if (leg.kind === 'shot' || leg.kind === 'freeThrow' || leg.kind === 'reboundFlight' || leg.kind === 'pass' || leg.kind === 'steal' || leg.kind === 'badPass' || leg.kind === 'pickup' || leg.kind === 'handoff') {
      height = Math.sin(Math.PI * u) * arcMeters * leg.arc
    }
  }
  // Right after a flight ends in a player's hands, label it a catch for a moment.
  if ((leg.kind === 'carry' || leg.kind === 'hold') && leg.owner !== undefined) {
    const idx = plan.legs.indexOf(leg)
    const prev = idx > 0 ? plan.legs[idx - 1] : undefined
    if (prev !== undefined && (prev.kind === 'pass' || prev.kind === 'reboundFlight' || prev.kind === 'steal' || prev.kind === 'handoff' || prev.kind === 'pickup') && t - leg.startMs < SEGMENT_TIMING.catchMs) {
      state = 'catch'
    }
  }
  return { position, heightMeters: height, leg, owner, state }
}

/** True while the wall-clock time falls inside the movement phase (players still travelling). */
export function isMovementPhase(plan: SegmentPlan, tMs: number): boolean {
  return tMs < plan.moveMs
}

export function displayClockAt(plan: SegmentPlan, tMs: number): number {
  const { from, to } = plan.segment
  if (from.clock.period !== to.clock.period) return to.clock.clockSecondsRemaining
  if (plan.moveMs <= 0) return tMs >= plan.durationMs ? to.clock.clockSecondsRemaining : from.clock.clockSecondsRemaining
  const f = clamp(tMs / plan.moveMs, 0, 1)
  return from.clock.clockSecondsRemaining + (to.clock.clockSecondsRemaining - from.clock.clockSecondsRemaining) * f
}

export function displayScoreAt(plan: SegmentPlan, tMs: number): { home: number; away: number } {
  let score = { home: plan.segment.from.score.home, away: plan.segment.from.score.away }
  for (const entry of plan.scoreTimeline) {
    if (tMs >= entry.atMs) score = { home: entry.home, away: entry.away }
  }
  return score
}

/** Convenience for tests: the presentation state's end positions in metres, keyed by player. */
export function endPositions(state: MatchPresentationState): Map<PlayerId, Pt> {
  return new Map(state.players.map((p) => [p.playerId, toMeters(p.position, state.court.lengthMeters, state.court.widthMeters)]))
}
