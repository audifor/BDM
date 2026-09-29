/**
 * Basketball Truth (BT1D / BT1E) — geometric audit of one canonical frame.
 *
 * Judges REAL geometry (metres), never intent names. Every check is a plain distance/angle test
 * against the canonical positions carried by a TruthFrame, so the same numbers apply whether the
 * frame came from the engine directly or from what the renderer painted.
 */

import type { MetrePoint, TruthFrame, TruthPlayerRow } from './basketballTruth'

export const COURT = { length: 28, width: 15 } as const
const LANE_HALF_WIDTH = 2.45
const LANE_LENGTH = 5.8

export type SpotZone = 'paint' | 'corner' | 'wing' | 'top' | 'baseline' | 'midrange' | 'backcourt'

function dist(a: MetrePoint, b: MetrePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Distance from point p to segment a-b. */
export function distanceToSegment(p: MetrePoint, a: MetrePoint, b: MetrePoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Distance along the attack axis from the attacked baseline (0 at the baseline being attacked). */
function depthFromAttackedBaseline(p: MetrePoint, basket: MetrePoint): number {
  return basket.x > COURT.length / 2 ? COURT.length - p.x : p.x
}

export function isInPaint(p: MetrePoint, basket: MetrePoint): boolean {
  return depthFromAttackedBaseline(p, basket) <= LANE_LENGTH && Math.abs(p.y - COURT.width / 2) <= LANE_HALF_WIDTH
}

export function classifySpot(p: MetrePoint, basket: MetrePoint): SpotZone {
  const depth = depthFromAttackedBaseline(p, basket)
  if (depth > COURT.length / 2) return 'backcourt'
  if (isInPaint(p, basket)) return 'paint'
  const lateral = Math.abs(p.y - COURT.width / 2)
  if (depth <= 5.8 && lateral > 5.2) return 'corner'
  const d = dist(p, basket)
  if (d < 6.75) return lateral > 4 && depth < 5.8 ? 'baseline' : 'midrange'
  const angleFromCenter = Math.atan2(lateral, Math.max(0.01, dist({ x: p.x, y: basket.y }, basket)))
  return angleFromCenter > 0.55 ? 'wing' : 'top'
}

export interface OffensiveSpacingAudit {
  readonly applicable: boolean
  readonly minPairDistance: number
  readonly meanPairDistance: number
  readonly clumpedPairs: number
  readonly paintOccupants: number
  readonly zones: Readonly<Record<SpotZone, number>>
  readonly strongSide: number
  readonly weakSide: number
  readonly cornersOccupied: number
  readonly ballHandlerToBasket: number
  readonly openPassingLanes: number
  readonly driveLaneBlockedByTeammate: boolean
  readonly driveLaneOpen: boolean
  readonly flags: readonly string[]
}

export interface DefensiveGeometryAudit {
  readonly applicable: boolean
  readonly onBallDefenderDistance: number | undefined
  readonly ballPressure: boolean
  readonly goalSideCount: number
  readonly defendersInPaint: number
  readonly weakSideHelpers: number
  readonly meanDistanceToAssignedMan: number
  readonly maxDistanceToAssignedMan: number
  readonly ballSideOverloadDefenders: number
  readonly structureScore: number
  readonly flags: readonly string[]
}

function emptyZones(): Record<SpotZone, number> {
  return { paint: 0, corner: 0, wing: 0, top: 0, baseline: 0, midrange: 0, backcourt: 0 }
}

function cx(p: TruthPlayerRow): MetrePoint {
  return p.canonical
}

/** A frame is "half-court set offense" when the handler owns the ball in the attacking half and no transition is running. */
export function isHalfCourtSet(frame: TruthFrame): boolean {
  if (frame.ball.owner === undefined) return false
  if (frame.phaseTags.includes('transitionOffense') || frame.phaseTags.includes('inbound')) return false
  const handler = frame.players.find((p) => p.playerId === frame.ball.owner)
  if (handler === undefined) return false
  return depthFromAttackedBaseline(handler.canonical, frame.attackingBasket) <= COURT.length / 2
}

export function auditOffensiveSpacing(frame: TruthFrame): OffensiveSpacingAudit {
  const offense = frame.players.filter((p) => p.isOffense)
  const defense = frame.players.filter((p) => !p.isOffense)
  const basket = frame.attackingBasket
  const applicable = isHalfCourtSet(frame)
  const zones = emptyZones()
  const flags: string[] = []
  let min = Infinity
  let sum = 0
  let pairs = 0
  let clumped = 0
  for (let i = 0; i < offense.length; i += 1) {
    zones[classifySpot(cx(offense[i]!), basket)] += 1
    for (let j = i + 1; j < offense.length; j += 1) {
      const d = dist(cx(offense[i]!), cx(offense[j]!))
      min = Math.min(min, d)
      sum += d
      pairs += 1
      if (d < 2.5) clumped += 1
    }
  }
  const handler = offense.find((p) => p.playerId === frame.ball.owner)
  const handlerPos = handler?.canonical
  const handlerSide = handlerPos === undefined ? 0 : Math.sign(handlerPos.y - COURT.width / 2)
  let strong = 0
  let weak = 0
  for (const p of offense) {
    if (p === handler) continue
    const s = Math.sign(p.canonical.y - COURT.width / 2)
    if (s === handlerSide) strong += 1
    else weak += 1
  }
  const paintOccupants = offense.filter((p) => isInPaint(cx(p), basket)).length
  const cornersOccupied = offense.filter((p) => classifySpot(cx(p), basket) === 'corner').length
  let openLanes = 0
  let driveBlockedByTeammate = false
  let driveLaneOpen = true
  if (handlerPos !== undefined) {
    for (const mate of offense) {
      if (mate === handler) continue
      const blocked = defense.some((d) => distanceToSegment(cx(d), handlerPos, mate.canonical) < 1.0)
      if (!blocked) openLanes += 1
    }
    driveBlockedByTeammate = offense.some((mate) => mate !== handler && distanceToSegment(mate.canonical, handlerPos, basket) < 1.3 && dist(mate.canonical, basket) < dist(handlerPos, basket))
    driveLaneOpen = !defense.some((d) => distanceToSegment(cx(d), handlerPos, basket) < 1.3 && dist(cx(d), basket) < dist(handlerPos, basket))
  }
  if (applicable) {
    if (clumped >= 2) flags.push('CLUMPED_ATTACKERS')
    if (paintOccupants >= 3) flags.push('PAINT_CONGESTION')
    if (paintOccupants === 0 && zones.paint === 0 && offense.every((p) => dist(cx(p), basket) > 5)) flags.push('NO_INTERIOR_PRESENCE')
    if (weak === 0 || strong === 0) flags.push('ONE_SIDED_SPACING')
    if (cornersOccupied === 0) flags.push('CORNERS_EMPTY')
    if (driveBlockedByTeammate) flags.push('DRIVE_LANE_BLOCKED_BY_TEAMMATE')
    if (openLanes <= 1) flags.push('FEW_PASSING_LANES')
    if (min < 1.6) flags.push('OVERLAPPING_ATTACKERS')
  }
  return {
    applicable,
    minPairDistance: Number.isFinite(min) ? min : 0,
    meanPairDistance: pairs > 0 ? sum / pairs : 0,
    clumpedPairs: clumped,
    paintOccupants,
    zones,
    strongSide: strong,
    weakSide: weak,
    cornersOccupied,
    ballHandlerToBasket: handlerPos === undefined ? 0 : dist(handlerPos, basket),
    openPassingLanes: openLanes,
    driveLaneBlockedByTeammate: driveBlockedByTeammate,
    driveLaneOpen,
    flags,
  }
}

export function auditDefensiveGeometry(frame: TruthFrame): DefensiveGeometryAudit {
  const defense = frame.players.filter((p) => !p.isOffense)
  const offense = frame.players.filter((p) => p.isOffense)
  const basket = frame.attackingBasket
  const applicable = isHalfCourtSet(frame)
  const flags: string[] = []
  const handler = offense.find((p) => p.playerId === frame.ball.owner)
  const onBallDefender = handler === undefined ? undefined : defense.find((d) => d.guarding === handler.playerId)
  const onBallDist = handler === undefined || onBallDefender === undefined ? undefined : dist(handler.canonical, onBallDefender.canonical)
  let goalSide = 0
  let paint = 0
  let weakHelpers = 0
  let distSum = 0
  let distMax = 0
  let ballSide = 0
  const handlerSide = handler === undefined ? 0 : Math.sign(handler.canonical.y - COURT.width / 2)
  let structure = 0
  for (const d of defense) {
    const man = offense.find((o) => o.playerId === d.guarding)
    if (man !== undefined) {
      const dm = dist(d.canonical, man.canonical)
      distSum += dm
      distMax = Math.max(distMax, dm)
      if (dist(d.canonical, basket) <= dist(man.canonical, basket) + 0.25) goalSide += 1
      // "sees ball and man": defender within a modest cone of the segment man→ball or man→basket.
      const toBall = handler === undefined ? Infinity : distanceToSegment(d.canonical, man.canonical, handler.canonical)
      const toBasket = distanceToSegment(d.canonical, man.canonical, basket)
      if (Math.min(toBall, toBasket) <= 2.5) structure += 1
    }
    if (isInPaint(d.canonical, basket)) paint += 1
    const side = Math.sign(d.canonical.y - COURT.width / 2)
    if (handler !== undefined && side === handlerSide) ballSide += 1
    else if (dist(d.canonical, basket) < 5.5) weakHelpers += 1
  }
  if (applicable) {
    if (onBallDist !== undefined && onBallDist > 3.5) flags.push('NO_BALL_PRESSURE')
    if (goalSide < 4) flags.push('DEFENDERS_NOT_GOAL_SIDE')
    if (paint === 0) flags.push('PAINT_UNPROTECTED')
    if (paint >= 4) flags.push('DEFENSE_COLLAPSED_IN_PAINT')
    if (distMax > 6) flags.push('DEFENDER_FAR_FROM_MAN')
    if (weakHelpers === 0) flags.push('NO_WEAK_SIDE_HELP')
    if (ballSide === 0) flags.push('NO_BALL_SIDE_DEFENDER')
  }
  return {
    applicable,
    onBallDefenderDistance: onBallDist,
    ballPressure: onBallDist !== undefined && onBallDist <= 2.5,
    goalSideCount: goalSide,
    defendersInPaint: paint,
    weakSideHelpers: weakHelpers,
    meanDistanceToAssignedMan: defense.length > 0 ? distSum / defense.length : 0,
    maxDistanceToAssignedMan: distMax,
    ballSideOverloadDefenders: ballSide,
    structureScore: defense.length > 0 ? structure / defense.length : 0,
    flags,
  }
}
