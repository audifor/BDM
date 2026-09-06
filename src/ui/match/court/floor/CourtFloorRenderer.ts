import type { CourtConfiguration } from '../core/CourtConfiguration'
import type { CourtProjection } from '../CourtProjection'
import { clipToCourtPolygon } from '../CourtProjection'
import { generateFloorTexture } from './CourtTextureGenerator'
import { sampleCirclePoints } from '../CourtMarkingsGeometry'
import { fillCourtPath } from '../CourtProjection'
import { adjustHsl } from '../CourtColorUtils'

export function renderCourtFloor(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const { originX, originY, courtPixelWidth, courtPixelHeight } = projection.viewport
  const parquet = generateFloorTexture(courtPixelWidth, courtPixelHeight, config.floor, config.id)
  const centerX = originX + courtPixelWidth / 2
  const rows = Math.max(1, Math.floor(courtPixelHeight))

  ctx.save()
  clipToCourtPolygon(ctx, projection)
  for (let row = 0; row < rows; row += 1) {
    const v = (row + 0.5) / rows
    const courtY = v * projection.regulation.width
    const band = projection.widthAtY(courtY)
    const srcY = Math.min(parquet.height - 1, Math.floor((row / rows) * parquet.height))
    ctx.drawImage(parquet, 0, srcY, parquet.width, 1, centerX - band / 2, originY + row, band, 1.05)
  }
  renderStainZones(ctx, projection, config)
  drawCourtEdgeDepth(ctx, projection)
  ctx.restore()
}

function renderStainZones(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  config: CourtConfiguration,
): void {
  const r = projection.regulation
  for (const zone of config.floor.stainZones) {
    const color =
      zone.toneDelta < 0
        ? adjustHsl(config.floor.baseTone, { l: zone.toneDelta })
        : adjustHsl(config.floor.baseTone, { l: zone.toneDelta })
    ctx.save()
    ctx.globalAlpha = zone.opacity
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = color
    if (zone.kind === 'CENTER_CIRCLE') {
      fillCourtPath(ctx, projection, sampleCirclePoints({ x: r.length / 2, y: r.width / 2 }, r.circleRadius * 1.15, 64))
    } else if (zone.kind === 'HALF_COURT') {
      fillCourtPath(ctx, projection, [
        { x: 0, y: 0 },
        { x: r.length / 2, y: 0 },
        { x: r.length / 2, y: r.width },
        { x: 0, y: r.width },
      ])
    } else if (zone.kind === 'INSIDE_THREE') {
      fillCourtPath(ctx, projection, sampleCirclePoints({ x: r.length / 2, y: r.width / 2 }, r.threePointRadius * 0.55, 48))
    }
    ctx.restore()
  }
}

function drawCourtEdgeDepth(ctx: CanvasRenderingContext2D, projection: CourtProjection): void {
  const c = projection.courtCorners
  ctx.beginPath()
  ctx.moveTo(c[0]!.x, c[0]!.y)
  for (let i = 1; i < c.length; i += 1) ctx.lineTo(c[i]!.x, c[i]!.y)
  ctx.closePath()
  ctx.strokeStyle = 'rgba(0,0,0,0.34)'
  ctx.lineWidth = 3.5
  ctx.stroke()
}
