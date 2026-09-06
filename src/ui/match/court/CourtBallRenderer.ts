import type { CourtProjection } from './CourtProjection'
import { COURT_BALL_VISUAL, type CourtBallState, type CourtPoint2 } from './CourtEntityTypes'
import { getPlayerVisualScale } from './CourtPlayerScale'

export type BallDrawInput = {
  readonly court: CourtPoint2
  readonly z: number
  readonly state: CourtBallState
}

export function ballScreenPosition(
  projection: CourtProjection,
  court: CourtPoint2,
  z: number,
): { readonly x: number; readonly y: number; readonly shadowX: number; readonly shadowY: number } {
  const floor = projection.project(court)
  const scale = getPlayerVisualScale(court, projection)
  return {
    x: floor.x,
    y: floor.y - z * COURT_BALL_VISUAL.Z_TO_PIXELS * scale,
    shadowX: floor.x,
    shadowY: floor.y,
  }
}

export function drawCourtBall(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  ball: BallDrawInput,
): void {
  const V = COURT_BALL_VISUAL
  const scale = getPlayerVisualScale(ball.court, projection)
  const pos = ballScreenPosition(projection, ball.court, ball.z)
  const lift = Math.min(1, ball.z / 2.2)
  const r = V.RADIUS * scale

  // Shadow on court plane
  ctx.save()
  ctx.fillStyle = `rgba(0,0,0,${0.34 - lift * 0.12})`
  ctx.beginPath()
  ctx.ellipse(
    pos.shadowX + 0.6 * scale,
    pos.shadowY + 1.4 * scale,
    V.SHADOW_RX * scale * (1 + lift * 0.12),
    V.SHADOW_RY * scale * (1 - lift * 0.22),
    0,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(pos.x, pos.y)
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.12, 0, 0, r)
  grad.addColorStop(0, '#ffb86a')
  grad.addColorStop(0.45, '#e87820')
  grad.addColorStop(1, '#a84810')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(40, 16, 4, 0.4)'
  ctx.lineWidth = Math.max(0.8, 0.9 * scale)
  ctx.stroke()

  // Seams
  ctx.strokeStyle = 'rgba(35, 14, 4, 0.62)'
  ctx.lineWidth = Math.max(0.85, 0.95 * scale)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.9, -1.0, 1.0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.88)
  ctx.quadraticCurveTo(r * 0.58, 0, 0, r * 0.88)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.88)
  ctx.quadraticCurveTo(-r * 0.58, 0, 0, r * 0.88)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.beginPath()
  ctx.arc(-r * 0.32, -r * 0.38, r * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Held-ball offset in court-percent space — beside torso along facing. */
export function heldBallOffsetPercent(facing: number): CourtPoint2 {
  const dist = COURT_BALL_VISUAL.HELD_DIST
  // Slightly to the "hand" side (+perpendicular) so ball is not torso-centered
  const side = facing + Math.PI / 2
  return {
    x: Math.cos(facing) * dist * 0.55 + Math.cos(side) * dist * 0.7,
    y: Math.sin(facing) * dist * 0.35 + Math.sin(side) * dist * 0.45,
  }
}
