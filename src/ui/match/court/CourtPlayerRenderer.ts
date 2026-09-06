import type { CourtProjection } from './CourtProjection'
import {
  COURT_PLAYER_VISUAL,
  resolvePlayerFloorState,
  type CourtDynamicPlayer,
  type CourtPoint2,
} from './CourtEntityTypes'
import { getPlayerVisualScale } from './CourtPlayerScale'

export function courtPercentToMetres(
  xPercent: number,
  yPercent: number,
  projection: CourtProjection,
): CourtPoint2 {
  return {
    x: (xPercent / 100) * projection.regulation.length,
    y: (yPercent / 100) * projection.regulation.width,
  }
}

/** @deprecated Prefer getPlayerVisualScale */
export function depthScaleForCourtY(courtY: number, projection: CourtProjection): number {
  return getPlayerVisualScale({ x: 0, y: courtY }, projection)
}

export function sortPlayersByScreenDepth<T extends { readonly screenY: number }>(
  players: readonly T[],
): T[] {
  return [...players].sort((a, b) => a.screenY - b.screenY)
}

export function drawPlayerShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
): void {
  const V = COURT_PLAYER_VISUAL
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(
    screenX + 0.5 * scale,
    screenY + 1.4 * scale,
    V.SHADOW_RX * scale,
    V.SHADOW_RY * scale,
    0,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()
}

export function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
): void {
  const V = COURT_PLAYER_VISUAL
  ctx.save()
  ctx.strokeStyle = 'rgba(45, 216, 255, 0.95)'
  ctx.lineWidth = Math.max(1.6, 1.8 * scale)
  ctx.beginPath()
  ctx.ellipse(
    screenX,
    screenY + 1.2 * scale,
    V.SELECTION_RX * scale,
    V.SELECTION_RY * scale,
    0,
    0,
    Math.PI * 2,
  )
  ctx.stroke()
  ctx.restore()
}

export function drawPossessionRing(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
): void {
  const V = COURT_PLAYER_VISUAL
  ctx.save()
  ctx.strokeStyle = 'rgba(45, 216, 255, 0.4)'
  ctx.lineWidth = Math.max(1.2, 1.3 * scale)
  ctx.beginPath()
  ctx.ellipse(
    screenX,
    screenY + 1.2 * scale,
    V.POSSESSION_RX * scale,
    V.POSSESSION_RY * scale,
    0,
    0.1 * Math.PI,
    0.9 * Math.PI,
  )
  ctx.stroke()
  ctx.restore()
}

export function drawPlayerFloorIndicators(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
  hasBall: boolean,
  selected: boolean,
): void {
  const state = resolvePlayerFloorState(hasBall, selected)
  if (state === 'selected' || state === 'both') drawSelectionRing(ctx, screenX, screenY, scale)
  if (state === 'possession' || state === 'both') drawPossessionRing(ctx, screenX, screenY, scale)
}

/**
 * Football Manager-style circular token: fill + rim + centered jersey.
 * Facing is unused for body (kept for ball side offset upstream).
 */
export function drawCourtPlayerToken(
  ctx: CanvasRenderingContext2D,
  player: CourtDynamicPlayer,
  screenX: number,
  screenY: number,
  scale: number,
): void {
  const V = COURT_PLAYER_VISUAL
  const r = V.RADIUS * scale
  const kit = player.kit

  ctx.save()
  ctx.beginPath()
  ctx.arc(screenX, screenY, r, 0, Math.PI * 2)
  const fillGrad = ctx.createRadialGradient(
    screenX - r * 0.28,
    screenY - r * 0.32,
    r * 0.1,
    screenX,
    screenY,
    r,
  )
  fillGrad.addColorStop(0, kit.primary)
  fillGrad.addColorStop(0.55, kit.primary)
  fillGrad.addColorStop(1, kit.shorts || kit.primary)
  ctx.fillStyle = fillGrad
  ctx.fill()
  ctx.lineWidth = Math.max(1.2, V.BORDER * scale)
  ctx.strokeStyle = kit.bodyOutline
  ctx.stroke()

  // Soft top highlight
  ctx.beginPath()
  ctx.arc(screenX - r * 0.22, screenY - r * 0.28, r * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fill()

  const jersey = String(player.jersey)
  const fontPx = Math.max(9, V.JERSEY_FONT * scale)
  ctx.font = `800 ${fontPx}px "GT America Standard", "Barlow Condensed", ui-sans-serif, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(1.8, 2.2 * scale)
  ctx.strokeStyle = kit.numberOutline
  ctx.strokeText(jersey, screenX, screenY + 0.4 * scale)
  ctx.fillStyle = kit.number
  ctx.fillText(jersey, screenX, screenY + 0.4 * scale)
  ctx.restore()
}

/** Last-name label under the token (drawn after tokens so it stays readable). */
export function drawCourtPlayerName(
  ctx: CanvasRenderingContext2D,
  player: CourtDynamicPlayer,
  screenX: number,
  screenY: number,
  scale: number,
): void {
  const raw = (player.name ?? '').trim()
  if (raw === '') return
  const V = COURT_PLAYER_VISUAL
  const label = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw
  const fontPx = Math.max(8, V.NAME_FONT * scale)
  const y = screenY + V.RADIUS * scale + fontPx * 0.95 + 2 * scale

  ctx.save()
  ctx.font = `700 ${fontPx}px "GT America Standard", "IBM Plex Sans", ui-sans-serif, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = Math.max(2.4, 2.8 * scale)
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)'
  ctx.strokeText(label.toUpperCase(), screenX, y)
  ctx.fillStyle = 'rgba(236, 242, 248, 0.94)'
  ctx.fillText(label.toUpperCase(), screenX, y)
  ctx.restore()
}

/** @deprecated Alias — tokens replaced human silhouettes. */
export function drawCourtPlayerBody(
  ctx: CanvasRenderingContext2D,
  player: CourtDynamicPlayer,
  screenX: number,
  screenY: number,
  _facing: number,
  scale: number,
): void {
  drawCourtPlayerToken(ctx, player, screenX, screenY, scale)
  drawCourtPlayerName(ctx, player, screenX, screenY, scale)
}

export function drawCourtPlayer(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  player: CourtDynamicPlayer,
  courtPos: CourtPoint2,
  _facing: number,
): { readonly screenX: number; readonly screenY: number; readonly scale: number } {
  const screen = projection.project(courtPos)
  const scale = getPlayerVisualScale(courtPos, projection)
  drawPlayerShadow(ctx, screen.x, screen.y, scale)
  drawPlayerFloorIndicators(ctx, screen.x, screen.y, scale, player.hasBall, player.selected)
  drawCourtPlayerToken(ctx, player, screen.x, screen.y, scale)
  drawCourtPlayerName(ctx, player, screen.x, screen.y, scale)
  return { screenX: screen.x, screenY: screen.y, scale }
}
