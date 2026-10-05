import type { CourtGeometry, CourtPosition } from '@/domain/court'
import type { LooseBallState } from './BallState'

export function interpolatePosition(from: CourtPosition, target: CourtPosition, progress: number): CourtPosition {
  const amount = Math.max(0, Math.min(1, progress))
  return { x: from.x + (target.x - from.x) * amount, y: from.y + (target.y - from.y) * amount }
}

export function flightProgress(t: number, releaseT: number, arrivalT: number): number {
  return arrivalT <= releaseT ? 1 : Math.max(0, Math.min(1, (t - releaseT) / (arrivalT - releaseT)))
}

export function passHeight(passKind: 'chest' | 'bounce' | 'lob', progress: number): number {
  const arc = 4 * progress * (1 - progress)
  if (passKind === 'bounce') return Math.max(0.08, 0.08 + 1.05 * arc)
  if (passKind === 'lob') return 0.6 + 2.2 * arc
  return 0.6 + 0.3 * arc
}

export function shotHeight(progress: number): number {
  const arc = 4 * progress * (1 - progress)
  return 0.6 + (3.05 - 0.6) * progress + 2.1 * arc
}

export function looseBallVelocity(from: CourtPosition, target: CourtPosition): CourtPosition {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const magnitude = Math.hypot(dx, dy)
  return magnitude === 0 ? { x: 0, y: 0 } : { x: dx / magnitude * 2, y: dy / magnitude * 2 }
}

/** One deterministic 0.1-second step with linear drag and court-edge clamping. */
export function advanceLooseBall(ball: LooseBallState, court: CourtGeometry): LooseBallState {
  const next = {
    x: ball.position.x + ball.velocity.x * 0.1,
    y: ball.position.y + ball.velocity.y * 0.1,
  }
  const position = {
    x: Math.max(0, Math.min(court.lengthMeters, next.x)),
    y: Math.max(0, Math.min(court.widthMeters, next.y)),
  }
  const hitXEdge = position.x !== next.x
  const hitYEdge = position.y !== next.y
  return {
    ...ball,
    previousPosition: ball.position,
    position,
    heightMeters: Math.max(0.08, ball.heightMeters * 0.88),
    velocity: { x: hitXEdge ? 0 : ball.velocity.x * 0.82, y: hitYEdge ? 0 : ball.velocity.y * 0.82 },
  }
}
