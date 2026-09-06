import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtProjection } from '../CourtProjection'
import { projectMetres } from '../CourtProjection'

function isForbiddenLabel(text: string): boolean {
  const u = text.trim().toUpperCase()
  return u === 'BDM' || u === 'HOME CLUB' || u === 'AWAY CLUB' || u === 'HOME' || u === 'AWAY'
}

function drawMonogram(ctx: CanvasRenderingContext2D, projection: CourtProjection, config: CourtConfiguration): void {
  const branding = config.branding
  if (branding.centerMonogram === null || branding.centerMonogram === '') return
  if (isForbiddenLabel(branding.centerMonogram)) return
  const r = projection.regulation
  const center = projection.project({ x: r.length / 2, y: r.width / 2 })
  const radius = projectMetres(r.circleRadius * branding.centerLogoScale * 0.9, projection, r.width / 2)
  const initials = branding.centerMonogram.slice(0, 3).toUpperCase()

  ctx.save()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.42
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = config.branding.palette.center
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius * 0.92, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.5
  ctx.strokeStyle = 'rgba(30, 22, 12, 0.9)'
  ctx.lineWidth = Math.max(1.2, radius * 0.045)
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius * 0.72, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.35
  ctx.beginPath()
  ctx.moveTo(center.x, center.y - radius * 0.55)
  ctx.lineTo(center.x + radius * 0.42, center.y)
  ctx.lineTo(center.x, center.y + radius * 0.55)
  ctx.lineTo(center.x - radius * 0.42, center.y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.72
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgba(24, 18, 10, 0.92)'
  ctx.font = `800 ${Math.max(13, radius * 0.48)}px "GT America Standard", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, center.x, center.y + 1)
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.5
  ctx.fillStyle = 'rgba(255,248,235,0.55)'
  ctx.font = `800 ${Math.max(13, radius * 0.48)}px "GT America Standard", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, center.x, center.y + 1)
  ctx.restore()
}

function drawLogo(ctx: CanvasRenderingContext2D, projection: CourtProjection, config: CourtConfiguration): void {
  const branding = config.branding
  if (branding.centerMark === null) return
  const r = projection.regulation
  const center = projection.project({ x: r.length / 2, y: r.width / 2 })
  const size = projectMetres(r.circleRadius * 2.15 * branding.centerLogoScale, projection, r.width / 2)
  const x = center.x - size / 2
  const y = center.y - size / 2

  // Soft under-disc so crest reads on parquet
  ctx.save()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.28
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = config.branding.palette.center
  ctx.beginPath()
  ctx.arc(center.x, center.y, size * 0.52, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Painted-in multiply pass
  ctx.save()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.82
  ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(branding.centerMark, x, y, size, size)
  ctx.restore()

  // Readable highlight pass (court paint, not UI sticker)
  ctx.save()
  ctx.globalAlpha = branding.centerLogoOpacity * 0.38
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(branding.centerMark, x, y, size, size)
  ctx.restore()
}

export function renderCourtSurfaceBranding(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  if (config.branding.centerMark !== null) drawLogo(ctx, projection, config)
  else drawMonogram(ctx, projection, config)

  if (config.branding.centerWordmark) {
    const r = projection.regulation
    const c = projection.project({ x: r.length / 2, y: r.width / 2 + r.circleRadius * 0.85 })
    ctx.save()
    ctx.globalAlpha = config.branding.centerLogoOpacity * 0.55
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `700 ${Math.max(8, projectMetres(0.28, projection))}px "GT America Standard", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(config.branding.centerWordmark.toUpperCase().slice(0, 18), c.x, c.y)
    ctx.restore()
  }

  // Floor baseline team names (CASADEMONT ZARAGOZA / UCAM MURCIA) intentionally omitted.
}

export function renderCourtApronBranding(
  _ctx: CanvasRenderingContext2D,
  _projection: CourtProjection,
  _config: CourtConfiguration,
): void {
  // Vertical apron sideline club text intentionally omitted.
}

export function renderCourtBranding(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  renderCourtSurfaceBranding(ctx, projection, config)
  renderCourtApronBranding(ctx, projection, config)
}
